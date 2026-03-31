import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CustomReportDocument = CustomReport & Document;

@Schema({ timestamps: true })
export class CustomReport {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  dataSource: string;

  @Prop([{
    field: { type: String, required: true },
    label: { type: String, required: true },
    aggregation: { type: String, enum: ['sum', 'avg', 'count', 'min', 'max', null], default: null },
    format: { type: String, enum: ['text', 'number', 'date', 'currency', 'percentage'], default: 'text' }
  }])
  columns: Array<{
    field: string;
    label: string;
    aggregation?: string;
    format: string;
  }>;

  @Prop([{
    field: { type: String, required: true },
    operator: { type: String, required: true, enum: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'between', 'in', 'not_in'] },
    value: { type: String, required: true }
  }])
  filters?: Array<{
    field: string;
    operator: string;
    value: string;
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

  @Prop({ required: true, enum: ['draft', 'published', 'archived'], default: 'draft' })
  status: string;

  @Prop({ enum: ['table', 'chart', 'graph'], default: 'table' })
  visualizationType?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  chartOptions?: Record<string, any>;

  @Prop()
  lastRun?: Date;

  @Prop({ default: 0 })
  runCount: number;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const CustomReportSchema = SchemaFactory.createForClass(CustomReport);

// Create indexes for better query performance
CustomReportSchema.index({ name: 1 });
CustomReportSchema.index({ dataSource: 1 });
CustomReportSchema.index({ status: 1 });
CustomReportSchema.index({ createdBy: 1 });
CustomReportSchema.index({ createdAt: -1 });
