import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SystemAlertDocument = SystemAlert & Document;

@Schema({ timestamps: true })
export class SystemAlert {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  message: string;

  @Prop({ required: true, enum: ['info', 'warning', 'error', 'critical'] })
  type: string;

  @Prop({ required: true, enum: ['system', 'security', 'performance', 'maintenance', 'user', 'integration'] })
  category: string;

  @Prop({ required: true, enum: ['low', 'medium', 'high', 'critical'] })
  priority: string;

  @Prop({ required: true, enum: ['active', 'acknowledged', 'resolved', 'ignored'], default: 'active' })
  status: string;

  @Prop({ trim: true })
  source?: string;

  @Prop({ type: [String] })
  affectedSystems?: string[];

  @Prop({ type: [String] })
  actionItems?: string[];

  @Prop()
  acknowledgedAt?: Date;

  @Prop({ trim: true })
  acknowledgedBy?: string;

  @Prop()
  resolvedAt?: Date;

  @Prop({ trim: true })
  resolvedBy?: string;

  @Prop()
  ignoredAt?: Date;

  @Prop({ trim: true })
  ignoredBy?: string;

  @Prop({ trim: true })
  resolution?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;

  @Prop()
  expiresAt?: Date;
}

export const SystemAlertSchema = SchemaFactory.createForClass(SystemAlert);

export type AlertRuleDocument = AlertRule & Document;

@Schema({ timestamps: true })
export class AlertRule {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true })
  condition: string; // e.g., "memory_usage > 85"

  @Prop({ required: true })
  threshold: number;

  @Prop({ required: true })
  duration: number; // minutes

  @Prop({ required: true, enum: ['low', 'medium', 'high', 'critical'] })
  severity: string;

  @Prop({ required: true, enum: ['system', 'security', 'performance', 'maintenance', 'user', 'integration', 'data'] })
  category: string;

  @Prop({ default: true })
  enabled: boolean;

  @Prop([{
    type: { type: String, enum: ['email', 'sms', 'slack', 'webhook'], required: true },
    target: { type: String, required: true },
    enabled: { type: Boolean, default: true }
  }])
  notifications: Array<{
    type: string;
    target: string;
    enabled: boolean;
  }>;

  @Prop({ default: 5 })
  cooldown: number; // minutes between notifications

  @Prop()
  lastTriggered?: Date;

  @Prop({ default: 0 })
  triggerCount: number;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const AlertRuleSchema = SchemaFactory.createForClass(AlertRule);

export type NotificationTemplateDocument = NotificationTemplate & Document;

@Schema({ timestamps: true })
export class NotificationTemplate {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, enum: ['email', 'sms', 'slack', 'webhook'] })
  type: string;

  @Prop({ trim: true })
  subject?: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: [String] })
  variables?: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, any>;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const NotificationTemplateSchema = SchemaFactory.createForClass(NotificationTemplate);

// Create indexes for better query performance
SystemAlertSchema.index({ status: 1 });
SystemAlertSchema.index({ priority: 1 });
SystemAlertSchema.index({ category: 1 });
SystemAlertSchema.index({ type: 1 });
SystemAlertSchema.index({ createdAt: -1 });

AlertRuleSchema.index({ name: 1 });
AlertRuleSchema.index({ enabled: 1 });
AlertRuleSchema.index({ category: 1 });
AlertRuleSchema.index({ severity: 1 });

NotificationTemplateSchema.index({ name: 1 });
NotificationTemplateSchema.index({ type: 1 });
