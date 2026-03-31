import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import { CommunicationGateway } from './communication.gateway';
import { Conversation, ConversationSchema } from './schema/conversation.schema';
import { Message, MessageSchema } from './schema/message.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';
import { AwsModule } from '../aws/aws.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule,
    AwsModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
    ]),
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
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService, CommunicationGateway],
  exports: [CommunicationService, CommunicationGateway]
})
export class CommunicationModule {}



