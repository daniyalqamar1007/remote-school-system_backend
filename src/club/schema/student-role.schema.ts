import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentRoleDocument = StudentRole & Document;

@Schema({ timestamps: true })
export class StudentRole {
  @Prop({ required: true, trim: true })
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

export const StudentRoleSchema = SchemaFactory.createForClass(StudentRole);

// Create compound index for schoolId and name
StudentRoleSchema.index({ schoolId: 1, name: 1 }, { unique: true });

