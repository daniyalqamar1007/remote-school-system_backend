import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type IEPDocument = IEP & Document;

@Schema({ timestamps: true })
export class IEP {
  @Prop({ required: true, type: Types.ObjectId, ref: 'StudentProfile' })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  iepId: string; // Unique IEP identifier

  @Prop({ required: true })
  academicYear: string;

  @Prop({ required: true })
  type: string; // 'IEP' | 'IIP' | '504'

  @Prop({ required: true })
  status: string; // 'active' | 'expired' | 'draft' | 'under_review'

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop()
  reviewDate: Date;

  @Prop()
  nextReviewDate: Date;

  @Prop({ required: true })
  classification: string; // Autism, ADHD, SLD, etc.

  @Prop({ type: [String] })
  disabilities: string[];

  @Prop()
  eligibilityDeterminationDate: Date;

  @Prop()
  initialReferralDate: Date;

  @Prop()
  parentConsentDate: Date;

  @Prop({ type: Object })
  currentPerformance: {
    academic: string;
    functional: string;
    behavioral: string;
  };

  @Prop({ type: [Object] })
  goals: Array<{
    id: string;
    subject: string;
    category: string; // 'academic' | 'behavioral' | 'functional'
    description: string;
    measurableOutcomes: string[];
    timeline: string;
    progressCriteria: string;
    currentProgress: number; // percentage
    lastUpdated: Date;
    responsibleStaff: string[];
  }>;

  @Prop({ type: [Object] })
  accommodations: Array<{
    subject: string;
    type: string; // 'instructional' | 'assessment' | 'environmental'
    description: string;
    frequency: string;
    isActive: boolean;
  }>;

  @Prop({ type: [Object] })
  modifications: Array<{
    subject: string;
    type: string;
    description: string;
    frequency: string;
    isActive: boolean;
  }>;

  @Prop({ type: [Object] })
  services: Array<{
    type: string; // 'speech_therapy' | 'occupational_therapy' | 'counseling' | etc.
    provider: string;
    frequency: string; // e.g., "2x per week"
    duration: string; // e.g., "30 minutes"
    location: string;
    startDate: Date;
    endDate: Date;
    isActive: boolean;
  }>;

  @Prop({ type: [Object] })
  assessments: Array<{
    type: string;
    name: string;
    date: Date;
    results: string;
    recommendations: string;
    administeredBy: string;
    fileUrl?: string;
  }>;

  @Prop({ type: [String] })
  teamMembers: string[]; // User IDs of IEP team members

  @Prop()
  caseManager: string; // User ID

  @Prop({ type: [Object] })
  meetingHistory: Array<{
    date: Date;
    type: string; // 'initial' | 'annual' | 'review' | 'amendment'
    attendees: string[];
    notes: string;
    decisions: string[];
    nextSteps: string[];
    documentsGenerated: string[];
  }>;

  @Prop({ type: [String] })
  documentUrls: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy: string;

  @Prop()
  parentNotificationSent: boolean;

  @Prop()
  parentNotificationDate: Date;
}

export const IEPSchema = SchemaFactory.createForClass(IEP);
