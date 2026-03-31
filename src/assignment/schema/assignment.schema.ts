import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true })
export class Assignment {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true, enum: ['homework', 'project', 'quiz', 'test'] })
  type: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  assignedDate: string;

  @Prop({ required: true })
  dueDate: string;

  @Prop({ type: Types.ObjectId, ref: 'Teacher' })
  assignedBy: Types.ObjectId;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Student' }], default: [] })
  students: Types.ObjectId[];

  @Prop({
    type: [
      {
        student: { type: Types.ObjectId, ref: 'Student' },
        status: { type: String, enum: ['upcoming', 'completed', 'overdue', 'graded'], default: 'upcoming' },
        grade: {
          score: Number,
          outOf: Number,
          feedback: String,
        },
        submittedAt: String,
      },
    ],
    default: [],
  })
  studentStatuses: any[];
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);