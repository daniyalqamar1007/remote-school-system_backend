import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type UserSessionDocument = UserSession & Document;

@Schema({ timestamps: true })
export class UserSession {
  @Prop({ required: true })
  userId: string;

  @Prop({ required: true })
  userEmail: string;

  @Prop({ required: true })
  userRole: string;

  @Prop({ required: true })
  sessionId: string;

  @Prop({ required: true })
  ipAddress: string;

  @Prop({ required: true })
  userAgent: string;

  @Prop({ type: String, required: false })
  deviceFingerprint: string;

  @Prop({ 
    type: {
      country: { type: String, required: false },
      city: { type: String, required: false },
      latitude: { type: Number, required: false },
      longitude: { type: Number, required: false }
    },
    required: false
  })
  location: {
    country?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };

  @Prop({ required: true, default: 'active', enum: ['active', 'expired', 'terminated', 'suspicious'] })
  status: string;

  @Prop({ required: true })
  loginTime: Date;

  @Prop({ type: Date, required: false })
  lastActivity: Date;

  @Prop({ type: Date, required: false })
  logoutTime: Date;

  @Prop({ default: false })
  isSuspicious: boolean;

  @Prop({ type: [String], default: [] })
  suspiciousReasons: string[];

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  metadata: any;
}

export const UserSessionSchema = SchemaFactory.createForClass(UserSession);
