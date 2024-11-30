import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AppService } from '../service/app.service';
import { RaydiumParallelSwapService } from '../service/raydium-parallel-swap.service';
import { Keypair, PublicKey } from '@solana/web3.js';
import { Token } from '@raydium-io/raydium-sdk';
import * as base58 from 'bs58';
import { SwapRequestDto } from '../domain/dto/swap-request.dto';
import { AddMarketMakerWalletDto } from '../domain/dto/add-market-maker-wallet.dto';

@Controller()
export class RaydiumParallelSwapController {
  constructor(
    private readonly appService: AppService,
    private readonly swapService: RaydiumParallelSwapService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('/wallet/insert-many')
  async insertManyMarketMakerWallets(
    @Body() marketMakerWallets: AddMarketMakerWalletDto[],
  ) {
    return this.appService.addMarketMakerWallets(marketMakerWallets);
  }

  @Post('batch')
  @UsePipes(new ValidationPipe({ transform: true }))
  async executeBatchSwaps(@Body() swapRequests: SwapRequestDto[]) {
    // Convert DTOs to service types
    const serviceRequests = swapRequests.map((request) => {
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
    });

    return this.swapService.executeParallelSwaps(serviceRequests);
  }
}
