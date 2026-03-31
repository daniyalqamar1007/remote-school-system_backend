import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { IncidentType } from '../enums/incident-type.enum';
import { ConsequenceType } from '../enums/consequence-type.enum';
import { ActionStatus } from '../enums/action-status.enum';

export type DisciplinaryActionDocument = DisciplinaryAction & Document;

@Schema({ timestamps: true })
export class DisciplinaryAction {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  studentId: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId })
  schoolId: Types.ObjectId;

  @Prop({ required: false, type: Types.ObjectId, ref: 'Behavior' })
  incidentId: Types.ObjectId;

  // Incident Information
  @Prop({ required: true, enum: Object.values(IncidentType) })
  type: IncidentType;

  @Prop({ required: true })
  description: string; // Detailed description of the incident

  @Prop({ required: true })
  location: string; // Where incident occurred (hallway, canteen, classroom, etc.)

  @Prop({ required: true })
  date: Date; // Date of incident

  @Prop({ required: true })
  time: string; // Time of incident (HH:mm format)

  @Prop({ required: true })
  severity: string; // 'minor' | 'major' | 'severe'

  // Action/Consequence Information
  @Prop({ required: true, enum: Object.values(ConsequenceType) })
  actionType: ConsequenceType;

  @Prop({ required: true })
  startDate: Date; // When consequence starts

  @Prop()
  endDate: Date; // When consequence ends

  @Prop()
  duration: string; // Duration description (e.g., "1 day", "2 weeks", "3 sessions")

  @Prop()
  consequenceLocation: string; // Where action is served

  @Prop()
  timeSlot: string; // For detentions: "after_school", "lunch", etc.

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  assignedBy: Types.ObjectId; // User ID who assigned the action

  @Prop({ type: Types.ObjectId, ref: 'User' })
  supervisedBy: Types.ObjectId; // User ID who supervises

  @Prop({ required: true })
  reason: string; // Reason for the action

  @Prop()
  conditions: string; // Special conditions or requirements

  @Prop({ type: Object, default: null })
  consequence: {
    type: string;
    duration: string;
    startDate: Date;
    endDate?: Date;
    description: string;
  } | null;

  // Completion tracking
  @Prop({ type: Object, default: null })
  completion: {
    completed?: boolean;
    completionDate?: Date;
    notes?: string;
    verifiedBy?: string;
  } | null;

  @Prop({ default: ActionStatus.PENDING, enum: Object.values(ActionStatus) })
  status: ActionStatus;

  // ==================== APPROVAL WORKFLOW ====================
  // Admins and Counselors must approve before discipline action takes effect
  @Prop({ 
    required: true, 
    enum: ['pending_approval', 'approved', 'rejected'], 
    default: 'pending_approval' 
  })
  approvalStatus: string; // pending_approval | approved | rejected

  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy: Types.ObjectId; // User ID of admin/counselor who approved

  @Prop()
  approvalDate: Date; // When discipline was approved

  @Prop()
  rejectionReason: string; // Why was it rejected

  @Prop({ default: false })
  verificationRequired: boolean;

  // Parent Notification
  @Prop({ default: false })
  parentNotified: boolean;

  @Prop()
  parentNotificationDate: Date;

  @Prop()
  parentNotificationMethod: string; // 'email' | 'phone' | 'letter' | 'in_person'

  @Prop({ type: Object, default: null })
  parentContact: {
    method: string;
    date: Date;
    contactedBy: string;
    notes: string;
  } | null;

  // Conduct Letter
  @Prop({ default: false })
  conductLetterGenerated: boolean;

  @Prop()
  conductLetterUrl: string; // URL to generated letter

  @Prop()
  conductLetterGeneratedDate: Date;

  // Appeal Process
  @Prop({ default: false })
  appealSubmitted: boolean;

  @Prop()
  appealDate: Date;

  @Prop()
  appealReason: string;

  @Prop()
  appealDecision: string;

  @Prop()
  appealDecisionBy: string;

  @Prop()
  appealDecisionDate: Date;

  // Documents
  @Prop({ type: [String], default: [] })
  documentUrls: string[]; // Generated letters, forms, etc.

  // Notes
  @Prop()
  notes: string; // Additional notes
}
export const DisciplinaryActionSchema = SchemaFactory.createForClass(DisciplinaryAction);
