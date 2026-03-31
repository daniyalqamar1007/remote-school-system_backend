import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SportsController } from './sports.controller';
import { SportsService } from './sports.service';
import { SportsPdfService } from './sports-pdf.service';
import { SportsProgram, SportsProgramSchema } from './schema/sports-program.schema';
import { StudentSports, StudentSportsSchema } from './schema/student-sports.schema';
import { SportsSchedule, SportsScheduleSchema } from './schema/sports-schedule.schema';
import { SportsAttendance, SportsAttendanceSchema } from './schema/sports-attendance.schema';

// Import related schemas for the service
import { StudentProfile, StudentProfileSchema } from '../auth/schemas/student-profile.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { ActivityService } from '../activity/activity.service';
import { NurseModule } from '../nurse/nurse.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SportsProgram.name, schema: SportsProgramSchema },
      { name: StudentSports.name, schema: StudentSportsSchema },
      { name: SportsSchedule.name, schema: SportsScheduleSchema },
      { name: SportsAttendance.name, schema: SportsAttendanceSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Activity.name, schema: ActivitySchema },
    ]),
    NurseModule,
  ],
  controllers: [SportsController],
  providers: [SportsService, SportsPdfService, ActivityService],
  exports: [SportsService],
})
export class SportsModule {}
