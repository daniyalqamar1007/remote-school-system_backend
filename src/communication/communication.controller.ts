import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { UseInterceptors, UploadedFile } from '@nestjs/common';
import type { Express } from 'express';
import { CommunicationService } from './communication.service';
import { multerOptions } from '../../utils/multer.config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('communication')
@UseGuards(JwtAuthGuard)
export class CommunicationController {
  constructor(private readonly comms: CommunicationService) {}

  @Get('contacts')
  async getContacts(@Req() req: any) {
    console.log('getContacts endpoint called:', {
      userId: req.user._id,
      schoolId: req.user.schoolId,
      role: req.user.role
    });
    const result = await this.comms.getContacts(req.user._id, req.user.schoolId, req.user.role);
    console.log('getContacts result:', { count: result?.length || 0 });
    return result;
  }

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.comms.getConversations(req.user._id, req.user.schoolId);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') id: string, 
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Req() req: any
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    
    // For parents, schoolId might be null - getMessages will handle it
    return this.comms.getMessages(id, req.user._id, req.user.schoolId || null, pageNum, limitNum);
  }

  @Post('messages')
  @Throttle({ default: { limit: 100, ttl: 60000 } }) // 100 requests per minute
  async sendMessage(@Req() req: any, @Body() body: any) {
    return this.comms.sendMessage(req.user._id, body.receiverId, body.content, req.user.schoolId, body.type);
  }

  @Post('messages/upload')
  @UseInterceptors(FileInterceptor('file', multerOptions))
  @Throttle({ default: { limit: 50, ttl: 60000 } }) // 50 file uploads per minute
  async sendFileMessage(@Req() req: any, @UploadedFile() file: any, @Body() body: any) {
    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('File too large. Maximum size is 10MB.');
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
      'application/pdf', 
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac',
      'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error('File type not allowed.');
    }

    // Determine file type from mimetype if not provided
    let fileType = body.type || 'file';
    if (!body.type) {
      if (file.mimetype.startsWith('image/')) {
        fileType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        fileType = 'video';
      } else if (file.mimetype.startsWith('audio/')) {
        fileType = 'audio';
      }
    }

    // Upload to AWS S3 with proper folder structure
    return this.comms.uploadFileAndSendMessage(
      req.user._id,
      body.receiverId,
      file,
      req.user.schoolId,
      fileType
    );
  }

  @Patch('messages/:id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    return this.comms.markAsRead(id, req.user._id);
  }

  @Delete('conversations/:id/messages')
  async clearChat(@Param('id') id: string, @Req() req: any) {
    const userId = req.user._id?.toString?.() || req.user.userId || req.user._id;
    return this.comms.clearChat(id, userId, req.user.schoolId);
  }

  @Get('conversations/:id/search')
  async searchMessages(
    @Param('id') id: string,
    @Query('q') query: string,
    @Req() req: any
  ) {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.comms.searchMessages(id, req.user._id, req.user.schoolId, query.trim());
  }

  @Patch('last-seen')
  async updateLastSeen(@Req() req: any) {
    await this.comms.updateLastSeen(req.user._id);
    return { success: true };
  }
}


