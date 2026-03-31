import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SystemMonitorDocument = SystemMonitor & Document;

@Schema({ timestamps: true })
export class SystemMonitor {
  @Prop({ required: true })
  metricType: string; // 'cpu', 'memory', 'disk', 'network', 'database', 'api_response_time'

  @Prop({ required: true })
  value: number;

  @Prop({ type: String, required: false })
  unit: string; // '%', 'MB', 'GB', 'ms', 'requests/min'

  @Prop({ required: true })
  timestamp: Date;

  @Prop({ type: String, required: false })
  hostname: string;

  @Prop({ type: String, required: false })
  source: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  metadata: any;

  @Prop({ 
    type: {
      warning: { type: Number, required: false },
      critical: { type: Number, required: false }
    },
    required: false
  })
  thresholds: {
    warning?: number;
    critical?: number;
  };

  @Prop({ default: 'normal', enum: ['normal', 'warning', 'critical'] })
  alertLevel: string;
}

export const SystemMonitorSchema = SchemaFactory.createForClass(SystemMonitor);
