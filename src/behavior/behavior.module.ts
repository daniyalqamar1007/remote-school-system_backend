// src/behavior/behavior.module.ts
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BehaviorService } from './behavior.service';
import { BehaviorController } from './behavior.controller';
import { Behavior, BehaviorSchema } from './schema/behavior.schema';
import { DisciplineController } from './discipline.controller';
import { DisciplineService } from './discipline.service';
import { DisciplinaryAction, DisciplinaryActionSchema } from './schema/disciplinary-action.schema';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { Alert, AlertSchema } from '../alert/schema/alert.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Behavior.name, schema: BehaviorSchema },
      { name: DisciplinaryAction.name, schema: DisciplinaryActionSchema },
      { name: Student.name, schema: StudentSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: User.name, schema: UserSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
  ],
  controllers: [BehaviorController, DisciplineController],
  providers: [BehaviorService, DisciplineService],
  exports: [BehaviorService, DisciplineService],
})
export class BehaviorModule {}