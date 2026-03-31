import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type SystemConfigDocument = SystemConfig & Document;

@Schema({ timestamps: true })
export class SystemConfig {
  @Prop({ required: true, unique: true })
  key: string; // Configuration key (e.g., 'academic_year', 'email_settings')

  @Prop({ required: true })
  name: string; // Human-readable name

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value: any; // Configuration value (can be object, string, number, etc.)

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isSystem: boolean; // System configs cannot be deleted

  @Prop()
  category?: string; // 'academic', 'system', 'email', 'security', etc.

  @Prop()
  lastModifiedBy?: string; // User ID who last modified

  @Prop({ type: MongooseSchema.Types.Mixed })
  validationRules?: any; // JSON schema for value validation
}

export const SystemConfigSchema = SchemaFactory.createForClass(SystemConfig);
