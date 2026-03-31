import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Schema as MongooseSchema } from 'mongoose';

export type RolloverConfigDocument = RolloverConfig & Document;

@Schema({ timestamps: true })
export class RolloverConfig {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true })
  fromYear: string;

  @Prop({ required: true })
  toYear: string;

  @Prop({ required: true })
  schoolId: string;

  @Prop({ trim: true })
  schoolName?: string;

  @Prop({ required: true, enum: ['draft', 'ready', 'in-progress', 'completed', 'failed'], default: 'draft' })
  status: string;

  @Prop([{
    fromGrade: { type: String, required: true },
    toGrade: { type: String, required: true },
    condition: { type: String, required: true, enum: ['automatic', 'passing_grades', 'manual_review'] }
  }])
  promotionRules: Array<{
    fromGrade: string;
    toGrade: string;
    condition: string;
  }>;

  @Prop({ 
    type: MongooseSchema.Types.Mixed,
    default: {
      archiveGrades: true,
      archiveAttendance: true,
      archiveBehavior: true,
      archiveDocuments: false,
      retentionPeriod: 7
    }
  })
  archiveSettings: {
    archiveGrades: boolean;
    archiveAttendance: boolean;
    archiveBehavior: boolean;
    archiveDocuments: boolean;
    retentionPeriod: number;
  };

  @Prop()
  executedAt?: Date;

  @Prop({ trim: true })
  executedBy?: string;

  @Prop({ default: 0 })
  studentsProcessed: number;

  @Prop({ default: 0 })
  studentsPromoted: number;

  @Prop({ default: 0 })
  studentsRetained: number;

  @Prop({ type: [String] })
  errorMessages?: string[]; // Renamed from 'errors' to avoid reserved pathname warning

  @Prop({ trim: true })
  notes?: string;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop()
  lastModified?: Date;
}

export const RolloverConfigSchema = SchemaFactory.createForClass(RolloverConfig);

// Create indexes for better query performance
RolloverConfigSchema.index({ name: 1 });
RolloverConfigSchema.index({ schoolId: 1 });
RolloverConfigSchema.index({ status: 1 });
RolloverConfigSchema.index({ fromYear: 1, toYear: 1 });
RolloverConfigSchema.index({ createdAt: -1 });
