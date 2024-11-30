import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TokenDto } from './token.dto';

export class SwapRequestDto {
  @IsString()
  @IsNotEmpty()
  userKeypair: string; // Base58 encoded keypair

  @ValidateNested()
  @Type(() => TokenDto)
  inputToken: TokenDto;

  @ValidateNested()
  @Type(() => TokenDto)
  outputToken: TokenDto;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  amount: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  @Max(100)
  slippage: number;
}
