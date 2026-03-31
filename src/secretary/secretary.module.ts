import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SecretaryController } from './secretary.controller';
import { SecretaryService } from './secretary.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Course, CourseSchema } from '../course/schema/course.schema';
import { Schedule, ScheduleSchema } from '../schedule/schema/schedule.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { ParentProfile, ParentProfileSchema } from '../auth/schemas/parent-profile.schema';
import { LessonPlanModule } from '../lesson-plan/lesson-plan.module';
import { ClubModule } from '../club/club.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: ParentProfile.name, schema: ParentProfileSchema },
    ]),
    LessonPlanModule,
    ClubModule,
  ],
  controllers: [SecretaryController],
  providers: [SecretaryService],
  exports: [SecretaryService],
})
export class SecretaryModule {}
