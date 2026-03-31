// src/behavior/dto/create-behavior.dto.ts

import { IsMongoId, IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateBehaviorDto {
  @IsMongoId()
  studentId: string;

  @IsMongoId()
  @IsOptional()
  teacherId?: string;

  @IsEnum(['positive', 'negative', 'neutral'])
  type: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  description: string;

  @IsString()
  @IsNotEmpty()
  date: string; // ISO string

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  action?: string;

  @IsEnum(['resolved', 'pending', 'ongoing'])
  @IsOptional()
  status?: string;
}