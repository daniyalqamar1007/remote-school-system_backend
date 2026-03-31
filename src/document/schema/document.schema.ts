import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class StudentDocument extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true, enum: ['form', 'permission', 'report', 'letter'] })
  type: string;

  @Prop({ required: true, enum: ['academic', 'administrative', 'extracurricular', 'health'] })
  category: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Student' })
  studentId: Types.ObjectId;

  @Prop({ required: true, enum: ['pending', 'completed', 'expired', 'available'], default: 'pending' })
  status: string;

  @Prop()
  date: string; // Assigned date

  @Prop()
  dueDate: string;

  @Prop({ default: false })
  required: boolean;

  @Prop()
  fileUrl: string; // Downloadable file (provided by school/admin)

  @Prop()
  uploadUrl: string; // Uploaded file by parent

  @Prop()
  comment: string; // Parent's comment on upload

  @Prop()
  uploadedAt: Date;
}

export const StudentDocumentSchema = SchemaFactory.createForClass(StudentDocument);