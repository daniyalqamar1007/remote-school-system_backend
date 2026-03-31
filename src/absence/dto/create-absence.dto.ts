import { IsNotEmpty, IsString, IsDateString, IsOptional, IsEnum } from 'class-validator';

export class CreateAbsenceDto {
  @IsNotEmpty()
  @IsString()
  student: string; // student ObjectId

  @IsNotEmpty()
  @IsDateString()
  date: string;

  @IsNotEmpty()
  @IsEnum(['full', 'partial', 'late'])
  type: string;

  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  documentName?: string;

  @IsOptional()
  @IsString()
  documentUrl?: string;
}