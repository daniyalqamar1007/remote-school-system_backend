import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateInstallmentsDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  className?: string;

  @IsString()
  @IsNotEmpty()
  academicYear: string;
}
