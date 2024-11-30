import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConnectionConfig, PublicKey } from '@solana/web3.js';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get isMainnet(): boolean {
    return this.configService.get<string>('NETWORK') === 'mainnet-beta';
  }

  get rpcUrl(): string {
    return this.isMainnet
      ? this.configService.get<string>('MAIN_RPC_URL')
      : this.configService.get<string>('DEV_RPC_URL');
  }

  get wssUrl(): string {
    return this.isMainnet
      ? this.configService.get<string>('MAIN_WSS_URL')
      : this.configService.get<string>('DEV_WSS_URL');
  }

  get tokenProgramId(): PublicKey {
    return new PublicKey(this.configService.get<string>('TOKEN_PROGRAM_ID'));
  }

  get wsolMint(): PublicKey {
    return new PublicKey(
      this.isMainnet
        ? this.configService.get<string>('MAINNET_WSOL_MINT')
        : this.configService.get<string>('DEVNET_WSOL_MINT'),
    );
  }

  get usdcMint(): PublicKey {
    return new PublicKey(
      this.isMainnet
        ? this.configService.get<string>('MAINNET_USDC_MINT')
        : this.configService.get<string>('DEVNET_USDC_MINT'),
    );
  }

  get raydiumProgramIdV4(): PublicKey {
    return new PublicKey(
      this.isMainnet
        ? this.configService.get<string>('MAINNET_RAYDIUM_PROGRAM_ID_V4')
        : this.configService.get<string>('DEVNET_RAYDIUM_PROGRAM_ID_V4'),
    );
  }

  get raydiumProgramIdStable(): PublicKey {
    return new PublicKey(
      this.isMainnet
        ? this.configService.get<string>('MAINNET_RAYDIUM_PROGRAM_ID_STABLE')
        : this.configService.get<string>('DEVNET_RAYDIUM_PROGRAM_ID_STABLE'),
    );
  }

  get testSwapAmount(): number {
    return this.configService.get<number>('TEST_SWAP_AMOUNT');
  }

  get testSlippage(): number {
    return this.configService.get<number>('TEST_SLIPPAGE');
  }

  get connectionConfig(): ConnectionConfig {
    return {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
      wsEndpoint: this.rpcUrl,
    };
  }
}
