import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type DepartmentDocument = Department & Document;

@Schema({ timestamps: true })
export class Department extends Document {
  @Prop({ required: true })
  departmentName: string;

  @Prop()
  code: string;

  @Prop()
  description: string;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

// Add indexes for better performance
DepartmentSchema.index({ schoolId: 1, departmentName: 1 }, { unique: true });
DepartmentSchema.index({ schoolId: 1, code: 1 }, { unique: true, sparse: true });
