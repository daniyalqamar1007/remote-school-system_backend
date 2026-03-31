import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GlobalController } from './global.controller';
import { GlobalService } from './global.service';
import { SchoolBranding, SchoolBrandingSchema } from './schema/school-branding.schema';
import { DemoVideo, DemoVideoSchema } from './schema/demo-video.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SchoolBranding.name, schema: SchoolBrandingSchema },
      { name: DemoVideo.name, schema: DemoVideoSchema }
    ])
  ],
  controllers: [GlobalController],
  providers: [GlobalService],
  exports: [GlobalService], 
})
export class GlobalModule {}
