import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { EmailTemplateController } from './email-template.controller';
import { EmailTemplate, EmailTemplateSchema } from './schema/email-template.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: EmailTemplate.name, schema: EmailTemplateSchema }])
  ],
  controllers: [EmailTemplateController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
