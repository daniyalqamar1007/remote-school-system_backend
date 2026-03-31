import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class ImmunizationRecord extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', index: true, required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  vaccineName: string;

  @Prop({ required: true })
  date: string; // ISO string

  @Prop()
  lotNumber?: string;

  @Prop()
  fileUrl?: string; // uploaded proof
}

export const ImmunizationRecordSchema = SchemaFactory.createForClass(ImmunizationRecord);



