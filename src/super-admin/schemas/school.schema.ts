import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class School extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  code: string; // School code field

  @Prop({ 
    required: false, 
    default: 'PUBLIC',
    enum: ['PUBLIC', 'PRIVATE', 'CHARTER', 'INTERNATIONAL', 'TRADE_SCHOOL', 'VOCATIONAL', 'TECHNICAL']
  })
  type: string;

  // Address as embedded object
  @Prop({ 
    required: true,
    type: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      zipCode: { type: String, required: false },
      country: { type: String, required: true }
    }
  })
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
  };

  @Prop({ required: false })
  phone: string;

  @Prop({ required: false })
  email: string;

  @Prop({ required: false })
  website: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  adminId: Types.ObjectId;

  @Prop({ required: false })
  establishedYear: number;

  @Prop({ required: false, default: 0 })
  studentCapacity: number;

  @Prop({ required: false, default: 0 })
  currentStudentCount: number;

  @Prop({ required: false, default: 0 })
  staffCount: number;

  @Prop({ type: [String], default: [] })
  gradelevels: string[];

  @Prop({ required: false })
  academicYearStart: string;

  @Prop({ required: false })
  academicYearEnd: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'ACTIVE' })
  status: string;

  @Prop({ default: 'N/A' })
  logo: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  settings: {
    timezone?: string;
    academicYear?: string;
    gradingSystem?: string;
    language?: string;
    allowParentRegistration?: boolean;
    requireEmailVerification?: boolean;
    maxStudentsPerClass?: number;
    attendanceGracePeriod?: number;
  };
}

export const SchoolSchema = SchemaFactory.createForClass(School);

// Add indexes
SchoolSchema.index({ code: 1 }, { unique: true });
SchoolSchema.index({ email: 1 }, { unique: true, sparse: true });
SchoolSchema.index({ adminId: 1 }, { sparse: true });

export type SchoolDocument = School & Document;
