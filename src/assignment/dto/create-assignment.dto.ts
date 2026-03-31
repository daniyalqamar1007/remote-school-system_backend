import { IsString, IsNotEmpty, IsEnum, IsArray, IsOptional } from 'class-validator';

export class CreateAssignmentDto {
  @IsString() @IsNotEmpty()
  title: string;

  @IsString() @IsNotEmpty()
  subject: string;

  @IsEnum(['homework', 'project', 'quiz', 'test'])
  type: string;

  @IsString()
  description: string;

  @IsString() assignedDate: string;
  @IsString() dueDate: string;

  @IsString()
  assignedBy: string; // TeacherId

  @IsArray() 
  students: string[]; // Array of Student IDs
}