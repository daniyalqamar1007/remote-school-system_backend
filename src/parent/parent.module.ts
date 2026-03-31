import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ParentService } from './parent.service';
import { ParentController } from './parent.controller';
import { Parent, ParentSchema } from './schema/parent.schema';
import { ParentSummaryService } from './parent-summary.service';

// Import unified auth schemas
import { User, UserSchema } from '../auth/schemas/user.schema';
import { ParentProfile, ParentProfileSchema } from '../auth/schemas/parent-profile.schema';
import { StudentProfile, StudentProfileSchema } from '../auth/schemas/student-profile.schema';

// Import schemas needed for summary service
import { Student, StudentSchema } from '../student/schema/student.schema';
import { Alert, AlertSchema } from '../alert/schema/alert.schema';

import { ScheduleModule } from '../schedule/schedule.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Parent.name, schema: ParentSchema },
      { name: User.name, schema: UserSchema },
      { name: ParentProfile.name, schema: ParentProfileSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Alert.name, schema: AlertSchema }
    ]),
    ScheduleModule, // Just import it, do not add service to providers
  ],
  controllers: [ParentController],
  providers: [ParentService, ParentSummaryService], // <-- Remove ScheduleService here
  exports: [ParentService],
})
export class ParentModule {}