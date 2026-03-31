import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type ScheduledJobDocument = ScheduledJob & Document;

@Schema({ timestamps: true })
export class ScheduledJob {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  schedule: string; // Cron expression

  @Prop({ default: true })
  enabled: boolean;

  @Prop({ required: true, enum: ['active', 'inactive', 'paused', 'error'], default: 'inactive' })
  status: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  parameters?: Record<string, any>;

  @Prop([{
    type: { type: String, enum: ['email', 'sms', 'slack', 'webhook'], required: true },
    target: { type: String, required: true },
    enabled: { type: Boolean, default: true }
  }])
  notifications?: Array<{
    type: string;
    target: string;
    enabled: boolean;
  }>;

  @Prop()
  lastRun?: Date;

  @Prop()
  nextRun?: Date;

  @Prop({ default: 0 })
  executionCount: number;

  @Prop({ default: 0 })
  successCount: number;

  @Prop({ default: 0 })
  failureCount: number;

  @Prop({ default: 0 })
  averageRuntime: number; // in milliseconds

  @Prop([{
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    status: { type: String, enum: ['running', 'completed', 'failed', 'cancelled'], required: true },
    duration: { type: Number }, // in milliseconds
    output: { type: String },
    error: { type: String }
  }])
  executionHistory?: Array<{
    startTime: Date;
    endTime?: Date;
    status: string;
    duration?: number;
    output?: string;
    error?: string;
  }>;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const ScheduledJobSchema = SchemaFactory.createForClass(ScheduledJob);

// Create indexes for better query performance
ScheduledJobSchema.index({ name: 1 });
ScheduledJobSchema.index({ type: 1 });
ScheduledJobSchema.index({ status: 1 });
ScheduledJobSchema.index({ enabled: 1 });
ScheduledJobSchema.index({ nextRun: 1 });
ScheduledJobSchema.index({ createdAt: -1 });
