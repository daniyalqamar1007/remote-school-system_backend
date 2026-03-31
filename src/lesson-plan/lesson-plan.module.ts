import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonPlanService } from './lesson-plan.service';
import { LessonPlanController } from './lesson-plan.controller';
import { LessonPlan, LessonPlanSchema } from './schema/lesson-plan.schema';
import { Course, CourseSchema } from '../course/schema/course.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { AwsModule } from '../aws/aws.module';
import { School, SchoolSchema } from '../auth/schemas/school.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LessonPlan.name, schema: LessonPlanSchema },
      { name: Course.name, schema: CourseSchema },
      { name: User.name, schema: UserSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: School.name, schema: SchoolSchema },
    ]),
    AwsModule,
  ],
  controllers: [LessonPlanController],
  providers: [LessonPlanService],
  exports: [LessonPlanService],
})
export class LessonPlanModule {}
