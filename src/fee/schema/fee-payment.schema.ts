import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeePaymentDocument = FeePayment & Document;

@Schema({ timestamps: true })
export class FeePayment {
  @Prop({ type: Types.ObjectId, ref: 'School', required: true, index: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FeeInstallment', required: true, index: true })
  installmentId: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  academicYear: string;

  @Prop({ required: true, min: 0.01 })
  amount: number;

  @Prop({ required: true, trim: true, index: true })
  receiptNo: string;

  @Prop({ required: true, enum: ['manual_cash', 'manual_bank', 'manual_adjustment'], default: 'manual_cash' })
  paymentMode: string;

  @Prop({ required: true, enum: ['captured', 'pending', 'failed', 'reversed'], default: 'captured' })
  transactionStatus: string;

  @Prop({ required: true, enum: ['manual', 'mock'], default: 'manual' })
  paymentProvider: string;

  @Prop({ trim: true })
  providerTransactionId?: string;

  @Prop({ trim: true })
  externalPaymentId?: string;

  @Prop({ trim: true })
  referenceNo?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  recordedBy?: Types.ObjectId;

  @Prop({ trim: true })
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reversedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reversedAt?: Date;

  @Prop({ trim: true })
  reversalReason?: string;
}

export const FeePaymentSchema = SchemaFactory.createForClass(FeePayment);
FeePaymentSchema.index({ schoolId: 1, installmentId: 1, createdAt: -1 });
FeePaymentSchema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
FeePaymentSchema.index({ schoolId: 1, academicYear: 1, studentId: 1, createdAt: -1 });
FeePaymentSchema.index({ schoolId: 1, receiptNo: 1 }, { unique: true });
