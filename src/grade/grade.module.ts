import { Module } from '@nestjs/common';
import { GradeController } from './grade.controller';
import { GradeService } from './grade.service';
import { MongooseModule } from '@nestjs/mongoose'; 
import { Course, CourseSchema } from 'src/course/schema/course.schema';
import { Grade, GradeSchema } from './schema/schema.garde';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Alert, AlertSchema } from '../alert/schema/alert.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Grade.name, schema: GradeSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: User.name, schema: UserSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
  ],
  controllers: [GradeController],
  providers: [GradeService],
})
export class GradeModule {}
