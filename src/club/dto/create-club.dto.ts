import { IsNotEmpty, IsString, IsOptional, IsArray, IsNumber, IsBoolean, IsEnum } from 'class-validator';

export class CreateClubDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum(['Academic', 'Sports', 'Arts', 'Service', 'STEM', 'Cultural', 'Language', 'Other'])
  type: string;

  @IsNotEmpty()
  @IsString()
  advisorId: string;

  @IsNotEmpty()
  @IsString()
  schoolId: string;

  @IsOptional()
  @IsArray()
  studentRoles?: Array<{
    studentId: string;
    role: string;
  }>;

  @IsOptional()
  meetingSchedule?: {
    days?: string[];
    startTime?: string;
    endTime?: string;
    frequency?: string;
    dayTimes?: Record<string, { startTime: string; endTime: string; description?: string }>;
  };

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
  @IsArray()
  @IsString({ each: true })
  activities?: string[];

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  prerequisites?: string;
}
