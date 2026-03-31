// src/student/dto/create-student.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean, IsArray, MinLength, IsDate, IsDateString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateStudentDto {
  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a string' })
  firstName: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a string' })
  lastName: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsOptional()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsOptional()
  @IsString({ message: 'Student ID must be a string' })
  studentId?: string;

  @IsNotEmpty({ message: 'Class is required' })
  @IsString({ message: 'Class must be a string' })
  class: string;

  @IsNotEmpty({ message: 'Section is required' })
  @IsString({ message: 'Section must be a string' })
  section: string;

  @IsNotEmpty({ message: 'Gender is required' })
  @IsString({ message: 'Gender must be a string' })
  gender: string;

  @IsNotEmpty({ message: 'Date of birth is required' })
  @IsDateString({}, { message: 'Please provide a valid date of birth' })
  dob: string;

  @IsNotEmpty({ message: 'Address is required' })
  @IsString({ message: 'Address must be a string' })
  address: string;

  @IsNotEmpty({ message: 'Emergency contact is required' })
  emergencyContact: any; // Can be string or object

  @IsNotEmpty({ message: 'Enrollment date is required' })
  @IsDateString({}, { message: 'Please provide a valid enrollment date' })
  enrollDate: string;

  @IsNotEmpty({ message: 'Expected graduation date is required' })
  @IsDateString({}, { message: 'Please provide a valid expected graduation date' })
  expectedGraduation: string;

  @IsOptional()
  @IsString({ message: 'School ID must be a string' })
  schoolId?: string;

  @IsOptional()
  @IsString({ message: 'Blood group must be a string' })
  bloodGroup?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // Handle empty string or null
    if (!value || value === '' || value === '[]' || value === 'null') {
      return [];
    }
    // Handle string that might be JSON array
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        // If not JSON, treat as single string and return as array
        if (value.trim() !== '') {
          return [value];
        }
        return [];
      }
    }
    return value || [];
  })
  @IsArray({ message: 'Allergies must be an array of strings' })
  @IsString({ each: true, message: 'Each allergy must be a string' })
  allergies?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    // Handle empty string or null
    if (!value || value === '' || value === '[]' || value === 'null') {
      return [];
    }
    // Handle string that might be JSON array
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        // If not JSON, treat as single string and return as array
        if (value.trim() !== '') {
          return [value];
        }
        return [];
      }
    }
    return value || [];
  })
  @IsArray({ message: 'Medical conditions must be an array of strings' })
  @IsString({ each: true, message: 'Each medical condition must be a string' })
  medicalConditions?: string[];

  @IsOptional()
  @IsString({ message: 'Previous school must be a string' })
  previousSchool?: string;

  @IsOptional()
  @IsString({ message: 'Previous grade must be a string' })
  previousGrade?: string;

  @IsOptional()
  @IsString({ message: 'Nationality must be a string' })
  nationality?: string;

  @IsOptional()
  @IsString({ message: 'Religion must be a string' })
  religion?: string;

  @IsOptional()
  @IsString({ message: 'Transport mode must be a string' })
  transportMode?: string;

  @IsOptional()
  @IsString({ message: 'Bus route must be a string' })
  busRoute?: string;

  @IsOptional()
  @IsString({ message: 'Clubs must be a string' })
  clubs?: string;

  @IsOptional()
  @IsString({ message: 'Lunch preference must be a string' })
  lunch?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // Convert string "true"/"false" to boolean
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      return normalized === 'true' || normalized === '1';
    }
    if (typeof value === 'number') return value === 1;
    return Boolean(value);
  })
  @IsBoolean({ message: 'IIP flag must be a boolean' })
  iipFlag?: string;

  @IsOptional()
  @Transform(({ value }) => {
    // Convert string "true"/"false" to boolean
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      return normalized === 'true' || normalized === '1';
    }
    if (typeof value === 'number') return value === 1;
    return Boolean(value);
  })
  @IsBoolean({ message: 'Honor rolls must be a boolean' })
  honorRolls?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    // Convert string "true"/"false" to boolean
    if (value === undefined || value === null || value === '') {
      return false;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      return normalized === 'true' || normalized === '1';
    }
    if (typeof value === 'number') return value === 1;
    return Boolean(value);
  })
  @IsBoolean({ message: 'Athletics must be a boolean' })
  athletics?: boolean;

  // @IsOptional()
  // @IsString({ message: 'Profile photo must be a string' })
  // profilePhoto?: string;

  // @IsOptional()
  // @IsArray({ message: 'Transcripts must be an array' })
  // @IsString({ each: true, message: 'Each transcript URL must be a string' })
  // transcripts?: string[];

  @IsOptional()
  @Transform(({ value }) => {
    // Handle empty string or null
    if (!value || value === '' || value === '[]' || value === 'null') {
      return [];
    }
    // Handle string that might be JSON array
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return [value];
      }
    }
    return value || [];
  })
  @IsArray({ message: 'Parents must be an array of parent IDs' })
  @IsString({ each: true, message: 'Each parent ID must be a string' })
  parents?: string[];
}
