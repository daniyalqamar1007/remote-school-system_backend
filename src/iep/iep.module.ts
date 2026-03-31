import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IEPController } from './iep.controller';
import { IEPService } from './iep.service';
import { IEP, IEPSchema } from './schema/iep.schema';
import { ServiceLog, ServiceLogSchema } from './schema/service-log.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: IEP.name, schema: IEPSchema },
      { name: ServiceLog.name, schema: ServiceLogSchema },
      { name: User.name, schema: UserSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
  ],
  controllers: [IEPController],
  providers: [IEPService],
  exports: [IEPService],
})
export class IEPModule {}
