import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Req } from '@nestjs/common';
import { SecretaryService } from './secretary.service';
import { ClubService } from '../club/club.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('secretary')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SecretaryController {
  constructor(
    private readonly secretaryService: SecretaryService,
    private readonly clubService: ClubService
  ) {}

  // Dashboard endpoints
  @Get('dashboard/stats')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getDashboardStats(@Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.secretaryService.getDashboardStats(schoolId);
  }

  @Get('dashboard/activities')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getRecentActivities(@Query('limit') limit: string = '10', @Req() req: any) {
    const schoolId = req.user.schoolId;
    return this.secretaryService.getRecentActivities(parseInt(limit), schoolId);
  }

  @Get('dashboard/tasks')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getUpcomingTasks() {
    return this.secretaryService.getUpcomingTasks();
  }

  // Student course enrollment endpoints
  @Get('enrollments')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getPendingEnrollments() {
    return this.secretaryService.getPendingEnrollments();
  }

  @Post('enrollments/:id/approve')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async approveEnrollment(@Param('id') id: string) {
    return this.secretaryService.approveEnrollment(id);
  }

  @Post('enrollments/:id/reject')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async rejectEnrollment(@Param('id') id: string, @Body('reason') reason: string) {
    return this.secretaryService.rejectEnrollment(id, reason);
  }

  // Schedule conflict detection and resolution
  @Get('schedule/conflicts')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getScheduleConflicts() {
    return this.secretaryService.getScheduleConflicts();
  }

  @Post('schedule/conflicts/:id/resolve')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async resolveScheduleConflict(@Param('id') id: string, @Body() resolution: any) {
    return this.secretaryService.resolveScheduleConflict(id, resolution);
  }

  // Lesson plan approval workflow
  @Get('lesson-plans/pending')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getPendingLessonPlans() {
    return this.secretaryService.getPendingLessonPlans();
  }

  @Post('lesson-plans/:id/approve')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async approveLessonPlan(@Param('id') id: string, @Body('comments') comments: string) {
    return this.secretaryService.approveLessonPlan(id, comments);
  }

  @Post('lesson-plans/:id/reject')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async rejectLessonPlan(@Param('id') id: string, @Body() feedback: any) {
    return this.secretaryService.rejectLessonPlan(id, feedback);
  }

  // ===== PHASE 2: ENHANCED SCHEDULE MANAGEMENT =====

  @Get('schedule/conflicts/detailed')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getDetailedScheduleConflicts() {
    return this.secretaryService.getDetailedScheduleConflicts();
  }

  @Post('schedule/conflicts/:conflictId/resolve')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async resolveConflictWithDetails(
    @Param('conflictId') conflictId: string,
    @Body() resolutionData: { resolutionId: string; additionalData?: any }
  ) {
    return this.secretaryService.resolveConflictWithDetails(
      conflictId, 
      resolutionData.resolutionId, 
      resolutionData.additionalData
    );
  }

  // ===== PHASE 2: ENHANCED LESSON PLAN APPROVAL =====

  @Get('lesson-plans/detailed')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getDetailedLessonPlans(@Query('status') status?: string) {
    return this.secretaryService.getDetailedLessonPlans(status);
  }

  @Post('lesson-plans/:id/review')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async reviewLessonPlan(
    @Param('id') id: string,
    @Body() review: {
      status: 'approved' | 'rejected' | 'revision_required';
      comments: string[];
      suggestions?: string[];
    }
  ) {
    return this.secretaryService.reviewLessonPlan(id, review);
  }

  // ===== PHASE 2: EXCEL IMPORT/EXPORT =====

  @Post('enrollment/bulk-import')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async processBulkEnrollment(@Body() data: { csvData: any[] }) {
    return this.secretaryService.processBulkEnrollment(data.csvData);
  }

  @Get('enrollment/export')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async exportEnrollmentData(@Query() filters?: any) {
    return this.secretaryService.exportEnrollmentData(filters);
  }

  // ===== CLUB MANAGEMENT ENDPOINTS =====

  @Get('clubs')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getSchoolClubs(@Query('schoolId') schoolId: string) {
    return this.clubService.findBySchool(schoolId);
  }

  @Post('clubs')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async createClub(@Body() clubData: any) {
    return this.clubService.create(clubData);
  }

  @Patch('clubs/:id')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async updateClub(@Param('id') id: string, @Body() updateData: any) {
    return this.clubService.update(id, updateData);
  }

  @Delete('clubs/:id')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async deleteClub(@Param('id') id: string) {
    return this.clubService.remove(id);
  }

  @Get('clubs/:id/members')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getClubMembers(@Param('id') id: string, @Query('status') status?: string) {
    return this.clubService.getClubMembers(id);
  }

  @Get('clubs/:id/membership/pending')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getPendingMembershipRequests(@Param('id') id: string) {
    return this.clubService.getPendingRequests(id);
  }

  @Patch('clubs/:clubId/membership/:membershipId/approve')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async approveMembership(@Param('clubId') clubId: string, @Param('membershipId') membershipId: string, @Body() approvalData: any) {
    return this.clubService.approveMembership(membershipId, approvalData.approvedBy);
  }

  @Patch('clubs/:clubId/membership/:membershipId/reject')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async rejectMembership(@Param('clubId') clubId: string, @Param('membershipId') membershipId: string, @Body() rejectionData: any) {
    return this.clubService.rejectMembership(membershipId, rejectionData.rejectedBy, rejectionData.reason);
  }

  @Post('clubs/:id/announcements')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async createClubAnnouncement(@Param('id') id: string, @Body() announcementData: any, @Req() req: any) {
    const role = req.user.role || 'SECRETARY';
    const createdBy = req.user._id?.toString() || req.user.userId || announcementData.postedBy;
    
    console.log('\n🔵 ========== CREATING CLUB ANNOUNCEMENT (SECRETARY) ==========');
    console.log('📋 Club ID:', id);
    console.log('📋 Announcement Data:', JSON.stringify({
      title: announcementData.title,
      content: announcementData.content,
      priority: announcementData.priority,
      targetAudience: announcementData.targetAudience
    }, null, 2));
    console.log('📋 Role:', role);
    console.log('📋 Created By:', createdBy);
    
    const announcementPayload = {
      clubId: id,
      title: announcementData.title,
      content: announcementData.content,
      priority: announcementData.priority || 'medium',
      createdBy: createdBy,
      targetAudience: announcementData.targetAudience || 'members',
      // Set notifyParents to true if targetAudience includes parents or is 'both'
      notifyParents: announcementData.targetAudience === 'parents' || 
                     announcementData.targetAudience === 'both' || 
                     announcementData.targetAudience === 'parent and member' ||
                     announcementData.targetAudience === 'parents and members' ||
                     announcementData.targetAudience === 'members and parents' ||
                     announcementData.targetAudience === 'all',
      scheduledAt: announcementData.scheduledAt,
      scheduledFor: announcementData.scheduledFor,
      eventDate: announcementData.eventDate,
      schoolId: req.user.schoolId || announcementData.schoolId
    };
    
    const announcement = await this.clubService.createAnnouncement(announcementPayload, role, createdBy);
    
    console.log('✅ Secretary: Announcement created successfully with ID:', (announcement as any)._id.toString());
    
    return announcement;
  }

  @Get('clubs/:id/announcements')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getClubAnnouncements(@Param('id') id: string, @Query('priority') priority?: string) {
    return this.clubService.getClubAnnouncements(id);
  }

  @Get('clubs/:id/attendance')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getClubAttendance(@Param('id') id: string, @Query('date') date?: string) {
    if (date) {
      return this.clubService.getAttendanceByDate(id, new Date(date));
    }
    return this.clubService.getClubAttendance(id);
  }

  @Post('clubs/:id/attendance')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async markClubAttendance(@Param('id') id: string, @Body() attendanceData: any) {
    return this.clubService.markAttendance(id, attendanceData.studentId, attendanceData.date, attendanceData.status, attendanceData.markedBy);
  }

  @Get('clubs/analytics')
  @Roles(UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getClubAnalytics(@Query('schoolId') schoolId: string) {
    return this.clubService.getSchoolClubAnalytics(schoolId);
  }
}
