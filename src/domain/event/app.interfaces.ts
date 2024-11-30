import { Keypair } from '@solana/web3.js';
import { Token } from '@raydium-io/raydium-sdk';

export interface SwapParams {
  userKeypair: Keypair;
  inputToken: Token;
  outputToken: Token;
  amount: number;
  slippage: number;
}
