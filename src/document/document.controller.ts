import {
    Controller, Post, Get, Param, Body, Query, UploadedFile, UseInterceptors, NotFoundException
  } from '@nestjs/common';
  import { DocumentService } from './document.service';
  import { CreateDocumentDto } from './dto/create-document.dto';
  import { UploadDocumentDto } from './dto/upload-document.dto';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { GlobalService } from '../global/global.service'; // For S3 upload
  import { UploadedFileType, multerOptions } from '../../utils/multer.config';
  
  @Controller('documents')
  export class DocumentController {
    constructor(
      private readonly docService: DocumentService,
      private readonly globalService: GlobalService,
    ) {}
  
    @Post('add')
    async create(@Body() dto: CreateDocumentDto) {
      return this.docService.create(dto);
    }

    @Post('bulk-assign')
    async bulkAssign(@Body() bulkData: { documentData: CreateDocumentDto; studentIds: string[] }) {
      return this.docService.bulkAssign(bulkData.documentData, bulkData.studentIds);
    }
  
    @Get('student/:studentId')
    async getForStudent(@Param('studentId') studentId: string) {
      return this.docService.getForStudent(studentId);
    }
  
    // Parent uploads a completed document for a given doc _id
    @Post('upload/:docId')
    @UseInterceptors(FileInterceptor('file', multerOptions))
    async upload(
      @Param('docId') docId: string,
      @UploadedFile() file: UploadedFileType,
      @Body() body: UploadDocumentDto,
    ) {
      // Upload to S3
      if (!file) throw new NotFoundException('No file uploaded');
      const uploadUrl = await this.globalService.upload(file, 'student-documents');
  
      // Save uploadUrl and comment in document
      return this.docService.upload(docId, uploadUrl, body.comment);
    }
  }