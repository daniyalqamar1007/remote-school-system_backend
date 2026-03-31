import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClubAnnouncementDocument = ClubAnnouncement & Document;

@Schema({ timestamps: true })
export class ClubAnnouncement {
  @Prop({ type: Types.ObjectId, ref: 'Club', required: true })
  clubId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ 
    type: String, 
    enum: ['general', 'meeting', 'event', 'urgent'], 
    default: 'general' 
  })
  type: string;

  @Prop({ type: Date })
  eventDate: Date;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  notifyParents: boolean;

  @Prop({ 
    type: String, 
    enum: ['members', 'parents', 'parent and member', 'parents and members', 'members and parents', 'all'],
    default: 'members' 
  })
  targetAudience: string;

  @Prop({ type: Date })
  expiryDate: Date;
}

export const ClubAnnouncementSchema = SchemaFactory.createForClass(ClubAnnouncement);
