import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, HttpException, HttpStatus, Req, Res } from '@nestjs/common';
import { ClubService } from './club.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('clubs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClubController {
  constructor(private readonly clubService: ClubService) {}

  // Basic CRUD operations
  @Post()
  create(@Body() createClubDto: CreateClubDto) {
    return this.clubService.create(createClubDto);
  }

  @Get()
  findAll(@Query('schoolId') schoolId?: string) {
    if (schoolId) {
      return this.clubService.findBySchool(schoolId);
    }
    return this.clubService.findAll();
  }

  @Get('advisor/:advisorId')
  findByAdvisor(@Param('advisorId') advisorId: string) {
    return this.clubService.findByAdvisor(advisorId);
  }

  @Get('type/:type')
  findByType(@Param('type') type: string, @Query('schoolId') schoolId?: string) {
    return this.clubService.findByType(type, schoolId);
  }

  @Get('analytics')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  getClubAnalytics(@Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.clubService.getSchoolClubAnalytics(schoolId);
  }

  // Reports (PDF generation routed through service export, return PDF blob)
  @Get('reports/activity')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getActivityReport(@Req() req: any, @Res() res: any) {
    const schoolId = req.user.schoolId;
    const report = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'activity' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="club-activity-report-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(report.data || report);
  }

  @Get('reports/membership')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getMembershipReport(@Req() req: any, @Res() res: any) {
    const schoolId = req.user.schoolId;
    const report = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'membership' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="club-membership-report-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(report.data || report);
  }

  @Get('reports/performance')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getPerformanceReport(@Req() req: any, @Res() res: any) {
    const schoolId = req.user.schoolId;
    const report = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'performance' });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="club-performance-report-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(report.data || report);
  }

  @Get('school/:schoolId/analytics')
  getSchoolClubAnalytics(@Param('schoolId') schoolId: string) {
    return this.clubService.getSchoolClubAnalytics(schoolId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clubService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateClubDto: UpdateClubDto) {
    return this.clubService.update(id, updateClubDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubService.remove(id);
  }

  // Membership management
  @Post(':clubId/membership/request')
  requestMembership(@Param('clubId') clubId: string, @Body() membershipData: any) {
    return this.clubService.requestMembership(clubId, membershipData.studentId, membershipData.role || 'Member');
  }

  @Patch(':clubId/membership/:membershipId/approve')
  approveMembership(@Param('clubId') clubId: string, @Param('membershipId') membershipId: string, @Body() approvalData: any) {
    return this.clubService.approveMembership(membershipId, approvalData.approvedBy);
  }

  @Patch(':clubId/membership/:membershipId/reject')
  rejectMembership(@Param('clubId') clubId: string, @Param('membershipId') membershipId: string, @Body() rejectionData: any) {
    return this.clubService.rejectMembership(membershipId, rejectionData.rejectedBy, rejectionData.reason);
  }

  @Delete(':clubId/membership/:membershipId')
  removeMembership(@Param('clubId') clubId: string, @Param('membershipId') membershipId: string) {
    return this.clubService.removeMembership(membershipId);
  }

  @Delete('membership/:membershipId')
  removeMembershipById(@Param('membershipId') membershipId: string) {
    return this.clubService.removeMembership(membershipId);
  }

  @Get(':clubId/members')
  getClubMembers(@Param('clubId') clubId: string, @Query() query: any) {
    return this.clubService.getClubMembers(clubId, query);
  }

  @Get(':clubId/membership/pending')
  getPendingRequests(@Param('clubId') clubId: string, @Query() query: any) {
    return this.clubService.getPendingRequests(clubId, query);
  }

  @Get('student/:studentId/memberships')
  getStudentMemberships(@Param('studentId') studentId: string) {
    return this.clubService.getStudentMemberships(studentId);
  }

  // Attendance management
  @Post(':clubId/attendance')
  markAttendance(@Param('clubId') clubId: string, @Body() attendanceData: any) {
    return this.clubService.markAttendance(clubId, attendanceData.studentId, attendanceData.date, attendanceData.status, attendanceData.markedBy);
  }

  @Post('attendance/record')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async recordAttendance(@Req() req: any, @Body() attendanceData: any) {
    const schoolId = req.user.schoolId;
    const recordedBy = req.user._id || req.user.userId;
    const role = req.user.role;
    return this.clubService.recordAttendance(attendanceData, recordedBy.toString(), schoolId, role);
  }

  @Get(':clubId/attendance')
  getClubAttendance(@Param('clubId') clubId: string, @Query('date') date?: string, @Query('studentId') studentId?: string) {
    if (date) {
      return this.clubService.getAttendanceByDate(clubId, new Date(date));
    }
    if (studentId) {
      return this.clubService.getStudentAttendance(clubId, studentId);
    }
    return this.clubService.getClubAttendance(clubId);
  }

  @Get(':clubId/attendance/summary')
  getAttendanceSummary(@Param('clubId') clubId: string, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    if (!startDate || !endDate) {
      throw new HttpException('Start date and end date are required', HttpStatus.BAD_REQUEST);
    }
    return this.clubService.getAttendanceSummary(clubId, new Date(startDate), new Date(endDate));
  }

  // Get all announcements across clubs (with optional filters)
  @Get('announcements')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllAnnouncements(@Req() req: any, @Query() query: any) {
    const schoolId = req.user.schoolId;
    const { clubId, search, status, page = 1, limit = 10 } = query;
    
    // Build filter object
    const filter: any = { schoolId };
    if (clubId) filter.clubId = clubId;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    try {
      const announcements = await this.clubService.getAnnouncements(filter, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10)
      });
      return announcements;
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch announcements',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // Announcements management
  @Post(':clubId/announcements')
  async createAnnouncement(@Param('clubId') clubId: string, @Body() announcementData: any, @Req() req: any) {
    const role = req.user.role || 'ADMIN';
    const createdBy = req.user._id?.toString() || req.user.userId || announcementData.createdBy || announcementData.postedBy;
    
    console.log('\n🔵 ========== CREATING CLUB ANNOUNCEMENT (CLUB CONTROLLER) ==========');
    console.log('📋 Club ID:', clubId);
    console.log('📋 Announcement Data:', JSON.stringify({
      title: announcementData.title,
      content: announcementData.content || announcementData.message,
      priority: announcementData.priority,
      targetAudience: announcementData.targetAudience
    }, null, 2));
    console.log('📋 Role:', role);
    console.log('📋 Created By:', createdBy);
    
    // Map UI priority to schema type enum
    const priorityToType: Record<string, string> = {
      low: 'general',
      normal: 'general',
      high: 'event',
      urgent: 'urgent'
    };
    const announcementPayload = {
      clubId,
      schoolId: req.user.schoolId,
      title: announcementData.title,
      content: announcementData.content || announcementData.message,
      type: priorityToType[(announcementData.priority || '').toLowerCase()] || 'general',
      eventDate: announcementData.scheduledFor || announcementData.eventDate || undefined,
      scheduledAt: announcementData.scheduledAt,
      scheduledFor: announcementData.scheduledFor,
      targetAudience: announcementData.targetAudience || 'members',
      // Set notifyParents to true if targetAudience includes parents or is 'both'
      notifyParents: announcementData.targetAudience === 'parents' || 
                     announcementData.targetAudience === 'both' || 
                     announcementData.targetAudience === 'parent and member' ||
                     announcementData.targetAudience === 'parents and members' ||
                     announcementData.targetAudience === 'members and parents' ||
                     announcementData.targetAudience === 'all',
      createdBy: createdBy,
      isActive: true
    };
    
    const announcement = await this.clubService.createAnnouncement(announcementPayload, role, createdBy);
    
    console.log('✅ Club Controller: Announcement created successfully with ID:', (announcement as any)._id.toString());
    
    return announcement;
  }

  @Get(':clubId/announcements')
  getClubAnnouncements(@Param('clubId') clubId: string) {
    return this.clubService.getClubAnnouncements(clubId);
  }

  @Patch(':clubId/announcements/:announcementId')
  updateAnnouncement(@Param('clubId') clubId: string, @Param('announcementId') announcementId: string, @Body() updateData: any) {
    return this.clubService.updateAnnouncement(announcementId, updateData);
  }

  @Patch(':clubId/announcements/:announcementId/send')
  sendAnnouncement(@Param('clubId') clubId: string, @Param('announcementId') announcementId: string, @Req() req: any) {
    return this.clubService.updateAnnouncement(announcementId, { sentAt: new Date(), sentBy: req.user._id });
  }

  @Delete(':clubId/announcements/:announcementId')
  deleteAnnouncement(@Param('clubId') clubId: string, @Param('announcementId') announcementId: string) {
    return this.clubService.deleteAnnouncement(announcementId);
  }

  // Reports and analytics
  @Get(':clubId/participation-report')
  getParticipationReport(@Param('clubId') clubId: string, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    if (!startDate || !endDate) {
      throw new HttpException('Start date and end date are required', HttpStatus.BAD_REQUEST);
    }
    return this.clubService.getParticipationReport(clubId, new Date(startDate), new Date(endDate));
  }

  // ==================== STUDENT PORTAL ENDPOINTS ====================

  @Get('student/my-clubs')
  @UseGuards(JwtAuthGuard)
  async getMyClubs(@Req() req: any) {
    const studentProfileId = req.user.studentProfileId;
    if (!studentProfileId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    return this.clubService.getStudentMemberships(studentProfileId);
  }

  @Get('student/my-club-schedule')
  @UseGuards(JwtAuthGuard)
  async getMyClubSchedule(@Req() req: any, @Query() filters: any) {
    const studentProfileId = req.user.studentProfileId;
    if (!studentProfileId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    // For now, return empty array - club schedules would need to be implemented
    return { message: 'Club schedule feature to be implemented', data: [] };
  }

  @Get('student/my-club-attendance')
  @UseGuards(JwtAuthGuard)
  async getMyClubAttendance(@Req() req: any, @Query() filters: any) {
    const studentProfileId = req.user.studentProfileId;
    if (!studentProfileId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    // Return attendance for all student's clubs  
    const memberships = await this.clubService.getStudentMemberships(studentProfileId);
    const attendanceData = [];
    for (const membership of memberships) {
      const attendance = await this.clubService.getStudentAttendance(membership.clubId.toString(), studentProfileId);
      attendanceData.push({ clubId: membership.clubId, attendance });
    }
    return attendanceData;
  }

  // ==================== PARENT NOTIFICATIONS ====================

  @Post(':clubId/notify-absence')
  @UseGuards(JwtAuthGuard)
  async notifyParentsOfAbsence(
    @Param('clubId') clubId: string,
    @Body() notificationData: { studentId: string; date: string },
    @Req() req: any
  ) {
    const notifiedBy = req.user._id.toString();
    return this.clubService.notifyParentsOfAbsence(
      clubId,
      notificationData.studentId,
      new Date(notificationData.date),
      notifiedBy
    );
  }

  @Post(':clubId/announcements/:announcementId/notify')
  @UseGuards(JwtAuthGuard)
  async notifyMembersOfAnnouncement(
    @Param('clubId') clubId: string,
    @Param('announcementId') announcementId: string,
    @Req() req: any
  ) {
    const notifiedBy = req.user._id.toString();
    return this.clubService.notifyMembersOfAnnouncement(clubId, announcementId, notifiedBy);
  }

  @Get('export')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async exportClubReport(@Query() query: any, @Req() req: any) {
    const schoolId = req.user.role === UserRole.SUPER_ADMIN ? query.schoolId : req.user.schoolId;
    const { format = 'csv', type = 'summary' } = query;
    
    return this.clubService.exportClubReport(schoolId, { format, type });
  }

  // ==================== CLUB TYPES MANAGEMENT ====================
  @Get('types')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getClubTypes(@Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.clubService.getClubTypes(schoolId);
  }

  @Post('types')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async createClubType(@Body() body: { name: string; description?: string }, @Req() req: any) {
    const schoolId = req.user.schoolId;
    const createdBy = req.user.userId || req.user._id;
    return this.clubService.createClubType(schoolId, body.name, body.description || '', createdBy.toString());
  }

  @Patch('types/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async updateClubType(@Param('id') id: string, @Body() body: { name?: string; description?: string; isActive?: boolean }, @Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.clubService.updateClubType(id, schoolId, body);
  }

  @Delete('types/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async deleteClubType(@Param('id') id: string, @Req() req: any) {
    const schoolId = req.user.schoolId;
    await this.clubService.deleteClubType(id, schoolId);
    return { message: 'Club type deleted successfully' };
  }

  // ==================== STUDENT ROLES MANAGEMENT ====================
  @Get('student-roles')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getStudentRoles(@Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.clubService.getStudentRoles(schoolId);
  }

  @Post('student-roles')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async createStudentRole(@Body() body: { name: string; description?: string }, @Req() req: any) {
    const schoolId = req.user.schoolId;
    const createdBy = req.user.userId || req.user._id;
    return this.clubService.createStudentRole(schoolId, body.name, body.description || '', createdBy.toString());
  }

  @Patch('student-roles/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async updateStudentRole(@Param('id') id: string, @Body() body: { name?: string; description?: string; isActive?: boolean }, @Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.clubService.updateStudentRole(id, schoolId, body);
  }

  @Delete('student-roles/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async deleteStudentRole(@Param('id') id: string, @Req() req: any) {
    const schoolId = req.user.schoolId;
    await this.clubService.deleteStudentRole(id, schoolId);
    return { message: 'Student role deleted successfully' };
  }
}
