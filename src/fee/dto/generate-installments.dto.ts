import { IsMongoId, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateInstallmentsDto {
  @IsOptional()
  @IsMongoId()
  schoolId?: string;

  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsString()
  @IsNotEmpty()
  academicYear: string;

  @IsOptional()
  @Min(1)
  @Max(12)
  academicStartMonth?: number;
}
