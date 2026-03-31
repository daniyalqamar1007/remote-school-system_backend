import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NurseService } from './nurse.service';
import { NurseController } from './nurse.controller';
import { Nurse, NurseSchema } from './schema/nurse.schema';
import { HealthRecord, HealthRecordSchema } from './schema/health-record.schema';
import { StudentProfile, StudentProfileSchema } from '../auth/schemas/student-profile.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { SportsProgram, SportsProgramSchema } from '../sports/schema/sports-program.schema';
import { AwsModule } from '../aws/aws.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Nurse.name, schema: NurseSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: SportsProgram.name, schema: SportsProgramSchema },
    ]),
    AwsModule,
  ],
  controllers: [NurseController],
  providers: [NurseService],
  exports: [NurseService],
})
export class NurseModule {}



