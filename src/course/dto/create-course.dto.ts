import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString, IsMongoId, Min, Max, ValidateNested, IsBoolean } from 'class-validator';

export class CreateCourseDto {
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

  @IsMongoId()
  @IsOptional()
  dummy?: string; // placeholder to keep order

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  departmentIds: string[];

  // Optional fields per updated schema
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
