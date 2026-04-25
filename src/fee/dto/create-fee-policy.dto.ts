import { IsBoolean, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateFeePolicyDto {
  @IsOptional()
  @IsMongoId()
  schoolId?: string;

  @IsString()
  @IsNotEmpty()
  academicYear: string;

  @IsString()
  @IsNotEmpty()
  className: string;

  @IsNumber()
  @Min(0)
  baseFee: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsEnum(['monthly', 'yearly'])
  installmentFrequency: 'monthly' | 'yearly';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  academicStartMonth?: number;

  @IsNumber()
  @Min(1)
  @Max(31)
  dueDay: number;

  @IsNumber()
  @Min(0)
  graceDays: number;

  @IsEnum(['fixed', 'percentage'])
  lateFeeType: 'fixed' | 'percentage';

  @IsNumber()
  @Min(0)
  lateFeeValue: number;

  @IsEnum(['fixed', 'daily', 'percentage'])
  fineType: 'fixed' | 'daily' | 'percentage';

  @IsNumber()
  @Min(0)
  fineValue: number;

  @IsNumber()
  @Min(0)
  maxFineCap: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
