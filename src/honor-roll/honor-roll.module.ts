import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HonorRollController } from './honor-roll.controller';
import { HonorRollService } from './honor-roll.service';
import { HonorRollCriteria, HonorRollCriteriaSchema } from './schema/honor-roll-criteria.schema';
import { HonorRollAward, HonorRollAwardSchema } from './schema/honor-roll-award.schema';
import { Grade, GradeSchema } from '../grade/schema/schema.garde';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { StudentSports, StudentSportsSchema } from '../sports/schema/student-sports.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HonorRollCriteria.name, schema: HonorRollCriteriaSchema },
      { name: HonorRollAward.name, schema: HonorRollAwardSchema },
      { name: Grade.name, schema: GradeSchema },
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
      { name: StudentSports.name, schema: StudentSportsSchema },
    ]),
  ],
  controllers: [HonorRollController],
  providers: [HonorRollService],
  exports: [HonorRollService],
})
export class HonorRollModule {}
