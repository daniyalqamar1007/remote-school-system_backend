import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type ReportDocument = Report & Document;
export type ReportExecutionDocument = ReportExecution & Document;

@Schema({ timestamps: true })
export class Report {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, enum: [
    'student', 'teacher', 'grade', 'attendance', 'behavior', 'club', 
    'sports', 'parent', 'course', 'schedule', 'nurse', 'iep', 'honor-roll',
    'custom', 'financial', 'enrollment', 'academic-performance'
  ]})
  type: string;

  @Prop({ required: true })
  dataSource: string; // e.g., 'students', 'grades', 'attendance'

  @Prop([{
    field: { type: String, required: true },
    label: { type: String, required: true },
    aggregation: { type: String, enum: ['sum', 'avg', 'count', 'min', 'max', 'group', null], default: null },
    format: { type: String, enum: ['text', 'number', 'date', 'currency', 'percentage', 'boolean'], default: 'text' },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  }])
  columns: Array<{
    field: string;
    label: string;
    aggregation?: string;
    format: string;
    visible: boolean;
    order: number;
  }>;

  @Prop([{
    field: { type: String, required: true },
    operator: { 
      type: String, 
      required: true, 
      enum: [
        'equals', 'not_equals', 'contains', 'not_contains', 
        'greater_than', 'less_than', 'greater_equal', 'less_equal',
        'between', 'in', 'not_in', 'is_null', 'is_not_null',
        'starts_with', 'ends_with'
      ] 
    },
    value: { type: MongooseSchema.Types.Mixed },
    value2: { type: MongooseSchema.Types.Mixed } // For 'between' operator
  }])
  filters?: Array<{
    field: string;
    operator: string;
    value: any;
    value2?: any;
  }>;

  @Prop({ type: [String] })
  groupBy?: string[];

  @Prop([{
    field: { type: String, required: true },
    direction: { type: String, enum: ['asc', 'desc'], default: 'asc' }
  }])
  orderBy?: Array<{
    field: string;
    direction: string;
  }>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School' })
  schoolId?: Types.ObjectId;

  @Prop({ required: true, enum: ['draft', 'published', 'archived'], default: 'draft' })
  status: string;

  @Prop({ enum: ['table', 'chart', 'graph', 'summary'], default: 'table' })
  visualizationType?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  chartOptions?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  lastModifiedBy?: Types.ObjectId;

  @Prop({ default: false })
  isTemplate: boolean; // If true, can be used as a template for new reports

  @Prop({ default: false })
  isPublic: boolean; // If true, can be used by other users in the same school

  @Prop()
  lastRun?: Date;

  @Prop({ default: 0 })
  runCount: number;

  @Prop({ type: MongooseSchema.Types.Mixed })
  schedule?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
    cronExpression?: string;
    recipients?: string[]; // Email addresses to send report to
    format?: 'pdf' | 'excel' | 'csv';
  };
}

@Schema({ timestamps: true })
export class ReportExecution {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Report', required: true })
  reportId: Types.ObjectId;

  @Prop({ required: true, enum: ['pending', 'running', 'completed', 'failed', 'cancelled'] })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  executedBy: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School' })
  schoolId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed })
  parameters?: Record<string, any>; // Runtime parameters that override report defaults

  @Prop({ enum: ['pdf', 'excel', 'csv', 'json'], default: 'excel' })
  format: string;

  @Prop()
  fileUrl?: string; // URL to generated report file

  @Prop()
  fileSize?: number; // Size in bytes

  @Prop()
  recordCount?: number; // Number of records in the report

  @Prop()
  startedAt?: Date;

  @Prop()
  completedAt?: Date;

  @Prop()
  error?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
export const ReportExecutionSchema = SchemaFactory.createForClass(ReportExecution);

// Create indexes for better query performance
ReportSchema.index({ name: 1 });
ReportSchema.index({ type: 1 });
ReportSchema.index({ dataSource: 1 });
ReportSchema.index({ status: 1 });
ReportSchema.index({ schoolId: 1 });
ReportSchema.index({ createdBy: 1 });
ReportSchema.index({ isTemplate: 1 });
ReportSchema.index({ createdAt: -1 });

ReportExecutionSchema.index({ reportId: 1 });
ReportExecutionSchema.index({ status: 1 });
ReportExecutionSchema.index({ executedBy: 1 });
ReportExecutionSchema.index({ schoolId: 1 });
ReportExecutionSchema.index({ createdAt: -1 });

