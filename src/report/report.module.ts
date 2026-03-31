import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportController } from './report.controller';
import { ReportService } from './report.service';
import { Report, ReportSchema, ReportExecution, ReportExecutionSchema } from './schema/report.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { Teacher, TeacherSchema } from '../teacher/schema/schema.teacher';
import { Grade, GradeSchema } from '../grade/schema/schema.garde';
import { Attendance, AttendanceSchema } from '../attendance/schema/schema.attendance';
import { DisciplinaryAction, DisciplinaryActionSchema } from '../behavior/schema/disciplinary-action.schema';
import { Club, ClubSchema } from '../club/schema/club.schema';
import { Course, CourseSchema } from '../course/schema/course.schema';
import { Parent, ParentSchema } from '../parent/schema/parent.schema';
import { School, SchoolSchema } from '../auth/schemas/school.schema';
import { AwsModule } from '../aws/aws.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Report.name, schema: ReportSchema },
      { name: ReportExecution.name, schema: ReportExecutionSchema },
      { name: User.name, schema: UserSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Teacher.name, schema: TeacherSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: DisciplinaryAction.name, schema: DisciplinaryActionSchema },
      { name: Club.name, schema: ClubSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Parent.name, schema: ParentSchema },
      { name: School.name, schema: SchoolSchema },
    ]),
    AwsModule,
  ],
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportModule {}

