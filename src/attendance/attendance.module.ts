import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { Attendance, AttendanceSchema } from './schema/schema.attendance';
import { Schedule, ScheduleSchema } from '../schedule/schema/schedule.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';
import { Alert, AlertSchema } from '../alert/schema/alert.schema';
import { Course, CourseSchema } from '../course/schema/course.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Attendance.name, schema: AttendanceSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: User.name, schema: UserSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Alert.name, schema: AlertSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
