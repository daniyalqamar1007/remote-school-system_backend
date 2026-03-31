import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { StudentDocument, StudentDocumentSchema } from './schema/document.schema';
import { GlobalModule } from '../global/global.module'; 

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudentDocument.name, schema: StudentDocumentSchema }
    ]),
    GlobalModule,   // <-- ADD THIS
    // forwardRef(() => GlobalModule), // Optional if you have circular deps, but not needed here
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}