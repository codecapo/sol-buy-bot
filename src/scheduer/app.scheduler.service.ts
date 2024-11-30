import { Cron, CronExpression } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppService } from '../service/app.service';
import { CreateExecutionOrderDTO } from '../domain/dto/create-execution-order.dto';

@Injectable()
export class AppSchedulerService {
  private readonly logger = new Logger(AppSchedulerService.name);
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private appService: AppService,
  ) {}

  @Cron(CronExpression.EVERY_10_SECONDS)
  public async createExecutionOrderProcessor() {
    this.logger.log('createExecutionOrderProcessor');
    const randomWalletBatch = await this.appService.getRandomWalletBatch(2);

    const executionOrderDto: CreateExecutionOrderDTO = {
      marketMakerWallets: randomWalletBatch,
    };
    await this.appService.createExecutionOrder(executionOrderDto);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  public async parallelSwapProcessor() {
    this.logger.log('parallelSwapProcessor');
    await this.eventEmitter.emitAsync(
      'execute.swaps', // event name
    );
  }
}
