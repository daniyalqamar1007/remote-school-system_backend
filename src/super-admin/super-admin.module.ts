import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { School, SchoolSchema } from '../auth/schemas/school.schema';
import { StudentProfile, StudentProfileSchema } from '../auth/schemas/student-profile.schema';
import { ParentProfile, ParentProfileSchema } from '../auth/schemas/parent-profile.schema';
import { TeacherProfile, TeacherProfileSchema } from '../auth/schemas/teacher-profile.schema';
import { Role, RoleSchema } from './schemas/role.schema';
import { Permission, PermissionSchema } from './schemas/permission.schema';
import { AcademicTerm, AcademicTermSchema } from './schemas/academic-term.schema';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { SystemConfig, SystemConfigSchema } from './schemas/system-config.schema';
import { AccessControl, AccessControlSchema } from './schemas/access-control.schema';
import { UserSession, UserSessionSchema } from './schemas/user-session.schema';
import { SystemMonitor, SystemMonitorSchema } from './schemas/system-monitor.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { EmailModule } from '../email/email.module';

// New feature schemas
import { ScheduledJob, ScheduledJobSchema } from './schemas/scheduled-job.schema';
import { RolloverConfig, RolloverConfigSchema } from './schemas/rollover-config.schema';
import { CustomReport, CustomReportSchema } from './schemas/custom-report.schema';
import { SystemAlert, SystemAlertSchema, AlertRule, AlertRuleSchema, NotificationTemplate, NotificationTemplateSchema } from './schemas/system-alert.schema';
import { EmailTemplate, EmailTemplateSchema } from '../email/schema/email-template.schema';
import { Certificate, CertificateSchema, CertificateRequest, CertificateRequestSchema, TrustedCA, TrustedCASchema } from './schemas/certificate.schema';
import { Integration, IntegrationSchema, IntegrationLog, IntegrationLogSchema } from './schemas/integration.schema';
import { Parent, ParentSchema } from '../parent/schema/parent.schema';
import { Department, DepartmentSchema } from '../auth/schemas/department.schema';
import { Course, CourseSchema } from '../course/schema/course.schema';
import { AdminModule } from '../admin/admin.module';
import { LessonPlanModule } from '../lesson-plan/lesson-plan.module';

@Module({
  imports: [
    EmailModule,
    AdminModule,
    LessonPlanModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: School.name, schema: SchoolSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: ParentProfile.name, schema: ParentProfileSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Permission.name, schema: PermissionSchema },
      { name: AcademicTerm.name, schema: AcademicTermSchema },
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: SystemConfig.name, schema: SystemConfigSchema },
      { name: AccessControl.name, schema: AccessControlSchema },
      { name: UserSession.name, schema: UserSessionSchema },
      { name: SystemMonitor.name, schema: SystemMonitorSchema },
      { name: Activity.name, schema: ActivitySchema },
      // New feature schemas
      { name: ScheduledJob.name, schema: ScheduledJobSchema },
      { name: RolloverConfig.name, schema: RolloverConfigSchema },
      { name: CustomReport.name, schema: CustomReportSchema },
      { name: SystemAlert.name, schema: SystemAlertSchema },
      { name: AlertRule.name, schema: AlertRuleSchema },
      { name: NotificationTemplate.name, schema: NotificationTemplateSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: Certificate.name, schema: CertificateSchema },
      { name: CertificateRequest.name, schema: CertificateRequestSchema },
      { name: TrustedCA.name, schema: TrustedCASchema },
      { name: Integration.name, schema: IntegrationSchema },
      { name: IntegrationLog.name, schema: IntegrationLogSchema },
      { name: Parent.name, schema: ParentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Course.name, schema: CourseSchema },
    ]),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
