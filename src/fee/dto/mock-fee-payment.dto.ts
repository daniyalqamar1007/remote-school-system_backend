import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class MockFeePaymentDto {
  @IsMongoId()
  installmentId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(['manual_cash', 'manual_bank', 'manual_adjustment'])
  paymentMode?: 'manual_cash' | 'manual_bank' | 'manual_adjustment';

  @IsOptional()
  @IsEnum(['success', 'pending', 'failure'])
  scenario?: 'success' | 'pending' | 'failure';

  @IsOptional()
  @IsString()
  referenceNo?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  externalPaymentId?: string;
}