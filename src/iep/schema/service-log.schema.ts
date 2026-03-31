import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ServiceLogDocument = ServiceLog & Document;

@Schema({ timestamps: true })
export class ServiceLog {
  @Prop({ required: true, type: Types.ObjectId, ref: 'IEP' })
  iepId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'StudentProfile' })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  serviceType: string; // 'speech_therapy', 'occupational_therapy', 'counseling', etc.

  @Prop({ required: true })
  serviceDate: Date;

  @Prop({ required: true })
  duration: number; // in minutes

  @Prop({ required: true })
  provider: string; // User ID or name

  @Prop()
  location: string;

  @Prop({ required: true })
  sessionNotes: string;

  @Prop({ type: [String] })
  goalsAddressed: string[]; // Goal IDs from IEP

  @Prop()
  progressNotes: string;

  @Prop({ type: Object })
  progressData: {
    [goalId: string]: {
      progressLevel: number; // 1-5 scale or percentage
      notes: string;
    };
  };

  @Prop()
  studentResponse: string;

  @Prop()
  nextSessionPlan: string;

  @Prop({ type: [String] })
  attachments: string[]; // File URLs

  @Prop({ default: false })
  parentNotified: boolean;

  @Prop()
  parentNotificationDate: Date;

  @Prop()
  makeUpSession: boolean;

  @Prop()
  makeUpReason: string;

  @Prop({ required: true })
  loggedBy: string;

  @Prop()
  verifiedBy: string;

  @Prop()
  verifiedDate: Date;
}

export const ServiceLogSchema = SchemaFactory.createForClass(ServiceLog);
