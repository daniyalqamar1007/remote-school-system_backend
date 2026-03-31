import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type HealthRecordDocument = HealthRecord & Document;

@Schema({ timestamps: true })
export class HealthRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  studentId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School', required: true })
  schoolId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  academicYear: string;

  @Prop()
  studentAge: number;

  // Medical Conditions and Allergies
  @Prop({ type: [String] })
  medicalConditions: string[];

  @Prop({ type: [String] })
  allergies: string[];

  @Prop({ type: [String] })
  medications: string[];

  @Prop()
  emergencyContactName: string;

  @Prop()
  emergencyContactPhone: string;

  @Prop()
  emergencyContactRelation: string;

  @Prop()
  physicianName: string;

  @Prop()
  physicianPhone: string;

  @Prop()
  insuranceProvider: string;

  @Prop()
  insurancePolicyNumber: string;

  // Physical Examination Records
  @Prop({
    type: [{
      examDate: Date,
      examType: { type: String, enum: ['annual', 'sports', 'special'] },
      performedBy: String,
      findings: String,
      cleared: { type: Boolean, default: false },
      clearanceDate: Date,
      expiryDate: Date,
      restrictions: [String],
      documentId: { type: MongooseSchema.Types.ObjectId, ref: 'Document' }
    }]
  })
  physicalExams: Array<{
    examDate: Date;
    examType: string;
    performedBy: string;
    findings: string;
    cleared: boolean;
    clearanceDate: Date;
    expiryDate: Date;
    restrictions: string[];
    documentId: MongooseSchema.Types.ObjectId;
  }>;

  // Immunization Records
  @Prop({
    type: [{
      vaccineName: String,
      dateAdministered: Date,
      administratorName: String,
      batchNumber: String,
      nextDueDate: Date,
      documentId: { type: MongooseSchema.Types.ObjectId, ref: 'Document' }
    }]
  })
  immunizations: Array<{
    vaccineName: string;
    dateAdministered: Date;
    administratorName: string;
    batchNumber: string;
    nextDueDate: Date;
    documentId: MongooseSchema.Types.ObjectId;
  }>;

  // Medication Log
  @Prop({
    type: [{
      medicationName: String,
      dosage: String,
      frequency: String,
      startDate: Date,
      endDate: Date,
      prescribedBy: String,
      administeredBy: String,
      instructions: String,
      sideEffects: [String],
      storageMethod: String,
      isActive: { type: Boolean, default: true }
    }]
  })
  medicationLog: Array<{
    medicationName: string;
    dosage: string;
    frequency: string;
    startDate: Date;
    endDate: Date;
    prescribedBy: string;
    administeredBy: string;
    instructions: string;
    sideEffects: string[];
    storageMethod: string;
    isActive: boolean;
  }>;

  // Nurse Visit Records
  @Prop({
    type: [{
      visitDate: Date,
      visitTime: String,
      reason: String,
      symptoms: [String],
      actionTaken: [String],
      medicationGiven: String,
      timeIn: String,
      timeOut: String,
      priority: { type: String, enum: ['low', 'medium', 'high', 'emergency'], default: 'medium' },
      status: { type: String, enum: ['in_progress', 'completed', 'follow_up_required', 'cancelled'], default: 'in_progress' },
      disposition: { type: String, enum: ['return_to_class', 'sent_home', 'transported_to_hospital', 'parent_called'] },
      parentContacted: { type: Boolean, default: false },
      contactMethod: String,
      nurseNotes: String,
      treatment: String,
      medications: [String],
      temperature: Number,
      bloodPressure: String,
      heartRate: Number,
      weight: Number,
      height: Number,
      followUpNeeded: { type: Boolean, default: false },
      parentNotified: { type: Boolean, default: false },
      returnToClass: { type: Boolean, default: true },
      restrictionsNotes: String,
      dispositionTime: String,
      visitDuration: Number,
      followUpRequired: { type: Boolean, default: false },
      followUpDate: Date,
      recordedByName: String
    }]
  })
  nurseVisits: Array<{
    visitDate: Date;
    visitTime: string;
    reason: string;
    symptoms: string[];
    actionTaken: string[];
    medicationGiven: string;
    timeIn: string;
    timeOut: string;
    priority: string;
    status: string;
    disposition: string;
    parentContacted: boolean;
    contactMethod: string;
    nurseNotes: string;
    treatment: string;
    medications: string[];
    temperature: number;
    bloodPressure: string;
    heartRate: number;
    weight: number;
    height: number;
    followUpNeeded: boolean;
    parentNotified: boolean;
    returnToClass: boolean;
    restrictionsNotes: string;
    dispositionTime: string;
    visitDuration: number;
    followUpRequired: boolean;
    followUpDate: Date;
    recordedByName?: string;
  }>;

  // Sports/Activity Medical Clearances
  @Prop({
    type: [{
      activityType: { type: String, enum: ['sports', 'club', 'field_trip', 'other'] },
      activityName: String,
      cleared: { type: Boolean, default: false },
      clearanceDate: Date,
      restrictions: [String],
      expiryDate: Date,
      clearingPhysician: String,
      notes: String,
      // Nurse approval fields (separate from physician clearance)
      nurseApproved: { type: Boolean, default: false },
      nurseApprovalDate: Date,
      nurseNotes: String
    }]
  })
  activityClearances: Array<{
    activityType: string;
    activityName: string;
    cleared: boolean;
    clearanceDate: Date;
    restrictions: string[];
    expiryDate: Date;
    clearingPhysician: string;
    notes: string;
    // Nurse approval fields (separate from physician clearance)
    nurseApproved: boolean;
    nurseApprovalDate: Date;
    nurseNotes: string;
  }>;

  // Health Alerts and Flags
  @Prop({
    type: [{
      type: { type: String, enum: ['medical_emergency', 'allergy_alert', 'medication_due', 'condition_monitoring', 'immunization_due', 'physical_restriction', 'custom_alert'], required: true },
      severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
      title: String,
      description: String,
      triggerConditions: String,
      actionRequired: String,
      expiryDate: Date,
      isActive: { type: Boolean, default: true },
      autoTrigger: { type: Boolean, default: false },
      notifyParents: { type: Boolean, default: false },
      notifyTeachers: { type: Boolean, default: false },
      visibleToStaff: { type: Boolean, default: true },
      createdDate: Date,
      updatedAt: Date
    }]
  })
  healthAlerts: Array<{
    type: string;
    severity: string;
    title?: string;
    description?: string;
    triggerConditions?: string;
    actionRequired?: string;
    expiryDate?: Date;
    isActive: boolean;
    autoTrigger: boolean;
    notifyParents: boolean;
    notifyTeachers: boolean;
    visibleToStaff: boolean;
    createdDate?: Date;
    updatedAt?: Date;
  }>;

  // IEP/504 Health Plan Integration
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'IEP' })
  iepId: MongooseSchema.Types.ObjectId;

  @Prop({
    type: {
      hasHealthPlan: { type: Boolean, default: false },
      accommodations: [String],
      emergencyProcedures: [String],
      staffNotifications: [String]
    }
  })
  healthPlan: {
    hasHealthPlan: boolean;
    accommodations: string[];
    emergencyProcedures: string[];
    staffNotifications: string[];
  };

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy: MongooseSchema.Types.ObjectId;

  // Document Management
  @Prop({
    type: [{
      fileName: String,
      originalName: String,
      category: String,
      description: String,
      fileSize: Number,
      mimeType: String,
      uploadDate: Date,
      uploadedBy: String,
      isConfidential: { type: Boolean, default: false },
      accessLevel: { type: String, enum: ['Public', 'Staff Only', 'Nurse Only', 'Admin Only'], default: 'Staff Only' },
      tags: [String],
      downloadUrl: String
    }]
  })
  documents: Array<{
    fileName: string;
    originalName: string;
    category: string;
    description: string;
    fileSize: number;
    mimeType: string;
    downloadUrl?: string;
    uploadDate: Date;
    uploadedBy: string;
    isConfidential: boolean;
    accessLevel: string;
    tags: string[];
  }>;
}

export const HealthRecordSchema = SchemaFactory.createForClass(HealthRecord);

// Indexes for better performance
HealthRecordSchema.index({ studentId: 1, academicYear: 1 });
HealthRecordSchema.index({ schoolId: 1, academicYear: 1 });
HealthRecordSchema.index({ 'physicalExams.expiryDate': 1 });
HealthRecordSchema.index({ 'immunizations.nextDueDate': 1 });
HealthRecordSchema.index({ 'healthAlerts.isActive': 1, 'healthAlerts.severity': 1 });