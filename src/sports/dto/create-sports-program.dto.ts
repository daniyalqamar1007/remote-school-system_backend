import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  IsMongoId,
  ArrayMinSize
} from 'class-validator';
import { SportsSeason, SportsProgramType } from 'src/types/enums/sports.enum';

export class CreateSportsProgramDto {
  @IsNotEmpty({ message: 'Program name is required' })
  @IsString({ message: 'Program name must be a string' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsNotEmpty({ message: 'Allowed grade levels are required' })
  @IsArray({ message: 'Allowed grade levels must be an array' })
  @ArrayMinSize(1, { message: 'At least one grade level is required' })
  @IsString({ each: true, message: 'Each grade level must be a string' })
  allowedGradeLevels: string[];

  @IsOptional()
  @IsMongoId({ message: 'School ID must be a valid MongoDB ObjectId' })
  schoolId?: string;

  @IsOptional()
  @IsArray({ message: 'Coaches must be an array' })
  @IsMongoId({ each: true, message: 'Each coach ID must be a valid MongoDB ObjectId' })
  coaches?: string[];

  @IsOptional()
  @IsArray({ message: 'Assistant coaches must be an array' })
  @IsMongoId({ each: true, message: 'Each assistant coach ID must be a valid MongoDB ObjectId' })
  assistantCoaches?: string[];

  @IsNotEmpty({ message: 'Season is required' })
  @IsEnum(SportsSeason, { message: 'Season must be one of: fall, winter, spring, summer, year-round' })
  season: SportsSeason;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'Max participants must be a number' })
  @Min(0, { message: 'Max participants must be 0 or greater' })
  maxParticipants?: number;

  @IsOptional()
  @IsEnum(SportsProgramType, { message: 'Type must be one of: competitive, recreational, both' })
  type?: SportsProgramType;

  @IsOptional()
  @IsArray({ message: 'Required equipment must be an array' })
  @IsString({ each: true, message: 'Each equipment item must be a string' })
  requiredEquipment?: string[];

  @IsOptional()
  @IsArray({ message: 'Venue must be an array' })
  @IsString({ each: true, message: 'Each venue must be a string' })
  venue?: string[];

  @IsOptional()
  @IsBoolean({ message: 'requiresPhysicalExam must be a boolean' })
  requiresPhysicalExam?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'requiresMedicalClearance must be a boolean' })
  requiresMedicalClearance?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'requiresConsentForm must be a boolean' })
  requiresConsentForm?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'eligibilityTrackingEnabled must be a boolean' })
  eligibilityTrackingEnabled?: boolean;
}

