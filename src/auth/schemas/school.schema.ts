import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';
import { SchoolType } from '../../../utils/enum';

export type SchoolDocument = School & Document;

export enum SchoolStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Schema({ timestamps: true })
export class School {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true })
  code: string; // Unique identifier for the school

  @Prop({ enum: Object.values(SchoolType), default: SchoolType.PUBLIC })
  type: SchoolType;

  @Prop({ enum: SchoolStatus, default: SchoolStatus.ACTIVE })
  status: SchoolStatus;

  // Contact Information
  @Prop({ 
    type: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: false },
      country: { type: String, required: true },
    },
    required: true 
  })
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  @Prop()
  phone: string;

  @Prop()
  email: string;

  @Prop()
  website: string;

  // Administrative Information
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  adminId: mongoose.Schema.Types.ObjectId; // Reference to admin user (optional)

  @Prop()
  establishedYear: number;

  @Prop()
  studentCapacity: number;

  @Prop({ default: 0 })
  currentStudentCount: number;

  // Academic Information
  @Prop({ type: [String], default: [] })
  gradelevels: string[]; // e.g., ['K', '1', '2', ..., '12']

  @Prop()
  academicYearStart: Date;

  @Prop()
  academicYearEnd: Date;

  // System Configuration
  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: Object, default: {} })
  settings: {
    allowParentRegistration?: boolean;
    requireEmailVerification?: boolean;
    maxStudentsPerClass?: number;
    attendanceGracePeriod?: number; // in minutes
    gradingScale?: {
      A: { min: number; max: number };
      B: { min: number; max: number };
      C: { min: number; max: number };
      D: { min: number; max: number };
      F: { min: number; max: number };
    };
  };

  // Subscription/License Information (for SaaS model)
  @Prop()
  subscriptionTier: string;

  @Prop()
  subscriptionExpires: Date;

  @Prop({ default: 100 })
  maxUsers: number;

  @Prop({ default: 0 })
  currentUserCount: number;

  // Audit fields
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdBy: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updatedBy: mongoose.Schema.Types.ObjectId;
}

export const SchoolSchema = SchemaFactory.createForClass(School);

// Indexes - removed duplicate indexes for fields that already have unique: true
SchoolSchema.index({ status: 1 });
SchoolSchema.index({ adminId: 1 });
