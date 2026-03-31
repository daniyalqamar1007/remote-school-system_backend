import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Absence, AbsenceSchema } from './schema/absence.schema';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { AbsenceService } from './absence.service';
import { AbsenceController } from './absence.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Absence.name, schema: AbsenceSchema },
      { name: Student.name, schema: StudentSchema },
    ])
  ],
  providers: [AbsenceService],
  controllers: [AbsenceController],
  exports: [AbsenceService],
})
export class AbsenceModule {}