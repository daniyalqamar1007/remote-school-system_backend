// src/admin/dto/update-department.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString({ message: 'Department name must be a string' })
  departmentName?: string;

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

