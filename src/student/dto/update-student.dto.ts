// srs-nest-main/src/student/dto/update-student.dto.ts

import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsDateString,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class UpdateStudentDto {
  @IsNotEmpty()
  @IsString()
  studentID: string;

  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsNotEmpty()
  @IsString()
  class: string;

  @IsString()
  emergencyContact: string;

  @IsNotEmpty()
  @IsString()
  section: string;

  @IsNotEmpty()
  @IsString()
  gender: string;

  @IsNotEmpty()
  @IsDateString()
  dob: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  phone: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsDateString()
  enrollDate: string;

  @IsNotEmpty()
  @IsDateString()
  expectedGraduation: string;

  @IsOptional()
  @IsArray()
  parents?: string[]; // Array of parent _id(s)

  @IsNotEmpty()
  @IsString()
  profilePhoto: string;

  @IsOptional()
  @IsArray()
  transcripts?: string[]; // Can store file URL or text

  @IsOptional()
  @IsBoolean()
  iipFlag?: boolean; // IIP-related info

  @IsBoolean()
  honorRolls: boolean; // Honor Rolls flag (default false)

  @IsBoolean()
  athletics?: boolean;

  @IsOptional()
  @IsString()
  clubs?: string; // Clubs participation

  @IsOptional()
  @IsString()
  lunch?: string; // Lunch preference

  @IsNotEmpty()
  @IsString()
  nationality: string; // Nationality of student
}
