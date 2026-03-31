import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CreateGuardianDto {
  @IsNotEmpty()
  @IsString()
  guardianName: string;

  @IsNotEmpty()
  @IsEmail()
  guardianEmail: string;

  @IsNotEmpty()
  @IsString()
  guardianPhone: string;

  // @IsNotEmpty()
  @IsString()
  guardianPhoto: string;

  @IsNotEmpty()
  @IsString()
  guardianRelation: string;

  @IsNotEmpty()
  @IsString()
  guardianProfession: string;
}
