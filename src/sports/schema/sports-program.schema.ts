import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SportsProgramDocument = SportsProgram & Document;

@Schema({ timestamps: true })
export class SportsProgram {
  @Prop({ required: true, trim: true })
  name: string; // e.g., "Football", "Track", "Volleyball"

  @Prop({ trim: true })
  description: string;

  @Prop({ type: [String], required: true })
  allowedGradeLevels: string[]; // e.g., ["9", "10", "11", "12"]

  @Prop({ type: [String], default: [] })
  notRecommendedGradeLevels: string[]; // Grades that are not recommended but still allowed

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School', required: true })
  schoolId: MongooseSchema.Types.ObjectId;

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User' })
  coaches: MongooseSchema.Types.ObjectId[]; // Staff assigned as coaches

  @Prop({ type: [MongooseSchema.Types.ObjectId], ref: 'User' })
  assistantCoaches: MongooseSchema.Types.ObjectId[]; // Assistant coaches

  @Prop({ 
    type: String, 
    enum: ['fall', 'winter', 'spring', 'summer', 'year-round'], 
    required: true 
  })
  season: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 0 })
  maxParticipants: number; // 0 means unlimited

  @Prop({ 
    type: String, 
    enum: ['competitive', 'recreational', 'both'], 
    default: 'competitive' 
  })
  type: string;

  @Prop({ type: [String] })
  requiredEquipment: string[];

  @Prop({ type: [String] })
  venue: string[]; // Where practices/games are held

  @Prop({ default: true })
  requiresPhysicalExam: boolean;

  @Prop({ default: true })
  requiresMedicalClearance: boolean;

  @Prop({ default: true })
  requiresConsentForm: boolean;

  @Prop({ default: true })
  eligibilityTrackingEnabled: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  updatedBy: MongooseSchema.Types.ObjectId;
}

export const SportsProgramSchema = SchemaFactory.createForClass(SportsProgram);

// Indexes for better performance
SportsProgramSchema.index({ schoolId: 1, isActive: 1 });
SportsProgramSchema.index({ name: 1, schoolId: 1 });
SportsProgramSchema.index({ season: 1, schoolId: 1 });
