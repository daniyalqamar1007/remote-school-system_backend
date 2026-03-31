import { IsOptional, IsString, IsMongoId, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DayTimeDto {
  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class MeetingScheduleDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  days?: string[];

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  frequency?: string;

  @IsOptional()
  dayTimes?: Record<string, DayTimeDto>;
}

class StudentRoleDto {
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateClubDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsMongoId()
  advisorId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentRoleDto)
  studentRoles?: StudentRoleDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => MeetingScheduleDto)
  meetingSchedule?: MeetingScheduleDto;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsNumber()
  maxMembers?: number;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsMongoId()
  updatedBy?: string;

  // Legacy fields for backward compatibility
  @IsOptional()
  @IsString()
  clubName?: string;

  @IsOptional()
  @IsString()
  prerequisites?: string;
}
