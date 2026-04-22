import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeePolicyDocument = FeePolicy & Document;

@Schema({ timestamps: true })
export class FeePolicy {
  @Prop({ type: Types.ObjectId, ref: 'School', required: true, index: true })
  schoolId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  academicYear: string;

  @Prop({ required: true, trim: true, index: true })
  className: string;

  @Prop({ required: true })
  baseFee: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({ required: true, enum: ['monthly', 'yearly'], default: 'monthly' })
  installmentFrequency: string;

  @Prop({ required: true, min: 1, max: 31, default: 5 })
  dueDay: number;

  @Prop({ required: true, min: 0, default: 0 })
  graceDays: number;

  @Prop({ required: true, enum: ['fixed', 'percentage'], default: 'fixed' })
  lateFeeType: string;

  @Prop({ required: true, min: 0, default: 0 })
  lateFeeValue: number;

  @Prop({ required: true, enum: ['fixed', 'daily', 'percentage'], default: 'fixed' })
  fineType: string;

  @Prop({ required: true, min: 0, default: 0 })
  fineValue: number;

  @Prop({ required: true, min: 0, default: 0 })
  maxFineCap: number;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const FeePolicySchema = SchemaFactory.createForClass(FeePolicy);
FeePolicySchema.index({ schoolId: 1, academicYear: 1, className: 1, isActive: 1 });
