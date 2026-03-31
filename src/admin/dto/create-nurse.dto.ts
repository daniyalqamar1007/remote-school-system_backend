import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsNumber, IsArray, IsEnum, IsDateString } from 'class-validator';
import { UserGender, EmployementStatus } from 'src/types/enums/user.enum';

export class CreateNurseDto {
  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsNotEmpty({ message: 'First name is required' })
  @IsString({ message: 'First name must be a string' })
  firstName: string;

  @IsNotEmpty({ message: 'Last name is required' })
  @IsString({ message: 'Last name must be a string' })
  lastName: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'Profile picture must be a string' })
  profilePicture?: string;

  @IsOptional()
  @IsEnum(UserGender)
  gender?: UserGender;

  @IsOptional()
  @IsString({ message: 'Qualifications must be a string' })
  qualifications?: string;

  @IsOptional()
  @IsString({ message: 'Experience years must be a string' })
  experienceYears?: string;

  @IsOptional()
  @IsString({ message: 'Specialty must be a string' })
  speciality?: string;

  @IsOptional()
  @IsString({ message: 'License number must be a string' })
  licenseNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of joining must be a valid date' })
  dateOfJoining?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @IsOptional()
  @IsEnum(EmployementStatus)
  employmentType?: EmployementStatus;
}

