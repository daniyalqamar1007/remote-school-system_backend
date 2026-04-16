import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { resolveSrv } from 'node:dns/promises';
import { StudentModule } from './student/student.module';
import { GuardianModule } from './guardian/guardian.module';
import { TeacherModule } from './teacher/teacher.module';
import { CourseModule } from './course/course.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ActivityModule } from './activity/activity.module';
import { ClubModule } from './club/club.module';
import { GlobalModule } from './global/global.module';
import { GradeModule } from './grade/grade.module';
import { UserModule } from './user/user.module';
import { AwsModule } from './aws/aws.module';
import { ParentModule } from './parent/parent.module';
import { AssignmentModule } from './assignment/assignment.module';
import { BehaviorModule } from './behavior/behavior.module';
import { DocumentModule } from './document/document.module';
import { AbsenceModule } from './absence/absence.module';
import { NurseModule } from './nurse/nurse.module';
import { HealthModule } from './health/health.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { AdminModule } from './admin/admin.module';
import { SecretaryModule } from './secretary/secretary.module';
import { AuthModule } from './auth/auth.module';
import { LessonPlanModule } from './lesson-plan/lesson-plan.module';
import { SportsModule } from './sports/sports.module';
import { HonorRollModule } from './honor-roll/honor-roll.module';
import { IEPModule } from './iep/iep.module';
import { CalendarModule } from './calendar/calendar.module';
import { CommunicationModule } from './communication/communication.module';
import { ReportModule } from './report/report.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minute
      limit: 100, // 100 requests per minute
    }]),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Default to local MongoDB if not specified
        const configuredUri = configService.get<string>('MONGODB_CONNECTION_URL') || 'mongodb://localhost:27017/srs';
        let mongoUri = configuredUri;

        // Work around environments where Atlas TXT lookup fails (queryTxt ETIMEOUT)
        if (configuredUri.startsWith('mongodb+srv://')) {
          try {
            const parsed = new URL(configuredUri);
            const srvHost = `_mongodb._tcp.${parsed.hostname}`;
            const records = await resolveSrv(srvHost);

            if (records.length > 0) {
              const hosts = records.map((record) => `${record.name}:${record.port}`).join(',');
              const dbName = parsed.pathname?.replace(/^\//, '') || 'admin';
              const encodedUser = encodeURIComponent(parsed.username || '');
              const encodedPass = encodeURIComponent(parsed.password || '');

              mongoUri = `mongodb://${encodedUser}:${encodedPass}@${hosts}/${dbName}?tls=true&authSource=admin&retryWrites=true&w=majority`;
            }
          } catch (error) {
            console.warn('Failed to resolve Atlas SRV records, using configured URI directly.');
          }
        }
        
        console.log(`📦 Connecting to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials in logs
        
        return {
          uri: mongoUri,
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 5000, // Reduced for local - faster fail if not running
          socketTimeoutMS: 45000,
          connectTimeoutMS: 10000, // Reduced for local
          heartbeatFrequencyMS: 10000,
          maxIdleTimeMS: 30000,
          family: 4, // Use IPv4, skip trying IPv6
          retryWrites: true,
          retryReads: true,
        };
      },
      inject: [ConfigService],
    }),
    StudentModule,
    GuardianModule,
    TeacherModule,
    CourseModule,
    ScheduleModule,
    AttendanceModule,
    ActivityModule,
    ClubModule,
    GlobalModule,
    GradeModule,
    UserModule,
    AwsModule,
    ParentModule,
    AssignmentModule,
    BehaviorModule,
    DocumentModule,
    AbsenceModule,
    NurseModule,
    HealthModule,
    SuperAdminModule,
    AdminModule,
    SecretaryModule,
    AuthModule,
    LessonPlanModule,
    SportsModule,
    HonorRollModule,
    IEPModule,
    CalendarModule,
    CommunicationModule,
    ReportModule
  ],
  controllers: [AppController],
  providers: [AppService],
})

export class AppModule {}
