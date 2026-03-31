/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Put, Delete, UploadedFile, UseInterceptors, Param, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { GlobalService } from './global.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerOptions, UploadedFileType } from '../../utils/multer.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('global')
export class GlobalController {
  constructor(private readonly globalService: GlobalService) {}

  @Get('demo-videos')
  async getDemoVideos() {
    const list = await this.globalService.listDemoVideos();
    return { success: true, data: list };
  }

  @Post('demo-videos/upload-thumbnail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadDemoThumbnail(@UploadedFile() file: UploadedFileType) {
    if (!file) throw new BadRequestException('No file provided');
    const url = await this.globalService.upload(file, 'demo-thumbnails');
    return { success: true, url };
  }

  @Post('demo-videos/upload-video')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadDemoVideo(@UploadedFile() file: UploadedFileType) {
    if (!file) throw new BadRequestException('No file provided');
    const url = await this.globalService.upload(file, 'demo-videos');
    return { success: true, url };
  }

  @Post('demo-videos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async createDemoVideo(@Body() body: { titleKey: string; descKey: string; imageUrl: string; videoUrl?: string; duration?: string; icon?: string; sortOrder?: number }) {
    const created = await this.globalService.createDemoVideo(body);
    return { success: true, data: created };
  }

  @Delete('demo-videos/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async deleteDemoVideo(@Param('id') id: string) {
    await this.globalService.deleteDemoVideo(id);
    return { success: true };
  }

  @Post('/upload')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadToAzureBlobStorage(
    @UploadedFile() file: UploadedFileType,
  ): Promise<string> {
    return await this.globalService.upload(file);
  }

  // ==================== SCHOOL BRANDING ====================

  @Get('branding/:schoolId')
  async getSchoolBranding(@Param('schoolId') schoolId: string) {
    const branding = await this.globalService.getSchoolBranding(schoolId);
    return { success: true, data: branding };
  }

  @Put('branding/:schoolId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateSchoolBranding(
    @Param('schoolId') schoolId: string,
    @Body() brandingData: any,
    @Req() req: any
  ) {
    const updated = await this.globalService.updateSchoolBranding(
      schoolId,
      brandingData,
      req.user._id
    );
    return { success: true, data: updated };
  }

  @Post('branding/:schoolId/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo', multerOptions))
  async uploadSchoolLogo(
    @Param('schoolId') schoolId: string,
    @UploadedFile() file: UploadedFileType,
    @Req() req: any
  ) {
    const updated = await this.globalService.uploadSchoolLogo(schoolId, file, req.user._id);
    return { success: true, data: updated };
  }

  @Post('branding/:schoolId/favicon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('favicon', multerOptions))
  async uploadSchoolFavicon(
    @Param('schoolId') schoolId: string,
    @UploadedFile() file: UploadedFileType,
    @Req() req: any
  ) {
    const updated = await this.globalService.uploadSchoolFavicon(schoolId, file, req.user._id);
    return { success: true, data: updated };
  }

  @Put('branding/:schoolId/colors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateSchoolColors(
    @Param('schoolId') schoolId: string,
    @Body() colors: any,
    @Req() req: any
  ) {
    const updated = await this.globalService.updateSchoolColors(schoolId, colors, req.user._id);
    return { success: true, data: updated };
  }

  @Put('branding/:schoolId/contact-info')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateContactInfo(
    @Param('schoolId') schoolId: string,
    @Body() contactInfo: any,
    @Req() req: any
  ) {
    const updated = await this.globalService.updateSchoolContactInfo(schoolId, contactInfo, req.user._id);
    return { success: true, data: updated };
  }

  @Put('branding/:schoolId/social-media')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateSocialMedia(
    @Param('schoolId') schoolId: string,
    @Body() socialMedia: any,
    @Req() req: any
  ) {
    const updated = await this.globalService.updateSchoolSocialMedia(schoolId, socialMedia, req.user._id);
    return { success: true, data: updated };
  }
}
