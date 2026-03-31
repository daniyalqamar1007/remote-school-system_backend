import { IsNotEmpty, IsString, IsOptional, IsArray, IsEnum, IsBoolean, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class ColumnDto {
  @IsNotEmpty()
  @IsString()
  field: string;

  @IsNotEmpty()
  @IsString()
  label: string;

  @IsOptional()
  @IsEnum(['sum', 'avg', 'count', 'min', 'max', 'group', null])
  aggregation?: string;

  @IsOptional()
  @IsEnum(['text', 'number', 'date', 'currency', 'percentage', 'boolean'])
  format?: string;

  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  order?: number;
}

export class FilterDto {
  @IsNotEmpty()
  @IsString()
  field: string;

  @IsNotEmpty()
  @IsEnum([
    'equals', 'not_equals', 'contains', 'not_contains',
    'greater_than', 'less_than', 'greater_equal', 'less_equal',
    'between', 'in', 'not_in', 'is_null', 'is_not_null',
    'starts_with', 'ends_with'
  ])
  operator: string;

  @IsOptional()
  value?: any;

  @IsOptional()
  value2?: any;
}

export class OrderByDto {
  @IsNotEmpty()
  @IsString()
  field: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  direction?: string;
}

export class ScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly', 'custom'])
  frequency?: string;

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsEnum(['pdf', 'excel', 'csv'])
  format?: string;
}

export class CreateReportDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsEnum([
    'student', 'teacher', 'grade', 'attendance', 'behavior', 'club',
    'sports', 'parent', 'course', 'schedule', 'nurse', 'iep', 'honor-roll',
    'custom', 'financial', 'enrollment', 'academic-performance'
  ])
  type: string;

  @IsNotEmpty()
  @IsString()
  dataSource: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnDto)
  columns: ColumnDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterDto)
  filters?: FilterDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupBy?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderByDto)
  orderBy?: OrderByDto[];

  @IsOptional()
  @IsString()
  schoolId?: string;

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsEnum(['table', 'chart', 'graph', 'summary'])
  visualizationType?: string;

  @IsOptional()
  @IsObject()
  chartOptions?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto;
}

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ColumnDto)
  columns?: ColumnDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterDto)
  filters?: FilterDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  groupBy?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderByDto)
  orderBy?: OrderByDto[];

  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: string;

  @IsOptional()
  @IsEnum(['table', 'chart', 'graph', 'summary'])
  visualizationType?: string;

  @IsOptional()
  @IsObject()
  chartOptions?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isTemplate?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleDto)
  schedule?: ScheduleDto;
}

export class ExecuteReportDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilterDto)
  filters?: FilterDto[];

  @IsOptional()
  @IsEnum(['pdf', 'excel', 'csv', 'json'])
  format?: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;
}

