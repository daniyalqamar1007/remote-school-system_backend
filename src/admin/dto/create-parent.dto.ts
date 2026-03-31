// src/admin/dto/create-parent.dto.ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsArray, IsBoolean, IsEnum } from 'class-validator';
import { ParentType, UserGender } from 'src/types/enums/user.enum';

export class CreateParentDto {
    @IsOptional()
    @IsString({ message: 'School ID is required' })
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

    @IsEnum(UserGender)
    @IsNotEmpty()
    gender: UserGender;

    @IsNotEmpty({ message: 'Parent type is required' })
    @IsEnum(ParentType)
    parentType: ParentType;

    @IsOptional()
    @IsArray()
    studentIds?: string[];

    @IsOptional()
    @IsBoolean()
    isPrimaryContact?: boolean;

    @IsOptional()
    @IsBoolean()
    hasPickupPermission?: boolean;
}


