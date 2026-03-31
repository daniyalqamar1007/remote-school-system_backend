import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type StudentSportsDocument = StudentSports & Document;

@Schema({ timestamps: true })
export class StudentSports {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  studentId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'SportsProgram', required: true })
  sportsProgramId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School', required: true })
  schoolId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  academicYear: string; // e.g., "2024-2025"

  @Prop({ 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'graduated', 'transferred'], 
    default: 'active' 
  })
  status: string;

  @Prop({ required: true })
  enrollmentDate: Date;

  @Prop()
  withdrawalDate: Date;

  @Prop()
  withdrawalReason: string;

  @Prop({ 
    type: String, 
    enum: ['starter', 'substitute', 'reserve', 'trainee'], 
    default: 'trainee' 
  })
  playerRole: string;

  @Prop()
  jerseyNumber: string;

  @Prop()
  position: string; // e.g., "Forward", "Goalkeeper", "Midfielder"

  // Medical and Eligibility Tracking
  @Prop({ default: false })
  physicalExamCompleted: boolean;

  @Prop()
  physicalExamDate: Date;

  @Prop()
  physicalExamExpiryDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Document' })
  physicalExamDocumentId: MongooseSchema.Types.ObjectId;

  @Prop({ default: false })
  medicalClearanceObtained: boolean;

  @Prop()
  medicalClearanceDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Document' })
  medicalClearanceDocumentId: MongooseSchema.Types.ObjectId;

  @Prop({ default: false })
  consentFormSigned: boolean;

  @Prop()
  consentFormDate: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Document' })
  consentFormDocumentId: MongooseSchema.Types.ObjectId;

  @Prop({ default: true })
  isEligible: boolean;

  @Prop()
  eligibilityNotes: string;

  @Prop()
  lastEligibilityCheck: Date;

  // Behavior/Discipline Integration
  @Prop({ default: 0 })
  disciplinePoints: number;

  @Prop()
  lastDisciplineDate: Date;

  @Prop({ type: [String] })
  disciplineReasons: string[];

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy: MongooseSchema.Types.ObjectId;

  // Enhanced Medical Integration with Nurse Portal
  @Prop({ 
    type: String, 
    enum: ['cleared', 'pending', 'no_record'], 
    default: 'pending'
  })
  medicalClearanceStatus: string;

  @Prop({ type: [String] })
  healthWarnings: string[];

  @Prop()
  medicalCheckDate: Date;

  @Prop()
  medicalNotes: string;
}

export const StudentSportsSchema = SchemaFactory.createForClass(StudentSports);

// Indexes for better performance
StudentSportsSchema.index({ studentId: 1, academicYear: 1 });
StudentSportsSchema.index({ sportsProgramId: 1, status: 1 });
StudentSportsSchema.index({ schoolId: 1, academicYear: 1 });
StudentSportsSchema.index({ isEligible: 1, status: 1 });
