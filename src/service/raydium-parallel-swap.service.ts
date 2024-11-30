import { Injectable, Logger } from '@nestjs/common';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  ApiV3PoolInfoStandardItem,
  AmmV4Keys,
  AmmRpcData,
  TxVersion,
  Raydium,
  parseTokenAccountResp,
  PoolFetchType,
} from '@raydium-io/raydium-sdk-v2';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import * as lod from 'lodash';
import { AppConfigService } from './app-config.service';
import { TokenAmountUtilsService } from './token-amount-utils.service';

interface Token {
  mint: PublicKey;
  symbol?: string;
}

interface SwapInputParams {
  userKeypair: Keypair;
  inputToken: Token;
  outputToken: Token;
  amount: number;
  slippage: number;
}

interface SwapParams
  extends Omit<SwapInputParams, 'inputToken' | 'outputToken'> {
  inputMint: string;
  outputMint: string;
  poolId: string;
}

@Injectable()
export class RaydiumParallelSwapService {
  private readonly logger = new Logger(RaydiumParallelSwapService.name);
  private readonly connection: Connection;
  private readonly BATCH_SIZE = 5;
  private readonly RATE_LIMIT_MS = 500;
  private raydium: Raydium | undefined;

  constructor(
    private readonly config: AppConfigService,
    private readonly tokenAmountUtils: TokenAmountUtilsService,
  ) {
    this.connection = new Connection(
      this.config.rpcUrl,
      this.config.connectionConfig,
    );
  }

  private async initSdk(owner: Keypair, params?: { loadToken?: boolean }) {
    if (this.raydium) return this.raydium;

    if (this.connection.rpcEndpoint.includes('api.mainnet-beta.solana.com')) {
      this.logger.warn(
        'Using free RPC node might cause unexpected errors, strongly suggest using paid RPC node',
      );
    }

    this.logger.log(
      `Connecting to RPC ${this.connection.rpcEndpoint} in ${this.config.isMainnet ? 'mainnet' : 'devnet'}`,
    );

    this.raydium = await Raydium.load({
      owner,
      connection: this.connection,
      cluster: this.config.isMainnet ? 'mainnet' : 'devnet',
      disableFeatureCheck: true,
      disableLoadToken: !params?.loadToken,
      blockhashCommitment: 'finalized',
    });

    await this.updateTokenAccounts(owner);
    this.connection.onAccountChange(owner.publicKey, async () => {
      await this.updateTokenAccounts(owner);
    });

    return this.raydium;
  }

  private async updateTokenAccounts(owner: Keypair) {
    const solAccountResp = await this.connection.getAccountInfo(
      owner.publicKey,
    );
    const tokenAccountResp = await this.connection.getTokenAccountsByOwner(
      owner.publicKey,
      { programId: TOKEN_PROGRAM_ID },
    );
    const token2022Req = await this.connection.getTokenAccountsByOwner(
      owner.publicKey,
      { programId: TOKEN_2022_PROGRAM_ID },
    );

    const tokenAccountData = parseTokenAccountResp({
      owner: owner.publicKey,
      solAccountResp,
      tokenAccountResp: {
        context: tokenAccountResp.context,
        value: [...tokenAccountResp.value, ...token2022Req.value],
      },
    });

    this.raydium?.account.updateTokenAccount(tokenAccountData);
  }

  async executeParallelSwaps(swapRequests: SwapInputParams[]) {
    const startTime = Date.now();
    this.logger.log(`Starting parallel swaps for ${swapRequests.length} users`);

    // Initialize SDK with first user's keypair
    const raydium = await this.initSdk(swapRequests[0].userKeypair);

    // Convert input format to internal format
    const convertedRequests: SwapParams[] = await Promise.all(
      swapRequests.map(async (request) => {
        const { inputToken, outputToken, ...rest } = request;

        const poolsResponse = await raydium.api.fetchPoolByMints({
          mint1: inputToken.mint,
          mint2: outputToken.mint,
          type: PoolFetchType.Standard,
        });

        if (!poolsResponse.data.length) {
          throw new Error(
            `No standard liquidity pool found for token pair ${
              inputToken.symbol || inputToken.mint.toString()
            }/${outputToken.symbol || outputToken.mint.toString()}`,
          );
        }

        const pool = poolsResponse.data[0];

        this.logger.debug('Found pool:', {
          poolId: pool.id,
          type: pool.type,
          programId: pool.programId,
          mints: {
            input: inputToken.mint.toString(),
            output: outputToken.mint.toString(),
            poolMintA: pool.mintA.address,
            poolMintB: pool.mintB.address,
          },
        });

        return {
          ...rest,
          inputMint: inputToken.mint.toString(),
          outputMint: outputToken.mint.toString(),
          poolId: pool.id,
        };
      }),
    );

    const batches = lod.chunk(convertedRequests, this.BATCH_SIZE);
    const results = [];

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map((params) => this.executeSwap(params)),
      );
      results.push(...batchResults);

      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, this.RATE_LIMIT_MS));
      }
    }

    const endTime = Date.now();
    this.logger.log(`Completed all swaps in ${endTime - startTime}ms`);

    return this.processResults(results);
  }

  private async executeSwap(params: SwapParams) {
    const { userKeypair, inputMint, outputMint, amount, slippage, poolId } =
      params;

    try {
      console.log('amount', amount);
      const raydium = await this.initSdk(userKeypair);

      // Get pool information
      let poolInfo: ApiV3PoolInfoStandardItem;
      let poolKeys: AmmV4Keys;
      let rpcData: AmmRpcData;

      if (this.config.isMainnet) {
        const data = await raydium.api.fetchPoolById({ ids: poolId });
        poolInfo = data[0] as ApiV3PoolInfoStandardItem;

        if (!this.isValidAmm(poolInfo.programId)) {
          throw new Error(
            `Target pool is not an AMM pool. Pool program ID: ${poolInfo.programId}`,
          );
        }

        poolKeys = await raydium.liquidity.getAmmPoolKeys(poolId);
        rpcData = await raydium.liquidity.getRpcPoolInfo(poolId);
      } else {
        const data = await raydium.liquidity.getPoolInfoFromRpc({ poolId });
        poolInfo = data.poolInfo;
        poolKeys = data.poolKeys;
        rpcData = data.poolRpcData;
      }

      const [baseReserve, quoteReserve, status] = [
        rpcData.baseReserve,
        rpcData.quoteReserve,
        rpcData.status.toNumber(),
      ];

      // Validate pool mints
      if (
        poolInfo.mintA.address !== inputMint &&
        poolInfo.mintB.address !== inputMint
      ) {
        throw new Error('Input mint does not match pool');
      }

      const baseIn = inputMint === poolInfo.mintA.address;
      const [mintIn, mintOut] = baseIn
        ? [poolInfo.mintA, poolInfo.mintB]
        : [poolInfo.mintB, poolInfo.mintA];

      // Validate and convert amount
      this.tokenAmountUtils.validateSwapAmount(amount, mintIn.decimals);
      const amountInLamports = this.tokenAmountUtils.toAmountLamports(
        amount,
        mintIn.decimals,
      );

      // Validate against pool reserves
      this.tokenAmountUtils.validateAgainstReserves(
        amountInLamports,
        baseReserve,
      );

      this.logger.debug('Swap details:', {
        inputAmount: amount,
        inputDecimals: mintIn.decimals,
        amountInLamports: amountInLamports.toString(),
        baseReserve: baseReserve.toString(),
        quoteReserve: quoteReserve.toString(),
      });

      const out = raydium.liquidity.computeAmountOut({
        poolInfo: {
          ...poolInfo,
          baseReserve,
          quoteReserve,
          status,
          version: 4,
        },
        amountIn: amountInLamports,
        mintIn: mintIn.address,
        mintOut: mintOut.address,
        slippage,
      });

      this.logger.debug('Computed swap outcome:', {
        amountIn: amountInLamports.toString(),
        amountOut: out.amountOut.toString(),
        minAmountOut: out.minAmountOut.toString(),
      });

      const { execute } = await raydium.liquidity.swap({
        poolInfo,
        poolKeys,
        amountIn: amountInLamports,
        amountOut: out.minAmountOut,
        fixedSide: 'in',
        inputMint: mintIn.address,
        txVersion: TxVersion.V0,
      });

      const { txId } = await execute({
        skipPreflight: false,
        sendAndConfirm: true,
      });

      // Format amounts for return
      const amountInFormatted = this.tokenAmountUtils.formatAmount(
        amountInLamports,
        mintIn.decimals,
        mintIn.decimals,
      );

      const amountOutFormatted = this.tokenAmountUtils.formatAmount(
        out.amountOut,
        mintOut.decimals,
        mintOut.decimals,
      );

      this.logger.log(
        `Swapped ${amountInFormatted} ${mintIn.symbol || mintIn.address} ` +
          `to ${amountOutFormatted} ${mintOut.symbol || mintOut.address}`,
      );

      return {
        success: true,
        signature: txId,
        user: userKeypair.publicKey.toString(),
        amount: amountInFormatted,
        amountOut: amountOutFormatted,
      };
    } catch (error) {
      this.logger.error(
        `Swap failed for user ${userKeypair.publicKey.toString()}: ${error.message}`,
      );
      return {
        success: false,
        error: error.message,
        user: userKeypair.publicKey.toString(),
      };
    }
  }

  private isValidAmm(programId: string): boolean {
    const validV4 = this.config.raydiumProgramIdV4.toString();
    const validStable = this.config.raydiumProgramIdStable.toString();

    this.logger.debug('Checking AMM validity:', {
      poolProgramId: programId,
      validV4,
      validStable,
    });

    return programId === validV4 || programId === validStable;
  }

  private processResults(results: PromiseSettledResult<any>[]) {
    const successful = results.filter(
      (result): result is PromiseFulfilledResult<any> =>
        result.status === 'fulfilled' && result.value.success,
    ).length;

    const failed = results.filter(
      (result) =>
        result.status === 'rejected' ||
        (result.status === 'fulfilled' && !result.value.success),
    ).length;

    return {
      totalProcessed: results.length,
      successful,
      failed,
      details: results.map((result) => {
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            success: false,
            error: result.reason,
          };
        }
      }),
    };
  }
}
