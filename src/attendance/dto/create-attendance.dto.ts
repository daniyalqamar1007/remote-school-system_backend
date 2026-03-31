import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsMongoId,
  IsEnum,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

// attendance-entry.dto.ts

export class AttendanceEntryDto {
  @IsNotEmpty({ message: '_id is required' })
  @IsMongoId({ message: '_id must be a valid MongoDB ObjectId' })
  _id: string;

  @IsNotEmpty({ message: 'studentId is required' })
  @IsString({ message: 'studentId must be a string' })
  studentId: string;

  @IsNotEmpty({ message: 'studentName is required' })
  @IsString({ message: 'studentName must be a string' })
  studentName: string;

  @IsNotEmpty({ message: 'attendance status is required' })
  @IsEnum(['Present', 'Absent', 'Late', 'Excused'], { 
    message: 'attendance must be one of: Present, Absent, Late, Excused' 
  })
  attendance: string;

  @IsOptional()
  @IsString({ message: 'note must be a string' })
  note?: string;
}

export class CreateAttendanceDto {
  @IsNotEmpty({ message: 'teacherId is required' })
  @IsMongoId({ message: 'teacherId must be a valid MongoDB ObjectId' })
  teacherId: string;

  @IsNotEmpty({ message: 'courseId is required' })
  @IsMongoId({ message: 'courseId must be a valid MongoDB ObjectId' })
  courseId: string;

  @IsNotEmpty({ message: 'date is required' })
  @IsString({ message: 'date must be a string' })
  date: string; // Format: YYYY-MM-DD

  @IsNotEmpty({ message: 'class is required' })
  @IsString({ message: 'class must be a string' })
  class: string;

  @IsNotEmpty({ message: 'section is required' })
  @IsString({ message: 'section must be a string' })
  section: string;

  @IsNotEmpty({ message: 'students array is required' })
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  @ArrayMinSize(1, { message: 'At least one student is required' })
  students: AttendanceEntryDto[];
}
