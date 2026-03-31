import { IsMongoId, IsNumber, IsString, ValidateNested, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

class AssessmentComponentDto {
  @IsNumber()
  score: number;

  @IsNumber()
  weightage: number;
}

export class CreateGradeDto {
  @IsMongoId()
  teacherId: string;

  @IsMongoId()
  courseId: string;

  @IsMongoId()
  studentId: string;

  @IsString()
  class: string;

  @IsString()
  section: string;

  @IsString()
  @IsOptional()
  term?: string;

  @IsString()
  markingType: string; // Test, Quiz, Exam, Assignment, Project, etc.

  @IsNumber()
  @Min(1)
  totalMarks: number; // Total marks for this assessment

  @IsNumber()
  @Min(0)
  score: number; // Student's score (must be <= totalMarks)

  // Keep old fields for backward compatibility (optional)
  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  @IsOptional()
  quiz?: AssessmentComponentDto;

  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  @IsOptional()
  midTerm?: AssessmentComponentDto;

  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  @IsOptional()
  project?: AssessmentComponentDto;

  @ValidateNested()
  @Type(() => AssessmentComponentDto)
  @IsOptional()
  finalTerm?: AssessmentComponentDto;

  @IsNumber()
  @IsOptional()
  overAll?: number;
}

export class CreateGradeListDto {
  @ValidateNested({ each: true })
  @Type(() => CreateGradeDto)
  grades: CreateGradeDto[];
}
