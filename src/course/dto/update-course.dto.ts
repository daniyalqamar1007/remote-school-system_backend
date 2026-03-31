import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsMongoId, IsNotEmpty, IsOptional, IsString, Max, Min, IsInt, ValidateNested } from 'class-validator';

export class UpdateCourseDto {
  // SUPER_ADMIN must provide in body; ADMIN ignored (taken from req.user)
  @IsMongoId()
  @IsOptional()
  schoolId?: string;

  @IsString()
  @IsNotEmpty()
  courseName: string;

  @IsString()
  @IsNotEmpty()
  courseCode: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  departmentIds: string[];

  @IsString()
  @IsOptional()
  Prerequisites?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
