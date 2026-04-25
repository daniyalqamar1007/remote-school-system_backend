import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeeReminderLogDocument = FeeReminderLog & Document;

@Schema({ timestamps: true })
export class FeeReminderLog {
  @Prop({ type: Types.ObjectId, ref: 'School', required: true, index: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FeeInstallment', required: true, index: true })
  installmentId: Types.ObjectId;

  @Prop({ required: true, index: true })
  reminderDateKey: string;

  @Prop({ default: false })
  parentEmailSent: boolean;

  @Prop({ default: false })
  studentEmailSent: boolean;

  @Prop({ default: false })
  parentAlertCreated: boolean;

  @Prop({ trim: true })
  runType?: string;

  @Prop({ trim: true })
  triggeredBy?: string;

  @Prop({ trim: true, index: true })
  idempotencyKey?: string;

  @Prop({ type: Date, default: Date.now })
  runAt?: Date;
}

export const FeeReminderLogSchema = SchemaFactory.createForClass(FeeReminderLog);
FeeReminderLogSchema.index({ installmentId: 1, reminderDateKey: 1 }, { unique: true });
FeeReminderLogSchema.index({ schoolId: 1, idempotencyKey: 1 }, { sparse: true });
