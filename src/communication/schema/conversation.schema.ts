import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ConversationDocument = Conversation & Document;

@Schema({ timestamps: true })
export class Conversation {
  @Prop({ type: [Types.ObjectId], ref: 'User', required: true })
  participants: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'Message' })
  lastMessageId: Types.ObjectId;

  @Prop({ type: Date })
  lastMessageAt: Date;

  @Prop({ type: String, required: true })
  schoolId: string;

  @Prop({ type: Map, of: Number, default: {} })
  unreadCount: Map<string, number>; // userId -> count

  @Prop({ type: Map, of: Date, default: {} })
  lastReadAt: Map<string, Date>; // userId -> last read timestamp
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);



