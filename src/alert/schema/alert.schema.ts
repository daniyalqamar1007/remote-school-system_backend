import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AlertDocument = Alert & Document;

@Schema({ timestamps: true })
export class Alert {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  parentId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Boolean, default: false })
  read: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Student', required: false })
  studentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Grade', required: false })
  gradeId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  alertType?: string; // 'grade', 'attendance', 'announcement', etc.

  @Prop({ type: Types.ObjectId, ref: 'School', required: false })
  schoolId?: Types.ObjectId;
}

export const AlertSchema = SchemaFactory.createForClass(Alert);
