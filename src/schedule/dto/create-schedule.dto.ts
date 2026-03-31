import {
  IsNotEmpty,
  IsString,
  IsMongoId,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ScheduleDayDto {
  @IsNotEmpty()
  @IsString()
  startTime: string;

  @IsNotEmpty()
  @IsString()
  endTime: string;

  @IsNotEmpty()
  @IsString()
  date: string;
}

export class CreateScheduleDto {
  @IsNotEmpty()
  @IsString()
  courseName: string;

  @IsNotEmpty()
  @IsString()
  className: string;

  @IsNotEmpty()
  @IsString()
  section: string;

  @IsNotEmpty()
  @IsString()
  note: string;

  @IsNotEmpty()
  @IsMongoId()
  teacherId: string; // Now references Teacher ID

  @IsNotEmpty()
  @IsMongoId()
  courseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleDayDto)
  dayOfWeek: ScheduleDayDto[];
}
