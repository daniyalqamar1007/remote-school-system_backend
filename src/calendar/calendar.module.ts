import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { SchoolEvent, SchoolEventSchema } from './schema/school-event.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SchoolEvent.name, schema: SchoolEventSchema },
    ]),
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
