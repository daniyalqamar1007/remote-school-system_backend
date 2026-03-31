import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClubService } from './club.service';
import { ClubController } from './club.controller';
import { Club, ClubSchema } from './schema/club.schema';
import { ClubMembership, ClubMembershipSchema } from './schema/club-membership.schema';
import { ClubAttendance, ClubAttendanceSchema } from './schema/club-attendance.schema';
import { ClubAnnouncement, ClubAnnouncementSchema } from './schema/club-announcement.schema';
import { ClubEvent, ClubEventSchema } from './schema/club-event.schema';
import { ClubType, ClubTypeSchema } from './schema/club-type.schema';
import { StudentRole, StudentRoleSchema } from './schema/student-role.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { EmailModule } from '../email/email.module';
import { CalendarModule } from '../calendar/calendar.module';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';
import { Schedule, ScheduleSchema } from '../schedule/schema/schedule.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Club.name, schema: ClubSchema },
      { name: ClubMembership.name, schema: ClubMembershipSchema },
      { name: ClubAttendance.name, schema: ClubAttendanceSchema },
      { name: ClubAnnouncement.name, schema: ClubAnnouncementSchema },
      { name: ClubEvent.name, schema: ClubEventSchema },
      { name: ClubType.name, schema: ClubTypeSchema },
      { name: StudentRole.name, schema: StudentRoleSchema },
      { name: User.name, schema: UserSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: Schedule.name, schema: ScheduleSchema },
    ]),
    CalendarModule,
    EmailModule,
  ],
  controllers: [ClubController],
  providers: [ClubService],
  exports: [ClubService],
})
export class ClubModule {}
