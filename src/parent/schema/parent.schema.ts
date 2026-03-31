import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document, Schema as MongooseSchema } from 'mongoose';

export type ParentDocument = Parent & Document;

export enum ParentTypeEnum {
  FATHER = 'FATHER',
  MOTHER = 'MOTHER',
  GUARDIAN = 'GUARDIAN'
}

@Schema({ timestamps: true })
export class Parent {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: mongoose.Types.ObjectId;

  @Prop({ type: String, enum: Object.values(ParentTypeEnum), required: true })
  parentType: ParentTypeEnum;

  @Prop({
    type: [{
      schoolId: { type: MongooseSchema.Types.ObjectId, ref: 'School', required: true },
      isActive: { type: Boolean, default: true }
    }],
    default: []
  })
  belongToSchools: Array<{
    schoolId: mongoose.Types.ObjectId;
    isActive: boolean;
  }>;

  @Prop({ type: Boolean, default: false })
  isPrimaryContact: boolean;

  @Prop({ type: Boolean, default: false })
  hasPickupPermission: boolean;
}

export const ParentSchema = SchemaFactory.createForClass(Parent);