import { Module } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { ScheduleController } from './schedule.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Schedule, ScheduleSchema } from './schema/schedule.schema';
import { StudentProfile, StudentProfileSchema } from '../auth/schemas/student-profile.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Schedule.name, schema: ScheduleSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
  ],
  controllers: [ScheduleController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}