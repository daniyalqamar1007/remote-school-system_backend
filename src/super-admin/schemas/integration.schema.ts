import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';

export type IntegrationDocument = Integration & Document;

@Schema({ timestamps: true })
export class Integration {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['lms', 'sis', 'financial', 'hr', 'library', 'transportation', 'communication', 'assessment', 'reporting', 'other'] })
  type: string;

  @Prop({ required: true, enum: ['active', 'inactive', 'error', 'testing'], default: 'inactive' })
  status: string;

  @Prop({ required: true, trim: true })
  provider: string;

  @Prop({ trim: true })
  version?: string;

  @Prop({ required: true, trim: true })
  endpoint: string;

  @Prop({ required: true, enum: ['oauth2', 'api-key', 'basic-auth', 'jwt', 'custom'] })
  authType: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  credentials?: Record<string, any>; // Encrypted credentials

  @Prop()
  lastSync?: Date;

  @Prop()
  nextSync?: Date;

  @Prop({ enum: ['manual', 'hourly', 'daily', 'weekly', 'monthly'], default: 'manual' })
  syncFrequency: string;

  @Prop({ enum: ['import', 'export', 'bidirectional'], default: 'bidirectional' })
  dataDirection: string;

  @Prop([{
    localField: { type: String, required: true },
    remoteField: { type: String, required: true },
    dataType: { type: String, enum: ['string', 'number', 'boolean', 'date', 'object'], required: true },
    required: { type: Boolean, default: false },
    transformation: { type: String } // Optional transformation rule
  }])
  mappedFields: Array<{
    localField: string;
    remoteField: string;
    dataType: string;
    required: boolean;
    transformation?: string;
  }>;

  @Prop({ 
    type: MongooseSchema.Types.Mixed,
    default: {
      timeout: 30000,
      retryAttempts: 3,
      batchSize: 100,
      enableLogging: true,
      validateData: true,
      autoSync: false,
      notifications: true
    }
  })
  settings: {
    timeout: number;
    retryAttempts: number;
    batchSize: number;
    enableLogging: boolean;
    validateData: boolean;
    autoSync: boolean;
    notifications: boolean;
  };

  @Prop({ 
    type: MongooseSchema.Types.Mixed,
    default: {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      lastSyncDuration: 0,
      averageSyncTime: 0,
      recordsProcessed: 0,
      errorRate: 0
    }
  })
  metrics: {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    lastSyncDuration: number;
    averageSyncTime: number;
    recordsProcessed: number;
    errorRate: number;
  };

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);

export type IntegrationLogDocument = IntegrationLog & Document;

@Schema({ timestamps: true })
export class IntegrationLog {
  @Prop({ required: true })
  integrationId: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop()
  endTime?: Date;

  @Prop({ required: true, enum: ['running', 'completed', 'failed', 'cancelled'] })
  status: string;

  @Prop({ default: 0 })
  recordsProcessed: number;

  @Prop({ default: 0 })
  recordsSuccessful: number;

  @Prop({ default: 0 })
  recordsFailed: number;

  @Prop({ type: [String] })
  errorMessages?: string[]; // Renamed from 'errors' to avoid reserved pathname warning

  @Prop({ type: [String] })
  warnings?: string[];

  @Prop({ default: 0 })
  duration: number; // milliseconds

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  summary?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;

  @Prop({ trim: true })
  triggeredBy?: string;
}

export const IntegrationLogSchema = SchemaFactory.createForClass(IntegrationLog);

// Create indexes for better query performance
IntegrationSchema.index({ name: 1 });
IntegrationSchema.index({ type: 1 });
IntegrationSchema.index({ status: 1 });
IntegrationSchema.index({ provider: 1 });
IntegrationSchema.index({ syncFrequency: 1 });
IntegrationSchema.index({ nextSync: 1 });
IntegrationSchema.index({ createdAt: -1 });

IntegrationLogSchema.index({ integrationId: 1 });
IntegrationLogSchema.index({ status: 1 });
IntegrationLogSchema.index({ startTime: -1 });
IntegrationLogSchema.index({ integrationId: 1, startTime: -1 });
