import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber } from 'class-validator';

export class UpdateStatusDto {
  @IsString() @IsNotEmpty()
  studentId: string;

  @IsEnum(['upcoming', 'completed', 'overdue', 'graded'])
  status: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsNumber()
  outOf?: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}