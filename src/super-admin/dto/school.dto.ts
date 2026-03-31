import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsEmail, IsArray, IsNumber, ValidateNested, IsObject, ValidateIf, IsEnum } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { IsNotFutureYear } from '../../utils/validators/year.validator';
import { SchoolType } from '../../../utils/enum';

class AddressDto {
  @IsNotEmpty()
  @IsString()
  street: string;

  @IsNotEmpty()
  @IsString()
  city: string;

  @IsNotEmpty()
  @IsString()
  state: string;

  @IsOptional()
  @IsString()
  zipCode?: string;

  @IsNotEmpty()
  @IsString()
  country: string;
}

export class CreateSchoolDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  code?: string; // Changed to optional to allow auto-generation

  // make it enum
  @IsOptional()
  @IsEnum(SchoolType) 
  type?: SchoolType;

  // Address as object to match schema
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    // accept either a string id or an object like { _id: '...' } or { id: '...' }
    if (typeof value === 'object') return value._id ?? value.id ?? String(value);
    return String(value);
  })
  @IsString()
  adminId?: string; // Reference to user ID

  @IsOptional()
  @IsNumber()
  @IsNotFutureYear()
  establishedYear?: number;

  @IsOptional()
  @IsNumber()
  studentCapacity?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gradelevels?: string[];

  @IsOptional()
  @IsString()
  academicYearStart?: string;

  @IsOptional()
  @IsString()
  academicYearEnd?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  maxStudentsPerClass?: number;

  @IsOptional()
  @IsObject()
  settings?: {
    allowParentRegistration?: boolean;
    requireEmailVerification?: boolean;
    maxStudentsPerClass?: number;
    attendanceGracePeriod?: number;
  };
}

export class UpdateSchoolDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object') return value._id ?? value.id ?? String(value);
    return String(value);
  })
  @IsString()
  adminId?: string;

  @IsOptional()
  @IsNumber()
  @IsNotFutureYear()
  establishedYear?: number;

  @IsOptional()
  @IsNumber()
  studentCapacity?: number;

  @IsOptional()
  @IsArray()
  gradelevels?: string[];

  @IsOptional()
  @IsString()
  academicYearStart?: string;

  @IsOptional()
  @IsString()
  academicYearEnd?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  maxStudentsPerClass?: number;

  @IsOptional()
  settings?: {
    allowParentRegistration?: boolean;
    requireEmailVerification?: boolean;
    maxStudentsPerClass?: number;
    attendanceGracePeriod?: number;
  };
}
