import { Test, TestingModule } from '@nestjs/testing';
import { Keypair, PublicKey, Connection, Transaction } from '@solana/web3.js';
import { LIQUIDITY_STATE_LAYOUT_V4, Token } from '@raydium-io/raydium-sdk';
import { RaydiumParallelSwapService } from '../service/raydium-parallel-swap.service';
import { AppService } from '../service/app.service';
import { AppConfigService } from '../service/app-config.service';
import { ConfigModule } from '@nestjs/config';
import { AppRepo } from '../repo/app.repo';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from '../domain/schema/wallet.schema';

describe('RaydiumParallelSwapService Integration Tests', () => {
  let service: RaydiumParallelSwapService;
  let connection: Connection;
  let testWallet: Keypair;
  let config: AppConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        await ConfigModule.forRoot({ envFilePath: '.env' }),
        MongooseModule.forRoot(process.env.DB_CONNECTION_STRING, {
          dbName: 'test',
        }),
        MongooseModule.forFeature([
          { name: Wallet.name, schema: WalletSchema },
        ]),
      ],
      providers: [
        RaydiumParallelSwapService,
        AppService,
        AppConfigService,
        AppRepo,
      ],
    }).compile();

    service = module.get<RaydiumParallelSwapService>(
      RaydiumParallelSwapService,
    );
    config = module.get<AppConfigService>(AppConfigService); // Initialize config

    connection = new Connection(config.rpcUrl, config.connectionConfig);
    testWallet = Keypair.generate();
  });

  // Test parallel swap execution
  it('should execute multiple swaps in parallel', async () => {
    // Create multiple test wallets
    const wallets = Array(3)
      .fill(null)
      .map(() => Keypair.generate());

    // Request airdrops for all test wallets
    await Promise.all(
      wallets.map(async (wallet) => {
        const airdropSignature = await connection.requestAirdrop(
          wallet.publicKey,
          1_000_000_000,
        );
        await connection.confirmTransaction(airdropSignature);
      }),
    );

    const swapRequests = wallets.map((wallet) => ({
      userKeypair: wallet,
      inputToken: new Token(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        new PublicKey('So11111111111111111111111111111111111111112'),
        9,
        'WSOL',
        'Wrapped SOL',
      ),
      outputToken: new Token(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        6,
        'USDC',
        'USD Coin',
      ),
      amount: 0.1,
      slippage: 1,
    }));

    const result = await service.executeParallelSwaps(swapRequests);
    expect(result.totalProcessed).toBe(3);
  }, 60000);

  // Test pool fetching
  it('should fetch pool keys correctly', async () => {
    const inputToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('So11111111111111111111111111111111111111112'),
      9,
      'WSOL',
      'Wrapped SOL',
    );

    const outputToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
      6,
      'USDC',
      'USD Coin',
    );

    const poolKeys = await service['getPoolKeys'](inputToken, outputToken);
    expect(poolKeys).toBeDefined();
    expect(poolKeys.baseMint).toBeDefined();
    expect(poolKeys.quoteMint).toBeDefined();
  }, 30000);

  // Test swap amount computation
  it('should compute swap amounts correctly', async () => {
    const inputToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('So11111111111111111111111111111111111111112'),
      9,
      'WSOL',
      'Wrapped SOL',
    );

    const outputToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
      6,
      'USDC',
      'USD Coin',
    );

    const poolKeys = await service['getPoolKeys'](inputToken, outputToken);
    const amounts = await service['computeSwapAmounts'](
      poolKeys,
      inputToken,
      outputToken,
      0.1,
      1,
    );

    expect(amounts.amountIn).toBeDefined();
    expect(amounts.amountOut).toBeDefined();
    expect(amounts.minAmountOut).toBeDefined();
  }, 30000);

  // Test transaction creation
  it('should create valid swap transaction', async () => {
    const wallet = Keypair.generate();
    await connection.requestAirdrop(wallet.publicKey, 1_000_000_000);

    const inputToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('So11111111111111111111111111111111111111112'),
      9,
      'WSOL',
      'Wrapped SOL',
    );

    const outputToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
      6,
      'USDC',
      'USD Coin',
    );

    const poolKeys = await service['getPoolKeys'](inputToken, outputToken);
    const { amountIn, minAmountOut } = await service['computeSwapAmounts'](
      poolKeys,
      inputToken,
      outputToken,
      0.1,
      1,
    );

    const transaction = await service['createSwapTransaction'](
      poolKeys,
      wallet.publicKey,
      amountIn,
      minAmountOut,
    );

    expect(transaction).toBeInstanceOf(Transaction);
    expect(transaction.instructions.length).toBeGreaterThan(0);
  }, 30000);

  // Test error handling
  it('should handle invalid pool pairs', async () => {
    const invalidToken = new Token(
      new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      new PublicKey('InvalidMintAddress11111111111111111111111'),
      9,
      'INVALID',
      'Invalid Token',
    );

    await expect(
      service['getPoolKeys'](invalidToken, invalidToken),
    ).rejects.toThrow();
  });

  // Test rate limiting
  it('should respect rate limiting between batches', async () => {
    const startTime = Date.now();
    const wallets = Array(6)
      .fill(null)
      .map(() => Keypair.generate()); // Create 6 requests to force 2 batches

    const swapRequests = wallets.map((wallet) => ({
      userKeypair: wallet,
      inputToken: new Token(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        new PublicKey('So11111111111111111111111111111111111111112'),
        9,
        'WSOL',
        'Wrapped SOL',
      ),
      outputToken: new Token(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        6,
        'USDC',
        'USD Coin',
      ),
      amount: 0.1,
      slippage: 1,
    }));

    await service.executeParallelSwaps(swapRequests);
    const duration = Date.now() - startTime;

    // Should take at least RATE_LIMIT_MS between batches
    expect(duration).toBeGreaterThan(500);
  }, 60000);

  // Add this test to your existing test suite
  it('should execute a single swap transaction successfully', async () => {
    // Use connection from config service
    const connection = new Connection(config.rpcUrl, config.connectionConfig);

    // Helper function to handle retries
    const requestAirdropWithRetry = async (
      publicKey: PublicKey,
      amount: number,
      maxRetries = 5,
    ): Promise<string> => {
      let lastError;
      for (let i = 0; i < maxRetries; i++) {
        try {
          const signature = await connection.requestAirdrop(publicKey, amount);
          console.log('Airdrop signature:', signature);

          // Wait before confirming to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await connection.confirmTransaction(signature);
          return signature;
        } catch (error) {
          console.log(`Attempt ${i + 1} failed, retrying...`);
          lastError = error;
          // Exponential backoff
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, i) * 1000),
          );
        }
      }
      throw lastError;
    };

    // Create test wallet
    const testWallet = Keypair.generate();
    console.log('Test wallet public key:', testWallet.publicKey.toString());

    try {
      // Request airdrop with retry mechanism
      console.log('Requesting airdrop...');
      const airdropSignature = await requestAirdropWithRetry(
        testWallet.publicKey,
        1_000_000_000, // 1 SOL
      );
      console.log('Airdrop successful:', airdropSignature);

      // Wait before checking balance
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify initial balance with retry
      let initialBalance = 0;
      let retries = 5;
      while (retries > 0) {
        initialBalance = await connection.getBalance(testWallet.publicKey);
        if (initialBalance > 0) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retries--;
      }

      console.log('Initial balance:', initialBalance / 1e9, 'SOL');
      expect(initialBalance).toBeGreaterThan(0);

      // Define tokens using config service
      const inputToken = new Token(
        config.tokenProgramId,
        config.wsolMint,
        9,
        'WSOL',
        'Wrapped SOL',
      );

      const outputToken = new Token(
        config.tokenProgramId,
        config.usdcMint,
        6,
        'USDC',
        'USD Coin',
      );

      // Create swap request using config values
      const swapRequest = {
        userKeypair: testWallet,
        inputToken,
        outputToken,
        amount: config.testSwapAmount,
        slippage: config.testSlippage,
      };

      const poolExists = await checkLiquidityPool(
        connection,
        inputToken.mint,
        outputToken.mint,
      );

      if (!poolExists) {
        console.log(
          'No liquidity pool found for the token pair, trying alternative pair...',
        );
        return;
      }
      // Try alternative token pair
      //   outputToken = rayToken; // Use RAY instead of USDC
      //   const altPoolExists = await checkLiquidityPool(
      //     connection,
      //     inputToken.mint,
      //     outputToken.mint,
      //   );
      //   if (!altPoolExists) {
      //     throw new Error('No suitable liquidity pools found for testing');
      //   }
      // }
      // Log swap details
      console.log('Swap request details:', {
        inputToken: inputToken.mint.toString(),
        outputToken: outputToken.mint.toString(),
        amount: swapRequest.amount,
        slippage: swapRequest.slippage,
      });

      // Add delay before swap
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Execute single swap
      console.log('Executing swap...');
      const result = await service.executeParallelSwaps([swapRequest]);
      console.log('Swap result:', JSON.stringify(result, null, 2));

      // Verify the result
      expect(result.totalProcessed).toBe(1);

      if (result.successful === 0) {
        console.log('Swap failed with details:', result.details[0].error);
        throw new Error('Swap failed: ' + result.details[0].error);
      }

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);

      // Verify transaction signature if successful
      if (result.details[0].signature) {
        console.log('Transaction signature:', result.details[0].signature);
        const txInfo = await connection.getTransaction(
          result.details[0].signature,
          {
            commitment: 'confirmed',
          },
        );
        expect(txInfo).toBeDefined();
        expect(txInfo.meta.err).toBeNull();
      }

      // Add delay before checking final balance
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check final balance with retry
      let finalBalance = 0;
      retries = 5;
      while (retries > 0) {
        finalBalance = await connection.getBalance(testWallet.publicKey);
        if (finalBalance < initialBalance) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
        retries--;
      }

      console.log('Final balance:', finalBalance / 1e9, 'SOL');
      expect(finalBalance).toBeLessThan(initialBalance);

      // Log balance change
      const balanceChange = (initialBalance - finalBalance) / 1e9;
      console.log('Balance change:', balanceChange, 'SOL');

      // Optional: Check USDC token account
      try {
        const usdcAccounts = await connection.getTokenAccountsByOwner(
          testWallet.publicKey,
          {
            mint: config.usdcMint,
          },
        );

        if (usdcAccounts.value.length > 0) {
          console.log('USDC account created successfully');
        }
      } catch (error) {
        console.log('Error checking USDC account:', error.message);
      }
    } catch (error) {
      console.error('Test failed with error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    } finally {
      // Optional cleanup
      console.log('Test completed');
    }
  }, 300000); // 5 minute timeout
  // Add a test for swap failure scenarios
  it('should handle swap failures gracefully', async () => {
    const testWallet = Keypair.generate();

    // Don't fund the wallet - this should cause the swap to fail

    const swapRequest = {
      userKeypair: testWallet,
      inputToken: new Token(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        new PublicKey('So11111111111111111111111111111111111111112'),
        9,
        'WSOL',
        'Wrapped SOL',
      ),
      outputToken: new Token(
        new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),
        6,
        'USDC',
        'USD Coin',
      ),
      amount: 1.0, // Try to swap 1 SOL (which we don't have)
      slippage: 1,
    };

    const result = await service.executeParallelSwaps([swapRequest]);

    // Verify failure handling
    expect(result.totalProcessed).toBe(1);
    expect(result.successful).toBe(0);
    expect(result.failed).toBe(1);

    const failedSwap = result.details[0];
    expect(failedSwap.success).toBe(false);
    expect(failedSwap.error).toBeDefined();
  }, 30000);

  async function checkLiquidityPool(
    connection: Connection,
    inputToken: PublicKey,
    outputToken: PublicKey,
  ): Promise<boolean> {
    try {
      // You'll need to implement this based on Raydium's SDK
      const poolKeys = await service['getPoolKeys'](
        new Token(config.tokenProgramId, inputToken, 9, '', ''),
        new Token(config.tokenProgramId, outputToken, 6, '', ''),
      );
      return !!poolKeys;
    } catch (error) {
      console.log('No liquidity pool found:', error.message);
      return false;
    }
  }

  async function listRaydiumDevnetPools() {
    // Initialize connection to devnet
    const connection = new Connection(config.rpcUrl, 'confirmed');

    // Raydium AMM Program ID for devnet
    const RAYDIUM_PROGRAM_ID_V4 = config.raydiumProgramIdStable;

    try {
      // Get all program accounts
      const accounts = await connection.getProgramAccounts(
        RAYDIUM_PROGRAM_ID_V4,
        {
          filters: [
            {
              dataSize: LIQUIDITY_STATE_LAYOUT_V4.span, // Filter by account data size
            },
          ],
        },
      );

      console.log(`Found ${accounts.length} pools`);

      // Process each pool
      for (const account of accounts) {
        try {
          // Decode the pool data
          const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(
            account.account.data,
          );

          // Get token information
          const baseToken = await connection.getParsedAccountInfo(
            poolState.baseMint,
          );

          console.log(`Found baseToken ${baseToken}`);
          const quoteToken = await connection.getParsedAccountInfo(
            poolState.quoteMint,
          );

          console.log(`Found quoteToken ${quoteToken}`);

          console.log('Pool found:');
          console.log('Pool ID:', account.pubkey.toString());
          console.log('Base Mint:', poolState.baseMint.toString());
          console.log('Quote Mint:', poolState.quoteMint.toString());
          console.log('LP Mint:', poolState.lpMint.toString());
          console.log('--------------------');
        } catch (error) {
          console.error('Error processing pool:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching pools:', error);
    }
  }

  it('random range selection', () => {
    let randomRange = 0;
    const minValue = 1;
    const maxValue = 200;
    const rangeSize = 50;
    const rangeArray = [];

    for (let i = 0; i < rangeSize; i++) {
      randomRange =
        Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
      rangeArray.push(randomRange);
    }
    console.log(rangeArray);
  });
});
