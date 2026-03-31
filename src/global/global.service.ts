/* src/global/global.service.ts */
import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { UploadedFileType } from '../../utils/multer.config';
import { readFile, unlink } from 'fs/promises';
import { SchoolBranding, SchoolBrandingDocument } from './schema/school-branding.schema';
import { DemoVideo, DemoVideoDocument } from './schema/demo-video.schema';

@Injectable()
export class GlobalService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    @InjectModel(SchoolBranding.name) private brandingModel: Model<SchoolBrandingDocument>,
    @InjectModel(DemoVideo.name) private demoVideoModel: Model<DemoVideoDocument>,
  ) {
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
    this.bucket = process.env.AWS_S3_BUCKET_NAME as string;
  }

  /**
   * Upload a single file to AWS S3
   * @param file uploaded file from Multer
   * @param folder optional folder path within the bucket
   * @returns public URL of the uploaded file
   */
  async upload(file: UploadedFileType, folder?: string): Promise<string> {
    const fileExt = file.originalname.split('.').pop();
    const key = folder
      ? `${folder}/${uuidv4()}.${fileExt}`
      : `${uuidv4()}.${fileExt}`;

    try {
      const fileBody = file.buffer ?? await readFile(file.path);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: fileBody,
          ContentType: this.getContentType(file.originalname),
        }),
      );
      if (file.path) {
        await unlink(file.path);
      }
      return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new InternalServerErrorException('Failed to upload file');
    }
  }

  /**
   * Upload multiple files to AWS S3
   */
  async uploadMultiple(
    files: UploadedFileType[],
    folder?: string,
  ): Promise<string[]> {
    const promises = files.map((file) => this.upload(file, folder));
    return Promise.all(promises);
  }

  /**
   * Delete a file from AWS S3 by its key
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      return false;
    }
  }

  /**
   * Construct S3 file URL manually if needed
   */
  getFileUrl(key: string): string {
    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  /**
   * Helper to determine content type based on file extension
   */
  private getContentType(filename: string): string {
    const ext = filename.toLowerCase().split('.').pop();
    const map: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mov: 'video/quicktime',
      ogv: 'video/ogg',
    };
    return map[ext || ''] || 'application/octet-stream';
  }

  // ==================== SCHOOL BRANDING ====================

  /**
   * Get school branding settings
   */
  async getSchoolBranding(schoolId: string): Promise<SchoolBranding> {
    const branding = await this.brandingModel.findOne({ 
      schoolId: new Types.ObjectId(schoolId),
      isActive: true 
    });

    if (!branding) {
      // Return default branding if not found
      return {
        schoolId: new Types.ObjectId(schoolId),
        schoolName: 'School',
        primaryColor: '#1976D2',
        secondaryColor: '#F50057',
        backgroundColor: '#FFFFFF',
        textColor: '#333333',
        isActive: true
      } as any;
    }

    return branding;
  }

  /**
   * Create or update school branding
   */
  async updateSchoolBranding(schoolId: string, brandingData: any, updatedBy: string): Promise<SchoolBranding> {
    const existing = await this.brandingModel.findOne({ 
      schoolId: new Types.ObjectId(schoolId) 
    });

    if (existing) {
      // Update existing
      return this.brandingModel.findByIdAndUpdate(
        existing._id,
        { ...brandingData, updatedBy },
        { new: true }
      );
    } else {
      // Create new
      const branding = new this.brandingModel({
        schoolId: new Types.ObjectId(schoolId),
        ...brandingData,
        createdBy: updatedBy,
        updatedBy
      });
      return branding.save();
    }
  }

  /**
   * Upload school logo
   */
  async uploadSchoolLogo(schoolId: string, file: UploadedFileType, updatedBy: string): Promise<SchoolBranding> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      const logoUrl = await this.upload(file, `school-logos/${schoolId}`);
      
      return this.updateSchoolBranding(schoolId, { logoUrl }, updatedBy);
    } catch (error) {
      console.error('Error uploading school logo:', error);
      throw new InternalServerErrorException('Failed to upload logo');
    }
  }

  /**
   * Upload school favicon
   */
  async uploadSchoolFavicon(schoolId: string, file: UploadedFileType, updatedBy: string): Promise<SchoolBranding> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    try {
      const faviconUrl = await this.upload(file, `school-favicons/${schoolId}`);
      
      return this.updateSchoolBranding(schoolId, { faviconUrl }, updatedBy);
    } catch (error) {
      console.error('Error uploading school favicon:', error);
      throw new InternalServerErrorException('Failed to upload favicon');
    }
  }

  /**
   * Update school colors and theme
   */
  async updateSchoolColors(
    schoolId: string,
    colors: {
      primaryColor?: string;
      secondaryColor?: string;
      backgroundColor?: string;
      textColor?: string;
    },
    updatedBy: string
  ): Promise<SchoolBranding> {
    // Validate hex colors
    const hexColorRegex = /^#([A-F0-9]{6}|[A-F0-9]{3})$/i;
    
    for (const [key, value] of Object.entries(colors)) {
      if (value && !hexColorRegex.test(value)) {
        throw new BadRequestException(`Invalid color format for ${key}`);
      }
    }

    return this.updateSchoolBranding(schoolId, colors, updatedBy);
  }

  /**
   * Update school contact information in branding
   */
  async updateSchoolContactInfo(
    schoolId: string,
    contactInfo: {
      website?: string;
      phone?: string;
      email?: string;
      footerText?: string;
    },
    updatedBy: string
  ): Promise<SchoolBranding> {
    return this.updateSchoolBranding(schoolId, contactInfo, updatedBy);
  }

  /**
   * Update school social media links
   */
  async updateSchoolSocialMedia(
    schoolId: string,
    socialMedia: {
      facebook?: string;
      twitter?: string;
      instagram?: string;
      linkedin?: string;
    },
    updatedBy: string
  ): Promise<SchoolBranding> {
    return this.updateSchoolBranding(schoolId, { socialMedia }, updatedBy);
  }

  async listDemoVideos(): Promise<DemoVideo[]> {
    return this.demoVideoModel.find().sort({ sortOrder: 1 }).lean().exec();
  }

  async createDemoVideo(data: { titleKey: string; descKey: string; imageUrl: string; videoUrl?: string; duration?: string; icon?: string; sortOrder?: number }): Promise<DemoVideo> {
    const count = await this.demoVideoModel.countDocuments();
    const doc = new this.demoVideoModel({
      ...data,
      sortOrder: data.sortOrder ?? count,
    });
    return doc.save();
  }

  async deleteDemoVideo(id: string): Promise<void> {
    const result = await this.demoVideoModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('Demo video not found');
    }
  }
}



// /* eslint-disable prettier/prettier */
// import { Injectable } from '@nestjs/common';
// import { BlobServiceClient, BlockBlobClient } from '@azure/storage-blob';
// import { v4 as uuidv4 } from 'uuid';
// import { UploadedFileType } from 'utils/multer.config';
// import { promises as fs } from 'fs';

// @Injectable()
// export class GlobalService {
//   private containerName: string;
//   private azureConnection : string

//   constructor() {
//     this.azureConnection = process.env.AZURE_STORAGE_CONNECTION_STRING as string;

// }

//     // Method to get blob client
//     private getBlobClient(imageName: string): BlockBlobClient {
//     const blobClientService = BlobServiceClient.fromConnectionString(this.azureConnection);
//     const containerClient = blobClientService.getContainerClient(this.containerName);
//     const blobClient = containerClient.getBlockBlobClient(imageName);
//     return blobClient;
//     }

//   // Method to upload file to Azure Blob Storage
//   async upload(file: UploadedFileType): Promise<string> {
//     try {
//       const pdfUrl = uuidv4() + file.originalname;
//       const blobClient = this.getBlobClient(pdfUrl);
//       const buffer = await fs.readFile(file.path);
//       await blobClient.uploadData(buffer); // Upload file data
//       return pdfUrl; // Return URL of uploaded file
//     } catch (error) {
//       console.error('Error uploading file:', error);
//       throw new Error('Failed to upload file');
//     }
//   }
// }
