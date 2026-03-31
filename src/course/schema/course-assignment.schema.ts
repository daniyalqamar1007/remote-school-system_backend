import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type CourseAssignmentDocument = CourseAssignment & Document & { _id: any };

// Time Slot Sub-Schema
const TimeSlotSchema = new MongooseSchema(
  {
    day: {
      type: String,
      required: true,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      trim: true
    },
    startTime: {
      type: String,
      required: true,
      trim: true
      // Format: "HH:MM" (24-hour format) e.g., "09:00", "14:30"
    },
    endTime: {
      type: String,
      required: true,
      trim: true
      // Format: "HH:MM" (24-hour format)
    }
  },
  { _id: false }
);

// Grade with Time Slots Sub-Schema
const GradeWithTimeSlotSchema = new MongooseSchema(
  {
    level: { type: Number, min: 0, max: 12, required: true }, // 0 for Kindergarten
    section: { type: String, trim: true, required: true },
    roomNumber: { type: String, trim: true, required: false }, // Classroom/room number for this grade/section
    timeSlots: {
      type: [TimeSlotSchema],
      default: []
    }
  },
  { _id: false }
);

@Schema({ timestamps: true })
export class CourseAssignment {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Course',
    required: true,
  })
  courseId: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  teacherId: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'School',
    required: true,
  })
  schoolId: string;

  @Prop({
    type: [GradeWithTimeSlotSchema],
    required: true,
    default: [],
  })
  grades: Array<{
    level: number;
    section: string;
    timeSlots: Array<{
      day: string;
      startTime: string;
      endTime: string;
    }>;
  }>;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
  })
  createdBy: string;
}

export const CourseAssignmentSchema = SchemaFactory.createForClass(CourseAssignment);
