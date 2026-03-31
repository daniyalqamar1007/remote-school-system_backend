import { Module } from '@nestjs/common';
import { TeacherController } from './teacher.controller';
import { TeacherClubController } from './teacher-club.controller';
import { TeacherService } from './teacher.service';
import { Teacher, TeacherSchema } from './schema/schema.teacher'; 
import { Course, CourseSchema } from '../course/schema/course.schema'; 
import { User, UserSchema } from '../auth/schemas/user.schema';
import { TeacherProfile, TeacherProfileSchema } from '../auth/schemas/teacher-profile.schema';
import { Schedule, ScheduleSchema } from '../schedule/schema/schedule.schema';
import { LessonPlan, LessonPlanSchema } from '../lesson-plan/schema/lesson-plan.schema';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { ClubModule } from '../club/club.module';

@Module({
    imports: [
    MongooseModule.forFeature([
      { name: Teacher.name, schema: TeacherSchema },
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: LessonPlan.name, schema: LessonPlanSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
    ClubModule,
  ],
  controllers: [TeacherController, TeacherClubController],
  providers: [TeacherService],
  exports: [TeacherService],
})
export class TeacherModule {}
