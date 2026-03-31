import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';
import { Student } from '../../student/schema/student.schema';
import { Course, CourseDocument } from 'src/course/schema/course.schema';
import { Teacher } from 'src/teacher/schema/schema.teacher';

export type GradeDocument = Grade & Document & {
  createdAt?: Date;
  updatedAt?: Date;
};


export class GradeComponent {
  @Prop({ required: true })
  score: number;

  @Prop({ required: true })
  weightage: number;
}

@Schema({ timestamps: true })
export class Grade {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Teacher', required: true })
  teacherId: Teacher;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Course', required: true })
  courseId: CourseDocument;
  

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  studentId: Student;

  @Prop({ required: true })
  class: string; // Example: 10, 11, 12

  @Prop({ required: true })
  section: string; // Example: A B C

  @Prop({ required: false })
  term: string; // Optional: Q1, Q2, Q3, Q4, Semester 1, Semester 2, Final

  @Prop({ required: true })
  markingType: string; // Test, Quiz, Exam, Assignment, Project, etc.

  @Prop({ required: true })
  totalMarks: number; // Total marks for this assessment

  @Prop({ required: true })
  score: number; // Student's score (must be <= totalMarks)

  // Keep old fields for backward compatibility (optional)
  @Prop({ type: GradeComponent, required: false })
  quiz?: GradeComponent;

  @Prop({ type: GradeComponent, required: false })
  midTerm?: GradeComponent;

  @Prop({ type: GradeComponent, required: false })
  project?: GradeComponent;

  @Prop({ type: GradeComponent, required: false })
  finalTerm?: GradeComponent;

  @Prop({ required: false })
  overAll?: number;
}

export const GradeSchema = SchemaFactory.createForClass(Grade);
