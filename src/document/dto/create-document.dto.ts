import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean } from 'class-validator';

export class CreateDocumentDto {
  @IsString() @IsNotEmpty()
  title: string;

  @IsEnum(['form', 'permission', 'report', 'letter'])
  type: string;

  @IsEnum(['academic', 'administrative', 'extracurricular', 'health'])
  category: string;

  @IsString() @IsNotEmpty()
  description: string;

  @IsString() @IsNotEmpty()
  studentId: string;

  @IsEnum(['pending', 'completed', 'expired', 'available'])
  status: string;

  @IsString() @IsOptional()
  date?: string;

  @IsString() @IsOptional()
  dueDate?: string;

  @IsBoolean() @IsOptional()
  required?: boolean;

  @IsString() @IsOptional()
  fileUrl?: string; // Provided by school

  // No uploadUrl, comment, uploadedAt in create
}