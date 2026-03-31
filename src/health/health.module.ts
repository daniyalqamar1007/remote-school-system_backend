import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthService } from './health.service';
import { HealthController } from './health.controller';
import { HealthProfile, HealthProfileSchema } from './schema/health-profile.schema';
import { ImmunizationRecord, ImmunizationRecordSchema } from './schema/immunization.schema';
import { MedicationLog, MedicationLogSchema } from './schema/medication-log.schema';
import { NurseVisit, NurseVisitSchema } from './schema/nurse-visit.schema';
import { AuditLog, AuditLogSchema } from '../super-admin/schemas/audit-log.schema';
import { MedicalDocument, MedicalDocumentSchema } from './schema/medical-document.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HealthProfile.name, schema: HealthProfileSchema },
      { name: ImmunizationRecord.name, schema: ImmunizationRecordSchema },
      { name: MedicationLog.name, schema: MedicationLogSchema },
      { name: NurseVisit.name, schema: NurseVisitSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: MedicalDocument.name, schema: MedicalDocumentSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}



