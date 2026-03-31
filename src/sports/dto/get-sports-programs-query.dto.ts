import { IsOptional, IsString, IsEnum, IsBoolean, IsMongoId, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';
import { SportsSeason, SportsProgramType } from 'src/types/enums/sports.enum';

export class GetSportsProgramsQueryDto {

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'Page must be a number' })
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt({ message: 'Limit must be a number' })
  limit?: number;

  @IsOptional()
  @IsMongoId({ message: 'School ID must be a valid MongoDB ObjectId' })
  schoolId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      return normalized === 'true' || normalized === '1';
    }
    if (typeof value === 'number') return value === 1;
    return Boolean(value);
  })
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @IsOptional()
  @IsEnum(SportsSeason, {
    message: `Season must be one of: ${Object.values(SportsSeason).join(', ')}`
  })
  season?: SportsSeason;

  @IsOptional()
  @IsEnum(SportsProgramType, {
    message: `Type must be one of: ${Object.values(SportsProgramType).join(', ')}`
  })
  type?: SportsProgramType;

  @IsOptional()
  @IsString({ message: 'Search must be a string' })
  search?: string;
}

