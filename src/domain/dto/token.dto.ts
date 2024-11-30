import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class TokenDto {
  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsString()
  @IsNotEmpty()
  mint: string;

  @IsNumber()
  @IsNotEmpty()
  decimals: number;

  @IsString()
  symbol?: string;

  @IsString()
  name?: string;
}
