import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from '../email/email.module';

// Schemas
import { User, UserSchema } from './schemas/user.schema';
import { School, SchoolSchema } from './schemas/school.schema';
import { StudentProfile, StudentProfileSchema } from './schemas/student-profile.schema';
import { TeacherProfile, TeacherProfileSchema } from './schemas/teacher-profile.schema';
import { ParentProfile, ParentProfileSchema } from './schemas/parent-profile.schema';
import { Parent, ParentSchema } from '../parent/schema/parent.schema';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    EmailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'defaultSecret123!@#',
        signOptions: { 
          // expiresIn: '7d',
          issuer: 'SRS-System',
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: School.name, schema: SchoolSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: ParentProfile.name, schema: ParentProfileSchema },
      { name: Parent.name, schema: ParentSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
