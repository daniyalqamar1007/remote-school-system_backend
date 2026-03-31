import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClubTypeDocument = ClubType & Document;

@Schema({ timestamps: true })
export class ClubType {
  @Prop({ required: true, trim: true, unique: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: String })
  description?: string;

  @Prop({ type: String })
  createdBy: string;
}

export const ClubTypeSchema = SchemaFactory.createForClass(ClubType);

// Create compound index for schoolId and name
ClubTypeSchema.index({ schoolId: 1, name: 1 }, { unique: true });

