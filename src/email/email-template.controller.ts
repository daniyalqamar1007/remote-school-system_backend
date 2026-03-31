import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, NotFoundException, BadRequestException } from '@nestjs/common';
import { EmailService } from './email.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class EmailTemplateController {
  constructor(private readonly emailService: EmailService) {}

  @Post()
  async createTemplate(@Req() req: any, @Body() templateData: any) {
    const schoolId = req.user?.schoolId || req.user?.school?._id;
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    return this.emailService.createTemplate(
      schoolId.toString(),
      templateData,
      req.user?._id?.toString() || req.user?.userId || 'system'
    );
  }

  @Get()
  async getTemplates(
    @Req() req: any,
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    const schoolId = req.user?.schoolId || req.user?.school?._id;
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    return this.emailService.getTemplates(
      schoolId.toString(),
      category,
      includeInactive === 'true'
    );
  }

  @Get(':id')
  async getTemplateById(@Param('id') id: string) {
    return this.emailService.getTemplateById(id);
  }

  @Put(':id')
  async updateTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateData: any
  ) {
    return this.emailService.updateTemplate(
      id,
      updateData,
      req.user?._id?.toString() || req.user?.userId || 'system'
    );
  }

  @Delete(':id')
  async deleteTemplate(@Param('id') id: string) {
    return this.emailService.deleteTemplate(id);
  }

  @Put(':id/deactivate')
  async deactivateTemplate(
    @Req() req: any,
    @Param('id') id: string
  ) {
    return this.emailService.deactivateTemplate(
      id,
      req.user?._id?.toString() || req.user?.userId || 'system'
    );
  }

  @Post(':id/send')
  async sendEmailWithTemplate(
    @Param('id') id: string,
    @Body() body: { to: string; variables?: Record<string, any> }
  ) {
    if (!body.to) {
      throw new BadRequestException('Recipient email is required');
    }
    return this.emailService.sendEmailWithTemplate(
      body.to,
      id,
      body.variables || {}
    );
  }

  @Post('send-by-name')
  async sendEmailByTemplateName(
    @Req() req: any,
    @Body() body: { templateName: string; to: string; variables?: Record<string, any> }
  ) {
    const schoolId = req.user?.schoolId || req.user?.school?._id;
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    if (!body.templateName || !body.to) {
      throw new BadRequestException('Template name and recipient email are required');
    }
    return this.emailService.sendEmailByTemplateName(
      schoolId.toString(),
      body.to,
      body.templateName,
      body.variables || {}
    );
  }
}

