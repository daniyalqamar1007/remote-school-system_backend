import {
  IsArray, ArrayMinSize, ValidateNested, IsMongoId,
  IsOptional, IsNotEmpty, IsString, IsInt, Min, Max, IsIn, Matches
} from 'class-validator';
import { Type } from 'class-transformer';
import { DaysNumber } from 'src/types/enums/courses.enum';

// Time Slot DTO
class TimeSlotDto {
  @IsString({ message: 'Day must be a string' })
  @IsNotEmpty({ message: 'Day is required' })
  @IsIn(Object.values(DaysNumber), { 
    message: 'Day must be one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday' 
  })
  day!: string;

  @IsString({ message: 'Start time must be a string' })
  @IsNotEmpty({ message: 'Start time is required' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { 
    message: 'Start time must be in HH:MM format (24-hour), e.g., 09:00, 14:30' 
  })
  startTime!: string;

  @IsString({ message: 'End time must be a string' })
  @IsNotEmpty({ message: 'End time is required' })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, { 
    message: 'End time must be in HH:MM format (24-hour), e.g., 10:00, 15:30' 
  })
  endTime!: string;
}

// Grade with Time Slots DTO
class GradeDto {
  @IsInt({ message: 'Level must be an integer' })
  @Min(1, { message: 'Level must be at least 1' })
  @Max(12, { message: 'Level cannot exceed 12' })
  level!: number;

  @IsString({ message: 'Section must be a string' })
  @IsNotEmpty({ message: 'Section is required' })
  section!: string;

  @IsString({ message: 'Room number must be a string' })
  @IsNotEmpty({ message: 'Room number is required' })
  roomNumber!: string;

  @IsArray({ message: 'Time slots must be an array' })
  @ArrayMinSize(1, { message: 'At least one time slot is required for each grade-section' })
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots!: TimeSlotDto[];
}

class CourseAssignmentItemDto {
  @IsMongoId({ message: 'Invalid course ID format' })
  @IsNotEmpty({ message: 'Course ID is required' })
  courseId!: string;

  @IsArray({ message: 'Grades must be an array' })
  @ArrayMinSize(1, { message: 'At least one grade-section is required for each course' })
  @ValidateNested({ each: true })
  @Type(() => GradeDto)
  grades!: GradeDto[];
}

export class AssignCoursesDto {
  @IsMongoId({ message: 'Invalid school ID format' })
  @IsOptional()
  schoolId?: string;

  @IsMongoId({ message: 'Invalid teacher user ID format' })
  @IsNotEmpty({ message: 'Teacher user ID is required' })
  userId!: string;

  @IsArray({ message: 'Assignments must be an array' })
  @ArrayMinSize(1, { message: 'At least one course assignment is required' })
  @ValidateNested({ each: true })
  @Type(() => CourseAssignmentItemDto)
  assignments!: CourseAssignmentItemDto[];
}


