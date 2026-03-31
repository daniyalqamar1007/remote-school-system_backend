// src/admin/dto/create-department.dto.ts
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @IsNotEmpty({ message: 'Department name is required' })
  @IsString({ message: 'Department name must be a string' })
  departmentName: string;

  @IsOptional()
  @IsString({ message: 'Code must be a string' })
  code?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'School ID must be a string' })
  schoolId?: string;
}

