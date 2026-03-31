import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type StudentProfileDocument = StudentProfile & Document;

@Schema({ timestamps: true })
export class StudentProfile {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop()
  middleName: string;

  @Prop({ required: true, unique: true })
  studentId: string; // School-specific student ID

  @Prop()
  dateOfBirth: Date;

  @Prop({ enum: ['Male', 'Female', 'Other'] })
  gender: string;

  @Prop()
  gradeLevel: string;

  @Prop()
  section: string;

  @Prop()
  rollNumber: string;

  // Contact Information
  @Prop({ 
    type: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String },
      country: { type: String },
    }
  })
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };

  @Prop()
  phone: string;

  @Prop({ 
    type: {
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
    }
  })
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };

  // Academic Information
  @Prop()
  admissionDate: Date;

  @Prop({ enum: ['Active', 'Inactive', 'Graduated', 'Transferred', 'Withdrawn'], default: 'Active' })
  enrollmentStatus: string;

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }], default: [] })
  enrolledCourses: mongoose.Schema.Types.ObjectId[];

  // Parent/Guardian References
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] })
  parentIds: mongoose.Schema.Types.ObjectId[];

  // Health Information (basic)
  @Prop({ type: [String], default: [] })
  allergies: string[];

  @Prop({ type: [String], default: [] })
  medicalConditions: string[];

  @Prop()
  bloodGroup: string;

  // Academic History
  @Prop({ type: Object, default: {} })
  previousSchools: {
    schoolName?: string;
    yearsAttended?: string;
    lastGrade?: string;
  }[];

  // Reference to User account
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Schema.Types.ObjectId;

  // School reference
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true })
  schoolId: mongoose.Schema.Types.ObjectId;
}

export const StudentProfileSchema = SchemaFactory.createForClass(StudentProfile);

// Indexes
StudentProfileSchema.index({ userId: 1 });
StudentProfileSchema.index({ schoolId: 1 });
StudentProfileSchema.index({ studentId: 1, schoolId: 1 }, { unique: true });
StudentProfileSchema.index({ gradeLevel: 1, section: 1 });
