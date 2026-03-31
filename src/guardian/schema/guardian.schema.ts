import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Guardian extends Document {
  @Prop({ required: true })
  guardianName: string;

  @Prop({ required: true, unique: true })
  guardianEmail: string;

  @Prop({
    default: '$2b$10$1VlR8HWa.Pzyo96BdwL0H.3Hdp2WF9oRX1W9lEF4EohpCWbq70jKm',
  })
  password: string; // Hashed password

  @Prop({ required: true })
  guardianPhone: string;

  @Prop({ required: true })
  guardianRelation: string;

  @Prop({ required: true })
  guardianProfession: string;

  @Prop({ required: true, default: 'N/A' })
  guardianPhoto: string;
}

export const GuardianSchema = SchemaFactory.createForClass(Guardian);
