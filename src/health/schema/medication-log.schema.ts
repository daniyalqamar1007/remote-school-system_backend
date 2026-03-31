import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class MedicationLog extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', index: true, required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  medication: string; // medication name

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  dosage: string; // e.g., 5 ml, 1 tab

  @Prop({ required: true })
  frequency: string; // time/frequency

  @Prop({ required: true })
  administeredBy: string; // nurse name/id

  @Prop({ required: true })
  startDate: string; // ISO

  @Prop({ required: true })
  endDate: string; // ISO

  @Prop()
  storageMethod?: string;

  @Prop()
  authorizedBy?: string; // doc/parent

  @Prop({ required: true })
  dateTime: string; // administration timestamp if applicable
}

export const MedicationLogSchema = SchemaFactory.createForClass(MedicationLog);



