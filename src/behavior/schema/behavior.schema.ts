// src/behavior/schema/behavior.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Behavior extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Teacher' })
  teacherId: Types.ObjectId;

  @Prop({ required: true, enum: ['positive', 'negative', 'neutral'] })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  date: string; // store as ISO string

  @Prop()
  location: string;

  @Prop()
  action: string;

  @Prop({ required: true, enum: ['resolved', 'pending', 'ongoing'], default: 'pending' })
  status: string;
}

export const BehaviorSchema = SchemaFactory.createForClass(Behavior);