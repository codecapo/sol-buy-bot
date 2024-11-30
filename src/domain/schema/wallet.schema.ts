import { HydratedDocument } from 'mongoose';
import { SchemaFactory, Schema, Prop } from '@nestjs/mongoose';

export type WalletDocument = HydratedDocument<Wallet>;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ unique: true })
  incrementId?: number;
  @Prop({ unique: true })
  privateKey?: string;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
