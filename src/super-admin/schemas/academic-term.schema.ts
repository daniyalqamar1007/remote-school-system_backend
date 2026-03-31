import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AcademicTermDocument = AcademicTerm & Document;

@Schema({ timestamps: true })
export class AcademicTerm {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  type: string; // 'semester', 'quarter', 'trimester', 'term'

  @Prop({ required: true })
  academicYear: string; // e.g., '2024-2025'

  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School' })
  schoolId?: string; // If null, applies to all schools

  @Prop({ default: false })
  isGlobal: boolean; // true = applies to all schools, false = school-specific

  @Prop({ default: 1 })
  sortOrder: number;

  @Prop({ default: false })
  isCurrent: boolean;

  @Prop()
  description?: string;

  @Prop({ type: [Date] })
  holidays?: Date[];

  @Prop({ type: [Date] })
  professionalDevelopmentDays?: Date[];

  @Prop({ type: [Date] })
  vacationPeriods?: Date[];
}

export const AcademicTermSchema = SchemaFactory.createForClass(AcademicTerm);
