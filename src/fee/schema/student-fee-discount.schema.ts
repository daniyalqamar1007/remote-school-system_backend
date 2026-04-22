import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentFeeDiscountDocument = StudentFeeDiscount & Document;

@Schema({ timestamps: true })
export class StudentFeeDiscount {
  @Prop({ type: Types.ObjectId, ref: 'School', required: true, index: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Student', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'FeePolicy', required: true, index: true })
  feePolicyId: Types.ObjectId;

  @Prop({ required: true, enum: ['fixed', 'percentage'] })
  discountType: string;

  @Prop({ required: true, min: 0 })
  discountValue: number;

  @Prop({ trim: true })
  reason?: string;

  @Prop({ type: Date })
  effectiveFrom?: Date;

  @Prop({ type: Date })
  effectiveTo?: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;
}

export const StudentFeeDiscountSchema = SchemaFactory.createForClass(StudentFeeDiscount);
StudentFeeDiscountSchema.index({ schoolId: 1, studentId: 1, isActive: 1 });
