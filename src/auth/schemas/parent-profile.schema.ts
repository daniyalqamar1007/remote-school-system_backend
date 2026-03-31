import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type ParentProfileDocument = ParentProfile & Document;

@Schema({ timestamps: true })
export class ParentProfile {
  @Prop({ required: true, trim: true })
  firstName: string;

  @Prop({ required: true, trim: true })
  lastName: string;

  @Prop()
  middleName: string;

  @Prop({ enum: ['Male', 'Female', 'Other'] })
  gender: string;

  @Prop()
  dateOfBirth: Date;

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

  @Prop()
  alternatePhone: string;

  // Professional Information
  @Prop()
  occupation: string;

  @Prop()
  workplace: string;

  @Prop()
  workPhone: string;

  // Relationship to Students
  @Prop({ 
    type: [{
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentProfile' },
      relationship: { type: String },
      isPrimaryContact: { type: Boolean },
      hasPickupPermission: { type: Boolean }
    }], 
    default: [] 
  })
  children: Array<{
    studentId: any;
    relationship: string; // 'Father', 'Mother', 'Guardian', etc.
    isPrimaryContact: boolean;
    hasPickupPermission: boolean;
  }>;

  // Emergency Contact (if parent is not the primary emergency contact)
  @Prop({ 
    type: {
      name: { type: String },
      relationship: { type: String },
      phone: { type: String },
    }
  })
  emergencyContact: {
    name?: string;
    relationship?: string;
    phone?: string;
  };

  // Preferences
  @Prop({ default: true })
  receiveEmailNotifications: boolean;

  @Prop({ default: true })
  receiveSMSNotifications: boolean;

  @Prop({ type: [String], default: ['academic', 'behavioral', 'health', 'events'] })
  notificationPreferences: string[];

  // Reference to User account
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Schema.Types.ObjectId;

  // School reference (parents can have children in multiple schools)
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'School' }], default: [] })
  schoolIds: mongoose.Schema.Types.ObjectId[];
}

export const ParentProfileSchema = SchemaFactory.createForClass(ParentProfile);

// Indexes
ParentProfileSchema.index({ userId: 1 });
ParentProfileSchema.index({ 'children.studentId': 1 });
ParentProfileSchema.index({ schoolIds: 1 });
