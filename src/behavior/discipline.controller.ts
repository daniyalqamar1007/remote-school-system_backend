import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { DisciplineService } from './discipline.service';

@Controller('discipline')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisciplineController {
  constructor(private readonly disciplineService: DisciplineService) {}

  @Post('actions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR, UserRole.TEACHER)
  async assignAction(@Body() body: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be in body (from frontend)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (body.schoolId || req.user.schoolId) : req.user.schoolId;
    
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    return this.disciplineService.assignAction({
      ...body,
      schoolId
    }, req.user.userId || req.user._id);
  }

  @Post('actions/:id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async approveDiscipline(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.disciplineService.approveDiscipline(id, req.user.userId || req.user._id);
  }

  @Post('actions/:id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async rejectDiscipline(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    if (!body.reason) {
      throw new BadRequestException('Rejection reason is required');
    }
    return this.disciplineService.rejectDiscipline(id, body.reason, req.user.userId || req.user._id);
  }

  @Get('actions/pending-approval')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async getPendingDisciplines(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    return this.disciplineService.getPendingDisciplines(schoolId, query);
  }

  @Get('actions/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.GUIDANCE_COUNSELOR)
  async getActionById(@Param('id') id: string, @Req() req: any) {
    return this.disciplineService.getActionById(id);
  }

  @Get('actions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.GUIDANCE_COUNSELOR)
  async getActions(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    const userId = req.user._id || req.user.userId;
    // For SUPER_ADMIN, schoolId can be in query (optional)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    // For teachers, filter by their assigned students
    const filters: any = { ...query, schoolId };
    if (role === 'TEACHER') {
      filters.teacherId = userId;
    }
    
    return this.disciplineService.getActions(filters);
  }

  @Put('actions/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async updateAction(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.disciplineService.updateAction(id, body, req.user);
  }

  @Patch('actions/:id/status')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async updateActionStatus(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.disciplineService.updateAction(id, { status: body.status, notes: body.notes }, req.user);
  }

  @Patch('actions/:id/complete')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async completeAction(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.disciplineService.completeAction(id, body, req.user.userId || req.user._id);
  }

  @Post('actions/:id/notify-parent')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async notifyParent(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.disciplineService.notifyParent(id, body, req.user.userId || req.user._id);
  }

  @Post('actions/:id/generate-letter')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.GUIDANCE_COUNSELOR)
  async generateConductLetter(@Param('id') id: string, @Req() req: any) {
    return this.disciplineService.generateConductLetter(id, req.user.userId || req.user._id);
  }

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.GUIDANCE_COUNSELOR)
  async getReports(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    return this.disciplineService.generateReports({ ...query, schoolId });
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.GUIDANCE_COUNSELOR, UserRole.TEACHER)
  async getStats(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    return this.disciplineService.getStats(schoolId);
  }

  @Get('parent/actions')
  @Roles(UserRole.PARENT)
  async getParentActions(@Query() query: any, @Req() req: any) {
    // For parents, studentId must be provided to filter actions for their child
    if (!query.studentId) {
      throw new BadRequestException('Student ID is required');
    }
    
    // Use the existing getActions method with studentId filter
    return this.disciplineService.getActions({
      ...query,
      studentId: query.studentId
    });
  }

  @Delete('actions/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.GUIDANCE_COUNSELOR)
  async deleteAction(@Param('id') id: string, @Req() req: any) {
    return this.disciplineService.deleteAction(id, req.user);
  }
}
