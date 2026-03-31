import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClubDocument = Club & Document;

@Schema({ timestamps: true })
export class Club {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  @Prop({ required: true, trim: true })
  type: string; // Drama Club, Chess Club, Robotics, etc.

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  advisorId: Types.ObjectId; // Faculty/Staff advisor

  @Prop([{
    studentId: { type: Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['President', 'Vice President', 'Secretary', 'Treasurer', 'Member'], default: 'Member' }
  }])
  studentRoles: Array<{
    studentId: Types.ObjectId;
    role: string;
  }>;

  @Prop({
    type: {
      days: [{ type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }],
      startTime: String,
      endTime: String,
      frequency: { type: String, enum: ['Weekly', 'Bi-weekly', 'Monthly'], default: 'Weekly' },
      dayTimes: { 
        type: Map, 
        of: { 
          startTime: String, 
          endTime: String, 
          description: String 
        }, 
        default: {} 
      }
    }
  })
  meetingSchedule: {
    days: string[];
    startTime: string;
    endTime: string;
    frequency: string;
    dayTimes?: Map<string, { startTime: string; endTime: string; description?: string }>;
  };

  @Prop({ trim: true })
  location: string;

  @Prop({ type: Number, min: 1 })
  maxMembers: number;

  @Prop({ type: Boolean, default: false })
  requiresApproval: boolean;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId;

  // Legacy fields (keeping for backward compatibility)
  @Prop()
  clubName: string;

  @Prop()
  prerequisites: string;

  // Activities list (added to persist activities from frontend form)
  @Prop({ type: [String], default: [] })
  activities: string[];
}

export const ClubSchema = SchemaFactory.createForClass(Club);
