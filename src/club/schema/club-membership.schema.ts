import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ClubMembershipDocument = ClubMembership & Document;

@Schema({ timestamps: true })
export class ClubMembership {
  @Prop({ type: Types.ObjectId, ref: 'Club', required: true })
  clubId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ 
    type: String, 
    enum: ['President', 'Vice President', 'Secretary', 'Treasurer', 'Member'], 
    default: 'Member' 
  })
  role: string;

  @Prop({ 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'withdrawn'], 
    default: 'pending' 
  })
  status: string;

  @Prop({ type: Date, default: Date.now })
  joinedDate: Date;

  @Prop({ type: Date })
  leftDate: Date;

  @Prop({ type: String })
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  approvedBy: Types.ObjectId;

  @Prop({ type: Date })
  approvedDate: Date;

  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;
}

export const ClubMembershipSchema = SchemaFactory.createForClass(ClubMembership);
