import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { IEPService } from './iep.service';

@Controller('iep')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IEPController {
  constructor(private readonly iepService: IEPService) {}

  // ==================== IEP MANAGEMENT ====================

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async createIEP(@Body() iepData: any, @Req() req: any) {
    return this.iepService.createIEP({
      ...iepData,
      schoolId: req.user.schoolId
    }, req.user.userId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getIEPs(@Query() query: any, @Req() req: any) {
    return this.iepService.getIEPsBySchool(req.user.schoolId, query, req.user.role, req.user._id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT)
  async getIEPById(@Param('id') id: string, @Req() req: any) {
    return this.iepService.getIEPById(id, req.user.role, req.user._id, req.user.schoolId);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async updateIEP(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    return this.iepService.updateIEP(id, updateData, req.user.userId);
  }

  // ==================== GOALS MANAGEMENT ====================

  @Post(':id/goals')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async addGoal(@Param('id') id: string, @Body() goalData: any, @Req() req: any) {
    return this.iepService.addGoal(id, goalData, req.user.userId);
  }

  @Put(':id/goals/:goalId/progress')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async updateGoalProgress(@Param('id') id: string, @Param('goalId') goalId: string, @Body() progressData: any, @Req() req: any) {
    return this.iepService.updateGoalProgress(id, goalId, progressData, req.user.userId);
  }

  // ==================== ACCOMMODATIONS & SERVICES ====================

  @Post(':id/accommodations')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async addAccommodation(@Param('id') id: string, @Body() accommodationData: any, @Req() req: any) {
    return this.iepService.addAccommodation(id, accommodationData, req.user.userId);
  }

  @Post(':id/services')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async addService(@Param('id') id: string, @Body() serviceData: any, @Req() req: any) {
    return this.iepService.addService(id, serviceData, req.user.userId);
  }

  // ==================== MEETINGS ====================

  @Post(':id/meetings')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async addMeetingRecord(@Param('id') id: string, @Body() meetingData: any, @Req() req: any) {
    return this.iepService.addMeetingRecord(id, meetingData, req.user.userId);
  }

  // ==================== SERVICE LOGS ====================

  @Post('service-logs')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async createServiceLog(@Body() serviceLogData: any, @Req() req: any) {
    return this.iepService.createServiceLog({
      ...serviceLogData,
      schoolId: req.user.schoolId
    }, req.user.userId);
  }

  @Get('service-logs')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getServiceLogs(@Query() query: any, @Req() req: any) {
    return this.iepService.getServiceLogs({
      ...query,
      schoolId: req.user.schoolId
    });
  }

  @Put('service-logs/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async updateServiceLog(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    return this.iepService.updateServiceLog(id, updateData, req.user.userId);
  }

  // ==================== REPORTS & ANALYTICS ====================

  @Get('analytics/overview')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getAnalytics(@Query() query: any, @Req() req: any) {
    return this.iepService.getIEPAnalytics(req.user.schoolId, query);
  }

  @Get('reports/expiring')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getExpiringIEPs(@Query('days') days: string, @Req() req: any) {
    const daysAhead = days ? parseInt(days) : 30;
    return this.iepService.getExpiringIEPs(req.user.schoolId, daysAhead);
  }

  @Get('reports/service-utilization')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getServiceUtilizationReport(@Query() query: any, @Req() req: any) {
    return this.iepService.getServiceUtilizationReport(req.user.schoolId, query);
  }

  @Get('student/:studentId/history')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT)
  async getStudentHistory(@Param('studentId') studentId: string) {
    return this.iepService.getStudentIEPHistory(studentId);
  }

  @Get('student/:studentId/current')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT)
  async getStudentCurrentIEP(@Param('studentId') studentId: string) {
    return this.iepService.getStudentCurrentIEP(studentId);
  }

  // ==================== PARENT PORTAL ENDPOINTS ====================

  @Get('parent/children-ieps')
  @Roles(UserRole.PARENT)
  async getChildrenIEPs(@Req() req: any) {
    const parentUserId = req.user._id?.toString() || req.user.userId;
    
    // Get parent's children from User model
    const parentUser = await this.iepService.getParentUser(parentUserId);
    if (!parentUser || !parentUser.children || parentUser.children.length === 0) {
      return { ieps: [], message: 'No children found' };
    }

    // Get IEPs for all children
    const childrenIds = parentUser.children.map((childId: any) => childId.toString());
    const ieps = await this.iepService.getIEPsForStudents(childrenIds);
    
    return { ieps, total: ieps.length };
  }
}
