import { Injectable, Logger } from '@nestjs/common';
import { AddMarketMakerWalletDto } from '../domain/dto/add-market-maker-wallet.dto';
import { Wallet, WalletDocument } from '../domain/schema/wallet.schema';
import { AppRepo } from '../repo/app.repo';
import { CreateExecutionOrderDTO } from '../domain/dto/create-execution-order.dto';
import { ExecutionOrder } from '../domain/schema/execution-order.schema';
import * as base58 from 'bs58';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Token } from '@raydium-io/raydium-sdk';
import { RaydiumParallelSwapService } from './raydium-parallel-swap.service';
import { SwapRequestDto } from '../domain/dto/swap-request.dto';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  constructor(
    private appRepo: AppRepo,
    private readonly swapService: RaydiumParallelSwapService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  public async addMarketMakerWallets(
    addMarketMakerWallets: AddMarketMakerWalletDto[],
  ): Promise<any> {
    const marketMakerWallets: Wallet[] = addMarketMakerWallets.map((item) => {
      const wallet: Wallet = {
        incrementId: item.incrementId,
        privateKey: item.privateKey,
      };
      return wallet;
    });

    return await this.appRepo.addMarketMakerWallet(marketMakerWallets);
  }

  public async getRandomWalletBatch(batchSize: number): Promise<number[]> {
    const minMaxIncrementIds = await this.appRepo.getMinMaxIncrementIds();
    console.log('minMaxIncrementIds', minMaxIncrementIds);
    let randomRange = 0;
    const minValue = minMaxIncrementIds.minIncrement;
    const maxValue = minMaxIncrementIds.maxIncrement;
    const rangeSize = batchSize;
    const executionOrder = [];

    for (let i = 0; i < rangeSize; i++) {
      randomRange =
        Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
      executionOrder.push(randomRange);
    }

    return executionOrder;
  }

  public async createExecutionOrder(
    createExecutionOrderDTO: CreateExecutionOrderDTO,
  ) {
    const wallets = await Promise.all(
      createExecutionOrderDTO.marketMakerWallets.map(async (item) => {
        const getWallets = await this.appRepo.getWallet(item);

        const wallet: Wallet = {
          incrementId: getWallets.incrementId,
          privateKey: getWallets.privateKey,
        };

        return wallet;
      }),
    );

    console.log(wallets);

    const mapExecutionOrder: ExecutionOrder = {
      marketMakerWalletsToProcess: wallets,
    };

    return await this.appRepo.createExecutionOrder(mapExecutionOrder);
  }

  public async mapSwapRequests() {
    const marketMakerWallets = await this.appRepo.findStartOldestUnprocessedOrder();

    if (marketMakerWallets != null) {
      const mappedExecutionOrderToSwapRequests =
        marketMakerWallets.marketMakerWalletsToProcess.map((item) => {
          const swapRequests: SwapRequestDto = {
            amount: 0.0001,
            inputToken: {
              programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Soltana Token Program ID
              mint: 'So11111111111111111111111111111111111111112', // SOL token mint
              decimals: 9,
              symbol: 'SOL',
              name: 'Solana',
            },
            outputToken: {
              programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Solana Token Program ID
              mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', // RAY token mint
              decimals: 6,
              symbol: 'RAY',
              name: 'Raydium',
            },
            slippage: 0.5, // 0.5% slippage
            userKeypair: item.privateKey,
          };
          return swapRequests;
        });

      const serviceRequests = mappedExecutionOrderToSwapRequests.map(
        (request) => {
          try {
            if (!request.userKeypair) {
              throw new Error('User keypair is missing');
            }

            // Decode base58 secret key
            const secretKey = base58.default.decode(request.userKeypair);
            const keypair = Keypair.fromSecretKey(Uint8Array.from(secretKey));

            return {
              userKeypair: keypair,
              inputToken: new Token(
                new PublicKey(request.inputToken.programId),
                new PublicKey(request.inputToken.mint),
                request.inputToken.decimals,
                request.inputToken.symbol,
                request.inputToken.name,
              ),
              outputToken: new Token(
                new PublicKey(request.outputToken.programId),
                new PublicKey(request.outputToken.mint),
                request.outputToken.decimals,
                request.outputToken.symbol,
                request.outputToken.name,
              ),
              amount: request.amount,
              slippage: request.slippage,
            };
          } catch (error) {
            this.logger.error(
              `Failed to process swap request: ${error.message}`,
            );
            throw error;
          }
        },
      );

      return this.swapService.executeParallelSwaps(serviceRequests);
    }
  }
}
