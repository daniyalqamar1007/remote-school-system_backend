import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type SchoolBrandingDocument = SchoolBranding & Document;

@Schema({ timestamps: true })
export class SchoolBranding {
  @Prop({ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'School', 
    required: true, 
    unique: true 
  })
  schoolId: mongoose.Schema.Types.ObjectId;

  @Prop({ trim: true })
  schoolName: string;

  @Prop({ trim: true })
  tagline: string;

  // Logo URLs
  @Prop()
  logoUrl: string;

  @Prop()
  faviconUrl: string;

  // Color scheme
  @Prop({ trim: true, default: '#1976D2' })
  primaryColor: string;

  @Prop({ trim: true, default: '#F50057' })
  secondaryColor: string;

  @Prop({ trim: true, default: '#FFFFFF' })
  backgroundColor: string;

  @Prop({ trim: true, default: '#333333' })
  textColor: string;

  // Footer & branding text
  @Prop()
  footerText: string;

  @Prop()
  website: string;

  @Prop()
  phone: string;

  @Prop()
  email: string;

  // Social media links
  @Prop({
    type: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String
    }
  })
  socialMedia: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
  };

  @Prop({ default: true })
  isActive: boolean;

  @Prop()
  createdBy: string;

  @Prop()
  updatedBy: string;
}

export const SchoolBrandingSchema = SchemaFactory.createForClass(SchoolBranding);

// Indexes
SchoolBrandingSchema.index({ schoolId: 1 });
