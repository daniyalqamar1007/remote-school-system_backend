import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ManualClearanceDto {
  @IsEnum(['paid', 'waived'])
  status: 'paid' | 'waived';

  @IsOptional()
  @IsString()
  note?: string;
}
