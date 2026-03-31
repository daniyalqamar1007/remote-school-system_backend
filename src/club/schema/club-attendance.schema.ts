import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClubAttendanceDocument = ClubAttendance & Document;

@Schema({ timestamps: true })
export class ClubAttendance {
  @Prop({ type: Types.ObjectId, ref: 'Club', required: true })
  clubId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  meetingDate: Date;

  @Prop({ 
    type: String, 
    enum: ['present', 'absent', 'late', 'excused'], 
    default: 'present' 
  })
  status: string;

  @Prop({ type: String })
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  recordedBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: String })
  meetingTopic: string;
}

export const ClubAttendanceSchema = SchemaFactory.createForClass(ClubAttendance);
