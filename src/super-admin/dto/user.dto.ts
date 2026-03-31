import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean, IsArray, IsEnum, MinLength, IsDate, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../../auth/schemas/user.schema';

export class StudentRelationshipDto {
  @IsNotEmpty()
  @IsString()
  studentId: string;

  @IsNotEmpty()
  @IsString()
  relationship: string; // 'Father', 'Mother', 'Guardian', etc.

  @IsOptional()
  @IsBoolean()
  isPrimaryContact?: boolean;

  @IsOptional()
  @IsBoolean()
  hasPickupPermission?: boolean;
}

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @IsNotEmpty()
  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsArray()
  customRoles?: string[];

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;

  // Student-specific fields
  @IsOptional()
  @IsString()
  studentId?: string; // School-specific student ID

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateOfBirth?: Date;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  gradeLevel?: string;

  @IsOptional()
  @IsString()
  section?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  parentIds?: string[]; // For students - which parents to link

  // Parent-specific fields
  @IsOptional()
  @IsString()
  occupation?: string;

  @IsOptional()
  @IsString()
  workplace?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StudentRelationshipDto)
  studentRelationships?: StudentRelationshipDto[]; // For parents - which students to link

  // Teacher-specific fields
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjects?: string[];

  // Admin-specific fields
  @IsOptional()
  @IsBoolean()
  isSchoolAdmin?: boolean; // For principal/admin role

  // Common address fields
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
  studentID?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsArray()
  customRoles?: string[];

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}

export class ResetPasswordDto {
  @IsOptional()
  @MinLength(8)
  newPassword?: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
