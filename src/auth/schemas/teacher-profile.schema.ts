import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type TeacherProfileDocument = TeacherProfile & Document;

@Schema({ timestamps: true })
export class TeacherProfile {
  // Reference to User account (User schema has: firstName, lastName, email, password, gender, role, profilePicture, createdBy)
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Schema.Types.ObjectId;

  // School reference
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true })
  schoolId: mongoose.Schema.Types.ObjectId;

  @Prop({ required: true, unique: false })
  employeeId: string; // Employee ID must be globally unique across all users

  @Prop()
  dateOfBirth: Date;

  // Contact Information
  @Prop()
  address: string;

  @Prop()
  phone: string;

  // Professional Information
  @Prop()
  dateOfJoining: Date;

  @Prop()
  designation: string; // e.g., "Math Teacher", "Department Head"

  @Prop({
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
      }
    ],
    default: []
  })
  departmentIds: mongoose.Schema.Types.ObjectId[];

  // Qualifications
  @Prop({ type: [Object], default: [] })
  qualifications: {
    degree: string;
    institution: string;
    year: number;
    specialization?: string;
  }[];

  @Prop({ type: [Object], default: [] })
  certifications: {
    name: string;
    issuingBody: string;
    dateIssued: Date;
    expiryDate?: Date;
  }[];

  // Experience
  @Prop({ default: 0 })
  totalExperience: number; // in years

  @Prop()
  nationality: string;
}

export const TeacherProfileSchema = SchemaFactory.createForClass(TeacherProfile);

// Indexes
TeacherProfileSchema.index({ userId: 1 });
TeacherProfileSchema.index({ schoolId: 1 });
TeacherProfileSchema.index({ employeeId: 1 }, { unique: true }); // Global unique index for employeeId across all users
TeacherProfileSchema.index({ departmentIds: 1 });
