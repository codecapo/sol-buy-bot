import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Wallet } from './wallet.schema';

export type ExecutionOrderDocument = HydratedDocument<ExecutionOrder>;

@Schema({ timestamps: true })
export class ExecutionOrder {
  @Prop()
  marketMakerWalletsToProcess: Wallet[];

  @Prop()
  startedAt?: string;

  @Prop()
  finishedAt?: string;
}

export const ExecutionOrderSchema =
  SchemaFactory.createForClass(ExecutionOrder);
