import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StudentService } from './student.service';
import { StudentController } from './student.controller';
import { StudentClubController } from './student-club.controller';
import { Student, StudentSchema } from './schema/student.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Parent, ParentSchema } from '../parent/schema/parent.schema';
import {
  Attendance,
  AttendanceSchema,
} from '../attendance/schema/schema.attendance';
import { Course, CourseSchema } from '../course/schema/course.schema';
import { Schedule, ScheduleSchema } from '../schedule/schema/schedule.schema';
import { HealthRecord, HealthRecordSchema } from '../nurse/schema/health-record.schema';
import { ClubModule } from '../club/club.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
      { name: Parent.name, schema: ParentSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema },
    ]),
    ClubModule,
  ],
  controllers: [StudentController, StudentClubController],
  providers: [StudentService],
  exports: [StudentService],
})
export class StudentModule {}