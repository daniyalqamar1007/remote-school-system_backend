import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class EmailTemplate {
  @Prop({ type: Types.ObjectId, ref: 'School', required: true })
  schoolId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  templateName: string;

  @Prop({ trim: true })
  category?: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  htmlBody: string;

  @Prop()
  textBody?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ trim: true })
  createdBy?: string;

  @Prop({ trim: true })
  updatedBy?: string;
}

export type EmailTemplateDocument = EmailTemplate & Document;

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);

EmailTemplateSchema.index({ schoolId: 1, templateName: 1 }, { unique: true });
EmailTemplateSchema.index({ schoolId: 1, category: 1 });
EmailTemplateSchema.index({ schoolId: 1, isActive: 1 });

