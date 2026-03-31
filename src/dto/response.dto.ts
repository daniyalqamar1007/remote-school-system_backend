import { Field, Int, ObjectType } from '@nestjs/graphql';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

@ObjectType()
export class ResponseDto {
  @Field(() => Boolean)
  @IsNotEmpty()
  @IsBoolean()
  success?: boolean;

  @Field(() => Int)
  @IsNotEmpty()
  @IsNumber()
  status: number;

  @IsOptional()
  data?: any; // If you want to validate `assistant`, you can replace `any` with a proper type or class.

  @Field(() => String)
  @IsOptional()
  @IsString()
  msg?: string;
}
