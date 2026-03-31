import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuardianService } from './guardian.service';
import { GuardianController } from './guardian.controller';
import { Guardian, GuardianSchema } from './schema/guardian.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Guardian.name, schema: GuardianSchema }])],
  controllers: [GuardianController],
  providers: [GuardianService],
  exports: [GuardianService, MongooseModule], // Export to be used in Student Module
})
export class GuardianModule {}
