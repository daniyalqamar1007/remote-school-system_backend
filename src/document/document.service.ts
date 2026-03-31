import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { StudentDocument } from './schema/document.schema';
import { Model, Types } from 'mongoose';
import { CreateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentService {
  constructor(
    @InjectModel(StudentDocument.name)
    private readonly docModel: Model<StudentDocument>,
  ) {}

  async create(dto: CreateDocumentDto) {
    return this.docModel.create(dto);
  }

  async getForStudent(studentId: string) {
    return this.docModel.find({ studentId }).sort({ createdAt: -1 }).lean();
  }

  async upload(
    docId: string,
    uploadUrl: string,
    comment?: string,
  ) {
    const doc = await this.docModel.findById(docId);
    if (!doc) throw new NotFoundException('Document not found');

    doc.uploadUrl = uploadUrl;
    doc.comment = comment;
    doc.status = 'completed';
    doc.uploadedAt = new Date();

    await doc.save();
    return doc;
  }

  async bulkAssign(documentData: CreateDocumentDto, studentIds: string[]): Promise<any> {
    const documents = studentIds.map(studentId => ({
      ...documentData,
      studentId: new Types.ObjectId(studentId),
    }));

    const created = await this.docModel.insertMany(documents);
    return {
      success: true,
      count: created.length,
      documents: created,
    };
  }
}