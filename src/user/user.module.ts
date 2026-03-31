import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TeacherModule } from 'src/teacher/teacher.module';
import { JwtModule } from '@nestjs/jwt';
import { StudentModule } from 'src/student/student.module';
import { ParentModule } from 'src/parent/parent.module';
import { NurseModule } from 'src/nurse/nurse.module';
import { SuperAdminModule } from 'src/super-admin/super-admin.module';
import { SecretaryModule } from 'src/secretary/secretary.module';

@Module({
  imports: [
    TeacherModule,
    JwtModule.register({
      secret: 'WATCHDOGS426890', // move to .env in production
      signOptions: { expiresIn: '1d' },
    }),
    StudentModule,
    ParentModule,
    NurseModule,
    SuperAdminModule,
    SecretaryModule
  ],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}