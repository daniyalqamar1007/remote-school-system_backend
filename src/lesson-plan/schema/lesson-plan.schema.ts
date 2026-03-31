import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LessonPlanDocument = LessonPlan & Document;

export enum LessonPlanStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REVISION_REQUIRED = 'revision_required',
}

@Schema({ timestamps: true })
export class LessonPlan {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  teacherId: Types.ObjectId;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop([String])
  objectives: string[];

  @Prop([String])
  materials: string[];

  @Prop({ required: true })
  duration: number; // in minutes

  @Prop({ 
    type: String, 
    enum: LessonPlanStatus, 
    default: LessonPlanStatus.PENDING 
  })
  status: LessonPlanStatus;

  @Prop([String])
  reviewComments: string[];

  @Prop([String])
  attachments: string[];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  submittedAt: Date;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const LessonPlanSchema = SchemaFactory.createForClass(LessonPlan);
