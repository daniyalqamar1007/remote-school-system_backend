import { IsEmail, IsEnum, IsMongoId, IsNotEmpty, IsOptional, IsString, MinLength, IsArray, ArrayMinSize, IsNumber } from 'class-validator';
import { UserGender } from '../../types/enums/user.enum';

export class CreateTeacherDto {
  @IsMongoId()
  @IsOptional()
  schoolId?: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(UserGender)
  @IsNotEmpty()
  gender: UserGender;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  // Optional fields
  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  profilePicture?: string;

  @IsString()
  @IsOptional()
  middleName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsOptional()
  designation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  departmentIds: string[];

  @IsString()
  @IsOptional()
  nationality?: string;

  @IsString()
  @IsOptional()
  dateOfJoining?: string;

  @IsNumber()
  @IsOptional()
  totalExperience?: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  qualifications?: string[];

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  certifications?: string[];

  @IsString()
  @IsOptional()
  createdBy?: string;
}
