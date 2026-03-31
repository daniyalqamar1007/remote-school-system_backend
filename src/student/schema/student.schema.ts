import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Parent } from '../../parent/schema/parent.schema';

export type StudentDocument = Student & Document;

@Schema({ timestamps: true })
export class Student extends Document {
  @Prop({ required: true })
  studentId: string;

  @Prop({ required: false, unique: true, sparse: true })
  rollNumber: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true })
  class: string;

  @Prop({ required: true })
  section: string;

  @Prop({ required: true })
  gender: string;

  @Prop({ required: true })
  dob: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  address: string;

  @Prop({ required: true })
  emergencyContact: string;

  @Prop({ required: true })
  enrollDate: string;

  @Prop({ required: true })
  expectedGraduation: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Parent' }], required: false, default: [] })
  parents: Types.ObjectId[];

  @Prop({ required: true, default: 'N/A' })
  profilePhoto: string; // Store URL of the photo

  @Prop({ type: [String], required: false, default: [] })
  transcripts: string[];

  @Prop({ required: false, default: false })
  iipFlag: boolean; // IIP Flag information

  @Prop({ default: false })
  honorRolls: boolean; // Honor Rolls flag

  @Prop({ default: false })
  athletics: boolean; // Athletics activities

  @Prop({ required: false })
  clubs: string; // Clubs participation

  @Prop({ type: [String], required: false, default: [] })
  reportCards: string[]; 

  @Prop({ required: false })
  lunch: string; // Lunch preference

  @Prop({ required: false })
  nationality: string; // Nationality of student

  // Backend required fields
  @Prop({ required: true, type: Types.ObjectId, ref: 'School' })
  schoolId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  createdBy: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
}

export const StudentSchema = SchemaFactory.createForClass(Student);

// Create compound indexes for uniqueness per school
StudentSchema.index({ studentId: 1, schoolId: 1 }, { unique: true });
StudentSchema.index({ email: 1, schoolId: 1 }, { unique: true });
