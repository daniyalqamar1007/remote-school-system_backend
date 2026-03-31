import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Activity extends Document {
  @Prop({ required: true })
  title: string;

  @Prop()
  subtitle: string;

  @Prop({ required: true, enum: ['SUPER_ADMIN', 'Admin', 'Student', 'Teacher', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'NURSE', 'SECRETARY'] })
  performBy: string;

  @Prop()
  adminId?: Types.ObjectId; // ID of the admin who performed this action

  @Prop()
  teacherId?: string; // ID of the teacher who performed this action

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId: Types.ObjectId;  // Generic ID for the user who performed this action

  // Timestamp fields (automatically managed by MongoDB when timestamps: true)
  createdAt?: Date;
  updatedAt?: Date;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
