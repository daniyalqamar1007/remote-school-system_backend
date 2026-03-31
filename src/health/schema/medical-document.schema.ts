import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type MedicalDocumentDocument = MedicalDocument & Document;

@Schema({ timestamps: true })
export class MedicalDocument extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', index: true, required: true })
  studentId: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Parent', index: true })
  uploadedByParent?: Types.ObjectId;

  @Prop({ 
    required: true, 
    enum: ['health_plan_iep', 'health_plan_504', 'immunization', 'medical_excuse', 'doctor_note', 'consent_form', 'other'] 
  })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  fileUrl: string; // URL to the uploaded document

  @Prop()
  originalFileName: string;

  @Prop({ required: true, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' })
  status: string;

  @Prop()
  expiryDate?: Date; // For documents that expire (like medical clearances)

  @Prop()
  notes?: string; // Additional notes from nurse/admin

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId; // Who reviewed/approved the document

  @Prop()
  reviewedAt?: Date;

  @Prop({ default: false })
  isRequired: boolean; // Whether this document is required for the student

  @Prop({ type: [String], default: [] })
  tags: string[]; // Tags for categorization

  // Specific fields for IEP/504 plans
  @Prop()
  planStartDate?: Date;

  @Prop()
  planEndDate?: Date;

  @Prop({ type: [String], default: [] })
  accommodations: string[]; // List of accommodations

  @Prop({ type: [String], default: [] })
  goals: string[]; // Educational/health goals

  @Prop()
  classification?: string; // e.g., Autism, ADHD, SLD

  // Specific fields for immunizations
  @Prop()
  vaccineName?: string;

  @Prop()
  vaccineDate?: Date;

  @Prop()
  lotNumber?: string;

  @Prop()
  nextDueDate?: Date;
}

export const MedicalDocumentSchema = SchemaFactory.createForClass(MedicalDocument);

// Indexes for better performance
MedicalDocumentSchema.index({ studentId: 1, type: 1 });
MedicalDocumentSchema.index({ status: 1 });
MedicalDocumentSchema.index({ expiryDate: 1 });
