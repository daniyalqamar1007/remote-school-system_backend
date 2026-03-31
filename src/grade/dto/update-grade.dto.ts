import {
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AssessmentComponentDto {
  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsNumber()
  weightage?: number;
}

export class UpdateGradeDto {
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsOptional()
  @IsMongoId()
  teacherId?: string;

  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  quiz?: AssessmentComponentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  midTerm?: AssessmentComponentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  project?: AssessmentComponentDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  finalTerm?: AssessmentComponentDto;

  @IsOptional()
  @IsNumber()
  overAll?: number;

  @IsOptional()
  @IsNumber()
  totalMarks?: number;

  @IsOptional()
  @IsNumber()
  score?: number;
}

export class UpdateGradeListDto {
  @ValidateNested({ each: true })
  @Type(() => UpdateGradeDto)
  grades: UpdateGradeDto[];
}
