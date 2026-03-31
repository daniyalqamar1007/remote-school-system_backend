import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ParentLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}