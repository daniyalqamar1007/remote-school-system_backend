import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Permission extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  resource: string; // e.g., 'students', 'grades', 'attendance'

  @Prop({ required: true })
  action: string; // e.g., 'create', 'read', 'update', 'delete'

  @Prop({ required: false })
  description: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
