import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { Student } from '../../student/schema/student.schema';
import { User } from '../../auth/schemas/user.schema';

export type AbsenceNoteDocument = AbsenceNote & Document;

@Schema({ timestamps: true })
export class AbsenceNote extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Student', required: true })
  student: Student | Types.ObjectId;

  @Prop({ required: true })
  absenceDate: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: false })
  supportingDocument?: string;

  @Prop({ 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  submittedBy: User | Types.ObjectId;

  @Prop({ default: Date.now })
  submittedDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  reviewedBy?: User | Types.ObjectId;

  @Prop({ required: false })
  reviewDate?: Date;

  @Prop({ required: false })
  reviewNotes?: string;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ required: true })
  academicYear: string;
}

export const AbsenceNoteSchema = SchemaFactory.createForClass(AbsenceNote);
