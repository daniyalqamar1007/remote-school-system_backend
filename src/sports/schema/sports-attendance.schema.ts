import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SportsAttendanceDocument = SportsAttendance & Document;

@Schema({ timestamps: true })
export class SportsAttendance {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SportsSchedule', required: true })
  scheduleId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SportsProgram', required: true })
  sportsProgramId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  studentId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School', required: true })
  schoolId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  attendanceDate: Date;

  @Prop({ 
    type: String, 
    enum: ['present', 'absent', 'late', 'excused', 'medical'], 
    required: true 
  })
  status: string;

  @Prop({ 
    type: String, 
    enum: ['excused', 'unexcused'], 
    required: function() { return this.status === 'absent'; }
  })
  absenceType: string;

  @Prop()
  arrivalTime: string; // For late arrivals

  @Prop()
  departureTime: string; // For early departures

  @Prop()
  notes: string; // Additional notes about attendance

  @Prop()
  reason: string; // Reason for absence/lateness

  @Prop({ default: false })
  parentNotified: boolean;

  @Prop()
  parentNotificationDate: Date;

  @Prop({ 
    type: String, 
    enum: ['email', 'sms', 'phone', 'portal'], 
  })
  notificationMethod: string;

  @Prop({ default: false })
  medicalExcuse: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Document' })
  medicalDocumentId: MongooseSchema.Types.ObjectId;

  @Prop({ default: false })
  academicConflict: boolean;

  @Prop()
  academicConflictReason: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course' })
  conflictingCourseId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recordedBy: MongooseSchema.Types.ObjectId; // Coach/staff who recorded attendance

  @Prop()
  recordedAt: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy: MongooseSchema.Types.ObjectId;
}

export const SportsAttendanceSchema = SchemaFactory.createForClass(SportsAttendance);

// Indexes for better performance
SportsAttendanceSchema.index({ scheduleId: 1, studentId: 1 });
SportsAttendanceSchema.index({ sportsProgramId: 1, attendanceDate: 1 });
SportsAttendanceSchema.index({ studentId: 1, attendanceDate: 1 });
SportsAttendanceSchema.index({ schoolId: 1, attendanceDate: 1 });
SportsAttendanceSchema.index({ status: 1, absenceType: 1 });
SportsAttendanceSchema.index({ parentNotified: 1, status: 1 });
