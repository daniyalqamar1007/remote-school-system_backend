import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Role extends Document {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: false })
  description: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Permission' }], default: [] })
  permissions: Types.ObjectId[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isSystemRole: boolean; // true for built-in roles like Admin, Teacher, etc.

  @Prop({ type: Types.ObjectId, ref: 'School', required: false })
  schoolId: Types.ObjectId; // null for system-wide roles
}

export const RoleSchema = SchemaFactory.createForClass(Role);
