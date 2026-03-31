import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { AwsService } from './aws.service';

@Controller('aws')
export class AwsController {
  constructor(private readonly awsService: AwsService) {}

  @Delete(':key')
  async deleteFile(@Param() param: { key: string }) {
    return this.awsService.deleteFile(param.key);
  }

  @Get('signed-url')
  async getSignedUrl(
    @Query('fileName') filename: string,
    @Query('contentType') contentType: string,
  ) {
    return this.awsService.generateSignedUrl(filename, contentType);
  }
}
