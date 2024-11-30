import { Module } from '@nestjs/common';
import { RaydiumParallelSwapController } from './controller/raydium-parallel-swap.controller';
import { AppService } from './service/app.service';
import { RaydiumParallelSwapService } from './service/raydium-parallel-swap.service';
import { AppConfigService } from './service/app-config.service';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { Wallet, WalletSchema } from './domain/schema/wallet.schema';
import { AppRepo } from './repo/app.repo';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppEventHandlerService } from './event-handler/app.event-handler.service';
import { AppSchedulerService } from './scheduer/app.scheduler.service';
import {
  ExecutionOrder,
  ExecutionOrderSchema,
} from './domain/schema/execution-order.schema';
import { TokenAmountUtilsService } from "./service/token-amount-utils.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(process.env.DB_CONNECTION_STRING),
    MongooseModule.forFeature([
      { name: Wallet.name, schema: WalletSchema },
      { name: ExecutionOrder.name, schema: ExecutionOrderSchema },
    ]),
    EventEmitterModule.forRoot({
      wildcard: true,
    }),
  ],
  controllers: [RaydiumParallelSwapController],
  providers: [
    AppService,
    RaydiumParallelSwapService,
    AppConfigService,
    AppRepo,
    AppEventHandlerService,
    AppSchedulerService,
    TokenAmountUtilsService,
  ],
})
export class AppModule {}
