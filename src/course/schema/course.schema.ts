import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CourseDocument = Course & Document & { _id: any };

@Schema({ timestamps: true })
export class Course {
  @Prop({ required: true })
  courseName: string;

  @Prop({ required: true })
  courseCode: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'School',
    required: true,
  })
  schoolId: string;

  @Prop({
    type: [
      {
        type: MongooseSchema.Types.ObjectId,
        ref: 'Department'
      }
    ],
    required: false,
    default: []
  })
  departmentIds: string[];

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: string;

  @Prop({ required: false })
  Prerequisites: string;

  @Prop({ required: false })
  description: string;

  @Prop({ required: false, default: true })
  isActive: boolean;

  @Prop({ type: Object, required: false })
  courseOutline: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    fileUrl?: string;
    uploadedBy?: string;
    uploadedAt?: Date;
  };

  @Prop({ required: false, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' })
  outlineStatus: string;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
