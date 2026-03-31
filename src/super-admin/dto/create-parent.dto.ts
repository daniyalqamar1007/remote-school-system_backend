// src/super-admin/dto/create-parent.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsBoolean, MinLength, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateParentDto {
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

    @IsNotEmpty({ message: 'School ID is required' })
    @IsString({ message: 'School ID must be a string' })
    schoolId: string;

    @IsOptional()
    @IsString({ message: 'Phone must be a string' })
    phone?: string;

    @IsOptional()
    address?: string | {
        street?: string;
        city?: string;
        state?: string;
        zipCode?: string;
    };

    @IsOptional()
    @IsString({ message: 'Occupation must be a string' })
    occupation?: string;

    @IsOptional()
    @IsString({ message: 'Nationality must be a string' })
    nationality?: string;

    @IsOptional()
    @IsString({ message: 'Gender must be a string' })
    gender?: string;

    @IsOptional()
    @Type(() => Date)
    @IsDate({ message: 'Please provide a valid date of birth' })
    dateOfBirth?: Date;

    @IsOptional()
    emergencyContact?: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        relationship?: string;
    };

    @IsOptional()
    @IsString({ message: 'Profile picture must be a string' })
    profilePicture?: string;
}