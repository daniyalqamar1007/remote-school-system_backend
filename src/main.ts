// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { json, urlencoded } from 'express';
import { ensureUploadsFolder } from 'utils/methods';
import * as cookieParser from 'cookie-parser';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationExceptionFilter } from './filters/validation-exception.filter';

dotenv.config({ path: '.env' });

async function bootstrap() {
  ensureUploadsFolder();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Add global exception filter BEFORE ValidationPipe
  app.useGlobalFilters(new ValidationExceptionFilter());

  // Enable validation globally
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    disableErrorMessages: false,
    validateCustomDecorators: true,
    exceptionFactory: (errors) => {
      const errorMessages = errors.map(e => {
        const constraints = e.constraints || {};
        const field = e.property;
        const messages = Object.values(constraints);
        return `${field}: ${messages.join(', ')}`;
      });
      
      console.error('Validation failed:', errorMessages.join(' | '));
      
      return new BadRequestException({
        message: errorMessages,
        error: 'Validation Failed',
        statusCode: 400
      });
    },
  }));

  app.use(cookieParser());
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.use(json());
  app.use(urlencoded({ extended: true }));

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const port = Number(process.env.PORT || 3014);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen(port, host);
  console.log(`Server running on http://localhost:${port}`);
}
bootstrap();