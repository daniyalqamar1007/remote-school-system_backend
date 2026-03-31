// import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
// import { Document } from 'mongoose';

// export type TeacherDocument = Teacher & Document;

// @Schema()
// export class Teacher {
//   @Prop({ required: true })
//   firstName: string;

//   @Prop({ required: true })
//   lastName: string;

//   @Prop({ required: true })
//   gender: string;

//   @Prop({ required: true })
//   phone: string;

//   @Prop({ required: true, unique: true })
//   email: string;

//   @Prop({
//     default: '$2b$10$1VlR8HWa.Pzyo96BdwL0H.3Hdp2WF9oRX1W9lEF4EohpCWbq70jKm',
//   })
//   password: string; 

//    @Prop({ type: [String], default: [] })
//   assignedCourses: string[]; 
  
//   @Prop({ type: [String], default: [] })
//   subjects: string[];
  
//   @Prop()
//   department: string;

//   @Prop()
//   address: string;

//   @Prop()
//   qualification: string;
// }

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

export type TeacherDocument = Teacher & Document;

@Schema({ timestamps: true })
export class Teacher {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  userId: mongoose.Schema.Types.ObjectId;

  // School reference
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true })
  schoolId: mongoose.Schema.Types.ObjectId;

  @Prop({ required: false, unique: false })
  employeeId?: string; // School-specific employee ID (unique per school, auto-generated if not provided)

  @Prop()
  dateOfBirth: Date;

  // Contact Information
  @Prop()
  address: string;

  @Prop()
  phone: string;

  // Professional Information
  @Prop()
  dateOfJoining: Date;

  @Prop()
  designation: string; // e.g., "Math Teacher", "Department Head"

  @Prop({
    type: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Department'
      }
    ],
    default: []
  })
  departmentIds: mongoose.Schema.Types.ObjectId[];

  // Qualifications
  @Prop({ type: [String], default: [] })
  qualifications: string[];

  @Prop({ type: [String], default: [] })
  certifications: string[];

  // Experience
  @Prop({ default: 0 })
  totalExperience: number; // in years

  @Prop()
  nationality: string;

  // Eligibility flags for roles
  @Prop({ default: false })
  eligible_for_sports: boolean;

  @Prop({ default: false })
  eligible_for_iep: boolean;

  @Prop({ default: false })
  eligible_for_counselor: boolean;
}

export const TeacherSchema = SchemaFactory.createForClass(Teacher);