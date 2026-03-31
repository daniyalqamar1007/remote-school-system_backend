import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangeSecretaryPasswordDto {
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @IsNotEmpty({ message: 'Confirm password is required' })
  @IsString({ message: 'Confirm password must be a string' })
  confirmPassword: string;
}

