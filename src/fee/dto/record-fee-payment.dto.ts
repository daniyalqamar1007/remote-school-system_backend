import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordFeePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(['manual_cash', 'manual_bank', 'manual_adjustment'])
  paymentMode: 'manual_cash' | 'manual_bank' | 'manual_adjustment';

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
