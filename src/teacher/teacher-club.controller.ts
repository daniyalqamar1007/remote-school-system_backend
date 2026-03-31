import { Controller, Get, Post, Body, Param, Delete, UseGuards, HttpException, HttpStatus, Req, Query, Patch } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClubService } from '../club/club.service';

@Controller('teacher/clubs')
@UseGuards(JwtAuthGuard)
export class TeacherClubController {
  constructor(private readonly clubService: ClubService) {}

  @Get('my-clubs')
  async getMyClubs(@Req() req: any) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    console.log('Teacher clubs request - user:', {
      _id: req.user._id,
      teacherProfileId: req.user.teacherProfileId,
      role: req.user.role,
      email: req.user.email
    });
    
    if (!teacherId) {
      throw new HttpException('Teacher profile not found', HttpStatus.NOT_FOUND);
    }
    
    console.log('Searching for clubs with teacherId:', teacherId.toString());
    
    try {
      const clubs = await this.clubService.findByAdvisor(teacherId.toString());
      
      console.log('Found clubs count:', clubs.length);
      
      // Transform data for frontend compatibility
      const transformedClubs = clubs.map(club => {
        const clubObj = (club as any).toObject ? (club as any).toObject() : club;
        return {
          ...clubObj,
          memberCount: clubObj.memberCount || 0,
          pendingRequestsCount: 0, // Will be populated separately
          lastActivity: clubObj.updatedAt || clubObj.createdAt,
          attendanceRate: clubObj.attendanceRate || 0,
          participationRate: clubObj.participationRate || 0
        };
      });
      
      // Get pending requests count for each club
      for (const club of transformedClubs) {
        try {
          const pendingRequests = await this.clubService.getPendingRequests(club._id.toString());
          club.pendingRequestsCount = pendingRequests.length;
        } catch (error) {
          console.error(`Error fetching pending requests for club ${club._id}:`, error);
          club.pendingRequestsCount = 0;
        }
      }
      
      return transformedClubs;
    } catch (error) {
      console.error('Error fetching teacher clubs:', error);
      throw new HttpException('Failed to fetch clubs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clubId/members')
  async getClubMembers(@Param('clubId') clubId: string, @Req() req: any, @Query('search') search?: string) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to view this club', HttpStatus.FORBIDDEN);
      }
      
      const filters: any = {};
      if (search) {
        filters.search = search;
      }
      
      const members = await this.clubService.getClubMembers(clubId, filters);
      
      // Transform data for frontend compatibility
      const transformedMembers = members.map(member => {
        const memberObj = (member as any);
        const student = memberObj.studentId;
        return {
          _id: student._id || student,
          firstName: student.firstName || '',
          lastName: student.lastName || '',
          email: student.email || '',
          studentId: student.studentId || '',
          grade: student.grade || student.gradeLevel || '',
          profilePicture: student.profilePicture || '',
          role: memberObj.role,
          status: memberObj.status,
          joinedAt: memberObj.joinedDate || memberObj.joinedAt,
          attendanceRate: memberObj.attendanceRate || 0,
          lastAttendance: memberObj.lastAttendance,
          participationLevel: memberObj.participationLevel || 'active',
          membershipId: memberObj._id
        };
      });
      
      return transformedMembers;
    } catch (error) {
      console.error('Error fetching club members:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to fetch club members', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clubId/requests')
  async getClubMembershipRequests(@Param('clubId') clubId: string, @Req() req: any) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to view this club', HttpStatus.FORBIDDEN);
      }
      
      const requests = await this.clubService.getPendingRequests(clubId);
      
      return requests;
    } catch (error) {
      console.error('Error fetching membership requests:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to fetch membership requests', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('requests/:requestId/approve')
  async approveMembershipRequest(@Param('requestId') requestId: string, @Req() req: any) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      const result = await this.clubService.approveMembership(requestId, teacherId.toString());
      
      return {
        message: 'Membership request approved successfully',
        membership: result
      };
    } catch (error) {
      console.error('Error approving membership request:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to approve membership request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('requests/:requestId/reject')
  async rejectMembershipRequest(
    @Param('requestId') requestId: string, 
    @Body() rejectionData: any,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      const result = await this.clubService.rejectMembership(
        requestId, 
        teacherId.toString(),
        rejectionData.reason || 'No reason provided'
      );
      
      return {
        message: 'Membership request rejected',
        membership: result
      };
    } catch (error) {
      console.error('Error rejecting membership request:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to reject membership request', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':clubId/members/:studentId')
  async removeMember(
    @Param('clubId') clubId: string,
    @Param('studentId') studentId: string,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to manage this club', HttpStatus.FORBIDDEN);
      }
      
      // Find the membership directly using the club service method
      const membership = await this.clubService.findMembershipByClubAndStudent(clubId, studentId);
      
      if (!membership) {
        throw new HttpException('Student is not a member of this club', HttpStatus.NOT_FOUND);
      }
      
      const result = await this.clubService.removeMembership((membership as any)._id.toString());
      
      return {
        message: 'Member removed successfully',
        removedMembership: result
      };
    } catch (error) {
      console.error('Error removing member:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to remove member', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clubId/announcements')
  async getClubAnnouncements(@Param('clubId') clubId: string, @Req() req: any) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to view this club', HttpStatus.FORBIDDEN);
      }
      
      const announcements = await this.clubService.getClubAnnouncements(clubId);
      
      // Normalize announcements for frontend
      const normalizedAnnouncements = announcements.map((ann: any) => {
        const annObj = ann.toObject ? ann.toObject() : ann;
        return {
          ...annObj,
          _id: annObj._id?.toString() || annObj._id, // Ensure _id is a string
          message: annObj.message || annObj.content || '',
          priority: annObj.priority || annObj.type || 'medium',
          targetAudience: annObj.targetAudience || 'members',
          scheduledFor: annObj.scheduledFor || annObj.eventDate || null
        };
      });
      
      return normalizedAnnouncements;
    } catch (error) {
      console.error('Error fetching announcements:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to fetch announcements', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch(':clubId/announcements/:announcementId')
  async updateAnnouncement(
    @Param('clubId') clubId: string,
    @Param('announcementId') announcementId: string,
    @Body() announcementData: any,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to manage this club', HttpStatus.FORBIDDEN);
      }
      
      const updateData = {
        title: announcementData.title,
        content: announcementData.content || announcementData.message,
        message: announcementData.message || announcementData.content,
        priority: announcementData.priority || 'medium',
        targetAudience: announcementData.targetAudience || 'members',
        scheduledAt: announcementData.scheduledAt || announcementData.scheduledFor ? new Date(announcementData.scheduledAt || announcementData.scheduledFor) : undefined,
      };
      
      const announcement = await this.clubService.updateAnnouncement(
        announcementId,
        updateData,
        (club as any).schoolId?.toString(),
        'TEACHER',
        teacherId.toString()
      );
      
      return {
        message: 'Announcement updated successfully',
        announcement
      };
    } catch (error) {
      console.error('Error updating announcement:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update announcement', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':clubId/announcements/:announcementId')
  async deleteAnnouncement(
    @Param('clubId') clubId: string,
    @Param('announcementId') announcementId: string,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to manage this club', HttpStatus.FORBIDDEN);
      }
      
      const result = await this.clubService.deleteAnnouncement(
        announcementId,
        (club as any).schoolId?.toString(),
        'TEACHER',
        teacherId.toString()
      );
      
      return result;
    } catch (error) {
      console.error('Error deleting announcement:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to delete announcement', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':clubId/announcements')
  async createAnnouncement(
    @Param('clubId') clubId: string,
    @Body() announcementData: any,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    const role = req.user.role;
    
    try {
      console.log('Creating announcement:', announcementData);
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to manage this club', HttpStatus.FORBIDDEN);
      }
      
      const announcementPayload = {
        clubId,
        schoolId: (club as any).schoolId, // Add schoolId from the club
        title: announcementData.title,
        content: announcementData.content || announcementData.message, // Support both content and message fields
        priority: announcementData.priority || 'medium',
        targetAudience: announcementData.targetAudience || 'members',
        scheduledAt: announcementData.scheduledAt || announcementData.scheduledFor ? new Date(announcementData.scheduledAt || announcementData.scheduledFor) : undefined,
        createdBy: teacherId.toString()
      };
      
      const announcement = await this.clubService.createAnnouncement(announcementPayload, role, teacherId);
      
      // Send email notifications to parents/students of club members (if not scheduled for later)
      const isScheduled = announcementData.scheduledAt || announcementData.scheduledFor || (announcement as any).scheduledAt || (announcement as any).scheduledFor;
      
      if (!isScheduled) {
        console.log('\n📧 ========== TRIGGERING EMAIL NOTIFICATION FOR ANNOUNCEMENT (TEACHER) ==========');
        console.log(`📋 Announcement ID: ${(announcement as any)._id.toString()}`);
        console.log(`📋 Club ID: ${clubId}`);
        console.log(`📋 Scheduled: ${isScheduled ? 'YES (will not send now)' : 'NO (sending now)'}`);
        
        try {
          const notificationResult = await this.clubService.notifyMembersOfAnnouncement(
            clubId,
            (announcement as any)._id.toString(),
            teacherId.toString()
          );
          console.log('✅ Email notification result:', notificationResult);
        } catch (notificationError) {
          console.error('❌ Error sending announcement notifications:', notificationError);
          console.error('❌ Error details:', notificationError?.message);
          console.error('❌ Error stack:', notificationError?.stack);
          // Don't fail the announcement creation if notification fails
        }
      } else {
        console.log('⏰ Announcement is scheduled for later. Emails will not be sent now.');
      }
      
      return {
        message: announcementData.scheduledAt 
          ? 'Announcement scheduled successfully' 
          : 'Announcement created and sent successfully',
        announcement
      };
    } catch (error) {
      console.error('Error creating announcement:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to create announcement', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clubId/attendance')
  async getClubAttendance(
    @Param('clubId') clubId: string,
    @Query() filters: any,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to view this club', HttpStatus.FORBIDDEN);
      }
      
      let attendance;
      
      if (filters.date) {
        attendance = await this.clubService.getAttendanceByDate(clubId, new Date(filters.date));
      } else if (filters.studentId) {
        attendance = await this.clubService.getStudentAttendance(clubId, filters.studentId);
      } else {
        attendance = await this.clubService.getClubAttendance(clubId);
      }
      
      return attendance;
    } catch (error) {
      console.error('Error fetching club attendance:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to fetch club attendance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post(':clubId/attendance')
  async markAttendance(
    @Param('clubId') clubId: string,
    @Body() attendanceData: any,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to manage this club', HttpStatus.FORBIDDEN);
      }
      
      const attendance = await this.clubService.markAttendance(
        clubId,
        attendanceData.studentId,
        attendanceData.date || new Date().toISOString(),
        attendanceData.status || 'present',
        teacherId.toString()
      );
      
      // If student is absent, optionally notify parents
      if (attendanceData.status === 'absent' && attendanceData.notifyParents) {
        try {
          await this.clubService.notifyParentsOfAbsence(
            clubId,
            attendanceData.studentId,
            attendanceData.date ? new Date(attendanceData.date) : new Date(),
            teacherId.toString()
          );
        } catch (notificationError) {
          console.error('Error notifying parents of absence:', notificationError);
          // Don't fail the attendance marking if notification fails
        }
      }
      
      return {
        message: 'Attendance marked successfully',
        attendance
      };
    } catch (error) {
      console.error('Error marking attendance:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to mark attendance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clubId/reports/participation')
  async getParticipationReport(
    @Param('clubId') clubId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    if (!startDate || !endDate) {
      throw new HttpException('Start date and end date are required', HttpStatus.BAD_REQUEST);
    }
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to view this club', HttpStatus.FORBIDDEN);
      }
      
      const report = await this.clubService.getParticipationReport(
        clubId,
        new Date(startDate),
        new Date(endDate)
      );
      
      return report;
    } catch (error) {
      console.error('Error generating participation report:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to generate participation report', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get(':clubId/reports/export')
  async exportClubReport(
    @Param('clubId') clubId: string,
    @Query('format') format: string = 'csv',
    @Query('type') type: string = 'general',
    @Req() req: any
  ) {
    const teacherId = req.user._id || req.user.teacherProfileId;
    
    try {
      // Verify teacher is advisor of this club
      const club = await this.clubService.findOne(clubId);
      if (!club) {
        throw new HttpException('Club not found', HttpStatus.NOT_FOUND);
      }
      
      // Handle both populated and unpopulated advisorId
      const advisorId = (club.advisorId as any)?._id ? (club.advisorId as any)._id.toString() : club.advisorId.toString();
      if (advisorId !== teacherId.toString()) {
        throw new HttpException('You are not authorized to view this club', HttpStatus.FORBIDDEN);
      }
      
      // Generate report for this specific club
      const result = await this.clubService.exportClubReport((club as any).schoolId, { format, type });
      
      // Filter to only include the current club
      if (result.data && Array.isArray(result.data)) {
        result.data = result.data.filter((clubData: any) => clubData.clubName === club.name);
      }
      
      return result;
    } catch (error) {
      console.error('Error exporting club report:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to export club report', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}