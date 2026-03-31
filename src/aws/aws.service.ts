import { HttpStatus, Injectable } from '@nestjs/common';
import {
  S3Client,
  DeleteObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class AwsService {
  private s3: S3Client;
  private bucketName: string;
  constructor(private configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get<string>(
          'AWS_SECRET_ACCESS_KEY',
        ),
      },
    });
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME');
    
    // Debug logging
    console.log('========================================');
    console.log('AWS Configuration:');
    console.log('Bucket Name:', this.bucketName);
    console.log('Region:', this.configService.get<string>('AWS_REGION'));
    console.log('Access Key:', this.configService.get<string>('AWS_ACCESS_KEY_ID') ? 'Set' : 'Missing');
    console.log('Secret Key:', this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ? 'Set' : 'Missing');
    console.log('========================================');
  }

  async generateSignedUrl(fileName: string, contentType: string) {
    try {
      const key = `${Date.now()}-${fileName}`;

      // Create a PutObjectCommand with the correct parameters
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      console.log(command)

      // Generate the signed URL
      const url = await getSignedUrl(this.s3, command, { expiresIn: 60 * 5 }); // URL expires in 5 minutes
      return {
        success: false,
        statusCode: HttpStatus.OK,
        msg: {
          url,
          key,
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: any) {
      console.log(e);
      return { success: false, statusCode: HttpStatus.INTERNAL_SERVER_ERROR };
    }
  }

  async deleteFile(key: string): Promise<any> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3.send(command);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        msg: `File ${key} deleted successfully`,
      };
    } catch (error) {
      console.log(`Failed to delete file: ${error.message}`);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        msg: error.message,
      };
    }
  }

  async uploadFile(key: string, fileContent: Buffer, contentType: string): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
        // Removed ACL as it may not be supported if bucket has ACLs disabled
        // Files will be accessed via signed URLs instead
      });

      await this.s3.send(command);

      // Return the S3 key instead of full URL - we'll generate signed URLs when needed
      return key;
    } catch (error) {
      console.log(`Failed to upload file: ${error.message}`);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  // Extract S3 key from URL or return the key if it's already a key
  extractS3Key(urlOrKey: string): string {
    // If it's already a key (doesn't start with http), return as is
    if (!urlOrKey.startsWith('http://') && !urlOrKey.startsWith('https://')) {
      return urlOrKey;
    }
    
    // Extract key from S3 URL
    // Format: https://bucket.s3.region.amazonaws.com/key
    const url = new URL(urlOrKey);
    return url.pathname.substring(1); // Remove leading slash
  }

  getS3Client(): S3Client {
    return this.s3;
  }

  getBucketName(): string {
    return this.bucketName;
  }

  async generateDownloadSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const url = await getSignedUrl(this.s3, command, { expiresIn });
      return url;
    } catch (error) {
      console.log(`Failed to generate signed URL: ${error.message}`);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  async getFileFromS3(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3.send(command);
      const chunks: Uint8Array[] = [];
      
      if (response.Body) {
        for await (const chunk of response.Body as any) {
          chunks.push(chunk);
        }
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.log(`Failed to get file from S3: ${error.message}`);
      throw new Error(`Failed to get file from S3: ${error.message}`);
    }
  }
}
