import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from '../../auth/schemas/user.schema';

export type SchoolEventDocument = SchoolEvent & Document;

@Schema({ timestamps: true })
export class SchoolEvent extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: false })
  startTime?: string;

  @Prop({ required: false })
  endTime?: string;

  @Prop({ default: false })
  allDay: boolean;

  @Prop({ 
    enum: ['academic', 'sports', 'cultural', 'holiday', 'meeting', 'conference', 'exam', 'other'], 
    required: true 
  })
  category: string;

  @Prop({ required: false })
  location?: string;

  @Prop({ 
    enum: ['school-wide', 'grade-specific', 'class-specific', 'staff-only', 'parent-only'], 
    default: 'school-wide'
  })
  audience: string;

  @Prop({ type: [String], default: [] })
  targetGrades: string[]; // For grade-specific events

  @Prop({ type: [String], default: [] })
  targetClasses: string[]; // For class-specific events

  @Prop({ 
    enum: ['draft', 'published', 'cancelled'], 
    default: 'draft' 
  })
  status: string;

  @Prop({ default: false })
  requiresRSVP: boolean;

  @Prop({ default: 0 })
  maxAttendees: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: User | Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  updatedBy?: User | Types.ObjectId;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  academicYear: string;

  @Prop({ type: [String], default: [] })
  attachments: string[];

  @Prop({ default: false })
  sendNotification: boolean;

  @Prop({ required: false })
  notificationDate?: Date;

  @Prop({ default: 0 })
  priority: number; // 1 = high, 2 = medium, 3 = low

  @Prop({ type: Map, of: String, default: {} })
  metadata: Map<string, string>; // For additional event-specific data
}

export const SchoolEventSchema = SchemaFactory.createForClass(SchoolEvent);
