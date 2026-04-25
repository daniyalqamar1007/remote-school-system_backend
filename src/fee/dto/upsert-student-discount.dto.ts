import { IsBoolean, IsDateString, IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertStudentDiscountDto {
  @IsOptional()
  @IsMongoId()
  schoolId?: string;

  @IsMongoId()
  @IsNotEmpty()
  studentId: string;

  @IsMongoId()
  @IsNotEmpty()
  feePolicyId: string;

  @IsEnum(['fixed', 'percentage'])
  discountType: 'fixed' | 'percentage';

  @IsNumber()
  @Min(0)
  discountValue: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
