import { IsString, IsOptional } from 'class-validator';

export class UploadDocumentDto {
  @IsString() @IsOptional()
  comment?: string;
}