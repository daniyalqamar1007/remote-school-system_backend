import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class HealthProfile extends Document {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Student', index: true, required: true })
  studentId: Types.ObjectId;

  @Prop({ type: [String], default: [] })
  allergies: string[]; // visible to all staff

  @Prop({ type: [String], default: [] })
  medicalConditions: string[]; // nurse/admin view/edit only
}

export const HealthProfileSchema = SchemaFactory.createForClass(HealthProfile);



