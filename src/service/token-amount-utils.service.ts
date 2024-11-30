import { Injectable, Logger } from '@nestjs/common';
import { BN } from '@project-serum/anchor';

@Injectable()
export class TokenAmountUtilsService {
  private readonly logger = new Logger(TokenAmountUtilsService.name);

  /**
   * Get minimum swap amount for a token with given decimals
   * @param mintDecimals Token decimals
   * @returns BN Minimum amount in lamports
   */
  public getMinSwapAmount(mintDecimals: number): BN {
    this.logger.debug(
      `Calculating min swap amount for decimals: ${mintDecimals}`,
    );
    // For most tokens, minimum is 0.00001 tokens (lower than previous 0.000001)
    const minDecimals = Math.min(5, mintDecimals);
    const minAmount = new BN(1).mul(new BN(10).pow(new BN(minDecimals)));

    this.logger.debug(
      `Min swap amount calculated: ${minAmount.toString()} lamports`,
    );
    return minAmount;
  }

  /**
   * Validate swap amount against minimum requirements
   * @param amount Amount in human readable format
   * @param mintDecimals Token decimals
   */
  public validateSwapAmount(amount: number, mintDecimals: number): void {
    if (amount <= 0) {
      throw new Error('Swap amount must be greater than 0');
    }

    const amountInLamports = this.toAmountLamports(amount, mintDecimals);
    this.logger.debug(`Validating swap amount:`, {
      amount,
      amountInLamports: amountInLamports.toString(),
      decimals: mintDecimals,
    });

    const minAmount = this.getMinSwapAmount(mintDecimals);
    this.logger.debug(`Comparing against minimum:`, {
      minAmount: minAmount.toString(),
      minTokens: this.formatAmount(minAmount, mintDecimals),
    });

    if (amountInLamports.lt(minAmount)) {
      const minTokenAmount = this.formatAmount(minAmount, mintDecimals);
      throw new Error(
        `Swap amount (${amount}) too small. ` +
          `Minimum is ${minTokenAmount} tokens (${minAmount.toString()} lamports)`,
      );
    }
  }

  /**
   * Convert human readable amount to lamports BN
   * @param amount Amount in human readable format
   * @param mintDecimals Token decimals
   * @returns BN Amount in lamports
   */
  public toAmountLamports(amount: number, mintDecimals: number): BN {
    // Use string operations to avoid float precision issues
    const amountStr = amount.toFixed(mintDecimals);
    const [whole, decimal = ''] = amountStr.split('.');
    const paddedDecimal = decimal.padEnd(mintDecimals, '0');
    const lamports = `${whole}${paddedDecimal}`;

    this.logger.debug(`Converting amount to lamports:`, {
      amount,
      decimals: mintDecimals,
      amountStr,
      whole,
      decimal,
      paddedDecimal,
      lamports,
    });

    return new BN(lamports);
  }

  /**
   * Validate amount against pool reserves
   * @param amountInLamports Amount to swap in lamports
   * @param baseReserve Pool base reserve
   * @param maxPercentOfReserve Maximum percent of reserve allowed (0-100)
   */
  public validateAgainstReserves(
    amountInLamports: BN,
    baseReserve: BN,
    maxPercentOfReserve: number = 25,
  ): void {
    const maxAmount = baseReserve
      .mul(new BN(maxPercentOfReserve))
      .div(new BN(100));
    if (amountInLamports.gt(maxAmount)) {
      throw new Error(
        `Swap amount too large compared to pool reserves. Maximum is ${maxPercentOfReserve}% of reserves`,
      );
    }
  }

  /**
   * Format amount from lamports to human readable format
   * @param lamports Amount in lamports
   * @param decimals Token decimals
   * @param roundingDecimals Number of decimals to round to
   * @returns Formatted string amount
   */
  public formatAmount(
    lamports: BN,
    decimals: number,
    roundingDecimals?: number,
  ): string {
    const divisor = Math.pow(10, decimals);
    const number = Number(lamports.toString()) / divisor;

    if (roundingDecimals !== undefined) {
      return number.toFixed(roundingDecimals);
    }

    return number.toString();
  }
}
