import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SportsScheduleDocument = SportsSchedule & Document;

@Schema({ timestamps: true })
export class SportsSchedule {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SportsProgram', required: true })
  sportsProgramId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School', required: true })
  schoolId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string; // e.g., "Practice Session", "vs. Central High"

  @Prop({ 
    type: String, 
    enum: ['practice', 'game', 'match', 'tournament', 'scrimmage', 'meeting', 'other'], 
    required: true 
  })
  eventType: string;

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ required: true })
  startTime: string; // e.g., "15:30"

  @Prop({ required: true })
  endTime: string; // e.g., "17:00"

  @Prop({ type: [{
    date: { type: Date, required: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    description: { type: String, trim: true }
  }], default: [] })
  timeSlots: Array<{
    date: Date;
    startTime: string;
    endTime: string;
    description?: string;
  }>;

  @Prop({ required: true, trim: true })
  location: string; // e.g., "Main Gymnasium", "Football Field"

  @Prop()
  description: string;

  @Prop()
  opponent: string; // For games/tournaments

  @Prop({ 
    type: String, 
    enum: ['home', 'away', 'neutral'], 
    default: 'home' 
  })
  venue: string;

  @Prop({ default: false })
  isRecurring: boolean;

  @Prop()
  recurringPattern: string; // e.g., "weekly", "daily"

  @Prop()
  recurringEndDate: Date;

  @Prop({ type: [String] })
  recurringDays: string[]; // e.g., ["monday", "wednesday", "friday"]

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isCancelled: boolean;

  @Prop()
  cancellationReason: string;

  @Prop()
  cancellationDate: Date;

  @Prop({ default: false })
  conflictDetected: boolean;

  @Prop({ type: [String] })
  conflictReasons: string[];

  @Prop({ default: true })
  attendanceRequired: boolean;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User' })
  requiredStaff: MongooseSchema.Types.ObjectId[];

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'StudentProfile' })
  requiredStudents: MongooseSchema.Types.ObjectId[];

  @Prop()
  maxAttendees: number;

  @Prop()
  equipmentNeeded: string[];

  @Prop()
  specialInstructions: string;

  @Prop({ default: false })
  requiresTransportation: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy: MongooseSchema.Types.ObjectId;
}

export const SportsScheduleSchema = SchemaFactory.createForClass(SportsSchedule);

// Indexes for better performance
SportsScheduleSchema.index({ sportsProgramId: 1, startDate: 1 });
SportsScheduleSchema.index({ schoolId: 1, startDate: 1 });
SportsScheduleSchema.index({ eventType: 1, isActive: 1 });
SportsScheduleSchema.index({ startDate: 1, endDate: 1 });
SportsScheduleSchema.index({ conflictDetected: 1, isActive: 1 });
