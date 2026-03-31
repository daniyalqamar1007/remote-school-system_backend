import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class NurseVisit extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', index: true, required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  visitDateTime: string; // ISO

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  actionTaken: string; // e.g., ice, medication

  @Prop()
  logoutTime?: string; // ISO

  @Prop({ required: true })
  disposition: string; // release to class / send home

  @Prop({ default: false })
  parentContacted: boolean;

  @Prop()
  contactMethod?: string; // phone/email/etc

  @Prop()
  notes?: string;
}

export const NurseVisitSchema = SchemaFactory.createForClass(NurseVisit);



