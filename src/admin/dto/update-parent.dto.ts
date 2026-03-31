// src/admin/dto/update-parent.dto.ts
import { IsEmail, IsOptional, IsString, MinLength, IsNotEmpty, IsIn, IsArray, IsBoolean } from 'class-validator';

export class UpdateParentDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsEmail()
    @IsNotEmpty({ message: 'Email is required' })
    email?: string;

    @IsOptional()
    @IsNotEmpty({ message: 'Password is required' })
    @MinLength(8, { message: 'Password must be at least 8 characters long' })
    password?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    profilePicture?: string;

    @IsOptional()
    @IsIn(['FATHER', 'MOTHER', 'GUARDIAN'], { message: 'parentType must be FATHER, MOTHER or GUARDIAN' })
    parentType?: 'FATHER' | 'MOTHER' | 'GUARDIAN';

    @IsOptional()
    @IsArray()
    studentIds?: string[];

    @IsOptional()
    @IsIn(['MALE', 'FEMALE', 'OTHER'], { message: 'gender must be MALE, FEMALE or OTHER' })
    gender?: string;

    @IsOptional()
    @IsBoolean()
    isPrimaryContact?: boolean;

    @IsOptional()
    @IsBoolean()
    hasPickupPermission?: boolean;
}
