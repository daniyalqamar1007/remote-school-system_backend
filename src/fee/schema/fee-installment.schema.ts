import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeeInstallmentDocument = FeeInstallment & Document;

@Schema({ timestamps: true })
export class FeeInstallment {
  @Prop({ type: Types.ObjectId, ref: 'School', required: true, index: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FeePolicy', required: true, index: true })
  feePolicyId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  academicYear: string;

  @Prop({ required: true, min: 1 })
  installmentNo: number;

  @Prop({ required: true })
  installmentAmount: number;

  @Prop({ required: true, min: 0, default: 0 })
  discountAmount: number;

  @Prop({ required: true, min: 0, default: 0 })
  paidAmount: number;

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ required: true, enum: ['pending', 'partial', 'paid', 'overdue', 'waived'], default: 'pending', index: true })
  status: string;

  @Prop({ min: 0, default: 0 })
  lateFeeApplied: number;

  @Prop({ min: 0, default: 0 })
  fineApplied: number;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  clearedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  clearedBy?: Types.ObjectId;

  @Prop({ trim: true })
  clearanceNote?: string;
}

export const FeeInstallmentSchema = SchemaFactory.createForClass(FeeInstallment);
FeeInstallmentSchema.index({ schoolId: 1, studentId: 1, academicYear: 1, installmentNo: 1 }, { unique: true });
FeeInstallmentSchema.index({ schoolId: 1, dueDate: 1, status: 1 });
