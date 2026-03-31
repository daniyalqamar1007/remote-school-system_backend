import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClubEventDocument = ClubEvent & Document;

@Schema({ timestamps: true })
export class ClubEvent {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Club', required: true })
  clubId: Types.ObjectId;

  @Prop({ type: Date, required: true })
  startDate: Date;

  @Prop({ type: Date, required: true })
  endDate: Date;

  @Prop({ trim: true })
  description: string;

  @Prop([{
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    description: { type: String }
  }])
  timeSlots: Array<{
    date: Date;
    startTime: string;
    endTime: string;
    description?: string;
  }>;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy: Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ClubEventSchema = SchemaFactory.createForClass(ClubEvent);

