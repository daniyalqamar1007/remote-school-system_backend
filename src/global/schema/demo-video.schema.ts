import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DemoVideoDocument = DemoVideo & Document;

@Schema({ timestamps: true })
export class DemoVideo {
  @Prop({ required: true })
  titleKey: string;

  @Prop({ required: true })
  descKey: string;

  @Prop({ required: true })
  imageUrl: string;

  @Prop()
  videoUrl: string;

  @Prop({ default: '0:00' })
  duration: string;

  @Prop({ default: 'Users' })
  icon: string;

  @Prop({ default: 0 })
  sortOrder: number;
}

export const DemoVideoSchema = SchemaFactory.createForClass(DemoVideo);
DemoVideoSchema.index({ sortOrder: 1 });
