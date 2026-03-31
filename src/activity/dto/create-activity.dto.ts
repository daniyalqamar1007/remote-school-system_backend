import { IsNotEmpty, IsString, IsOptional, IsMongoId } from 'class-validator';
import { Types } from 'mongoose';

export class CreateActivityDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsNotEmpty()
  @IsString()
  performBy: string;

  @IsOptional()
  @IsString()
  adminId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsMongoId()
  actorId: Types.ObjectId;
}
