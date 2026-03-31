import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type AccessControlDocument = AccessControl & Document;

@Schema({ timestamps: true })
export class AccessControl {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true, enum: ['ip_whitelist', 'ip_blacklist', 'geo_restriction', 'device_restriction'] })
  type: string;

  @Prop({ required: true })
  isActive: boolean;

  @Prop({ type: [String], default: [] })
  ipAddresses: string[];

  @Prop({ type: [String], default: [] })
  ipRanges: string[];

  @Prop({ type: [String], default: [] })
  countries: string[];

  @Prop({ type: [String], default: [] })
  deviceFingerprints: string[];

  @Prop({ type: String, required: false })
  description: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ type: String, required: false })
  lastModifiedBy: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: false })
  metadata: any;

  @Prop({ default: 0 })
  priority: number;

  @Prop({ type: Date, required: false })
  expiresAt: Date;
}

export const AccessControlSchema = SchemaFactory.createForClass(AccessControl);
