import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export type NurseDocument = Nurse & Document;

@Schema({ timestamps: true })
export class Nurse {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: String })
  qualifications?: string;

  @Prop({ type: Number })
  experienceYears?: number;

  @Prop({ type: String })
  speciality?: string;

  @Prop({ type: String })
  licenseNumber?: string;

  @Prop({ type: Date })
  dateOfJoining?: Date;

  @Prop({ type: [String], default: [] })
  certifications?: string[];

  @Prop({ type: String, enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY'], default: 'FULL_TIME' })
  employmentType?: string;

  @Prop({ type: String, enum: ['ACTIVE', 'ON_LEAVE', 'TERMINATED'], default: 'ACTIVE' })
  employmentStatus?: string;
}

export const NurseSchema = SchemaFactory.createForClass(Nurse);
