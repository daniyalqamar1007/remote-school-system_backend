import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HonorRollCriteriaDocument = HonorRollCriteria & Document;

@Schema({ timestamps: true })
export class HonorRollCriteria {
  @Prop({ required: true, type: Types.ObjectId, ref: 'School' })
  schoolId: Types.ObjectId;

  @Prop({ required: true })
  academicYear: string;

  @Prop({ required: true })
  markingPeriod: string; // Q1, Q2, Q3, Q4, Semester 1, Semester 2, Final

  @Prop({ required: true })
  gradeLevel: string;

  @Prop({ required: true })
  name: string; // e.g., "Excellence Award", "High Honor Roll", "Honor Roll"

  @Prop({ required: true })
  minGPA: number;

  @Prop({ required: true })
  minGrade: number; // Minimum grade percentage

  @Prop({ type: [String], required: true })
  coreSubjects: string[]; // Math, English, Science, Social Studies, etc.

  @Prop({ default: true })
  requireAllCoreSubjects: boolean;

  @Prop({ default: false })
  allowDGrades: boolean; // Allow D grades for honor roll

  @Prop({ default: false })
  allowFGrades: boolean; // Allow F grades for honor roll

  @Prop()
  description: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ required: true })
  createdBy: string;

  @Prop()
  updatedBy: string;
}

export const HonorRollCriteriaSchema = SchemaFactory.createForClass(HonorRollCriteria);
