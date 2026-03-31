import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Student } from '../../student/schema/student.schema';
import { Course } from '../../course/schema/course.schema';
import { Teacher } from '../../teacher/schema/schema.teacher';

export type AttendanceDocument = Attendance & Document;

@Schema({ timestamps: true })
export class Attendance {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'School' })
  schoolId: MongooseSchema.Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Teacher', required: true })
  teacherId: Teacher;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  courseId: Course;

  @Prop({ required: true })
  date: string; // Example: "2024-03-15"

  @Prop({ required: true })
  class: string; // Example: "2024-03-15"

  @Prop({ required: true })
  section: string; // Example: "2024-03-15"

  @Prop({
    type: [
      {
        _id: {
          type: MongooseSchema.Types.ObjectId,
          ref: 'Student',
          required: true,
        },
        studentId: { type: String, required: true },
        studentName: { type: String, required: true },
        attendance: {
          type: String,
          enum: ['Present', 'Absent', 'Late', 'Excused'],
          default: 'Present',
        },
        note: { type: String },

        // ---------- ADD THE FOLLOWING FIELDS ----------
        checkInTime: { type: String },    // <-- Add this!
        checkOutTime: { type: String },   // <-- Add this!
        reason: { type: String },         // <-- Add this!
        // ------------------------------------------------
      },
    ],
    required: true,
  })
  students: {
    _id?: any;
    studentId: string;
    studentName: string;
    attendance: string;
    note?: string;
    checkInTime?: string;
    checkOutTime?: string;
    reason?: string;
  }[];
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);