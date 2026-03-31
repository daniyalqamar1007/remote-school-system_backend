import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = AuditLog & Document & {
  createdAt: Date;
  updatedAt: Date;
};

@Schema({ timestamps: true })
export class AuditLog {
  @Prop({ required: true })
  action: string; // 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', etc.

  @Prop({ required: true })
  entityType: string; // 'User', 'School', 'Student', etc.

  @Prop()
  entityId?: string; // ID of the affected entity

  @Prop({ required: true })
  performedBy: string; // User ID who performed the action

  @Prop()
  performedByName?: string; // User name for quick display

  @Prop({ required: true })
  performedByRole: string; // User role

  @Prop()
  schoolId?: string; // School context if applicable

  @Prop({ type: MongooseSchema.Types.Mixed })
  oldValues?: any; // Previous values for UPDATE actions

  @Prop({ type: MongooseSchema.Types.Mixed })
  newValues?: any; // New values for CREATE/UPDATE actions

  @Prop()
  ipAddress?: string;

  @Prop()
  userAgent?: string;

  @Prop()
  description?: string; // Human-readable description

  @Prop({ default: 'SUCCESS' })
  status: string; // 'SUCCESS', 'FAILED', 'PENDING'

  @Prop()
  errorMessage?: string; // If status is FAILED

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: any; // Additional context data
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
