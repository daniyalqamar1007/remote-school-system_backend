import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HonorRollAwardDocument = HonorRollAward & Document;

@Schema({ timestamps: true })
export class HonorRollAward {
  @Prop({ required: true, type: Types.ObjectId, ref: 'School' })
  schoolId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  studentId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'HonorRollCriteria' })
  criteriaId: Types.ObjectId;

  @Prop({ required: true })
  academicYear: string;

  @Prop({ required: true })
  markingPeriod: string;

  @Prop({ required: true })
  gradeLevel: string;

  @Prop({ required: true })
  awardName: string;

  @Prop({ required: true })
  calculatedGPA: number;

  @Prop({ required: true })
  averageGrade: number;

  @Prop({ type: Object })
  gradeBreakdown: {
    [subject: string]: {
      grade: number;
      letterGrade: string;
      credits: number;
    };
  };

  @Prop({ type: [String] })
  qualifyingSubjects: string[];

  @Prop({ default: 'automatic' })
  awardType: string; // 'automatic' | 'manual_override'

  @Prop()
  manualOverrideReason: string;

  @Prop()
  manualOverrideBy: string;

  @Prop({ default: 'active' })
  status: string; // 'active' | 'revoked' | 'pending'

  @Prop()
  revokedBy: string;

  @Prop()
  revokedReason: string;

  @Prop()
  revokedDate: Date;

  @Prop({ default: false })
  notificationSent: boolean;

  @Prop()
  notificationSentDate: Date;

  @Prop({ required: true })
  calculatedBy: string;

  @Prop()
  verifiedBy: string;

  @Prop()
  verifiedDate: Date;
}

export const HonorRollAwardSchema = SchemaFactory.createForClass(HonorRollAward);
