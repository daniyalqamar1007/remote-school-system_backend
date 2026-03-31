import { Controller, Get, Post, Body, Param, UseGuards, HttpException, HttpStatus, Req, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { ClubService } from '../club/club.service';
import { Types } from 'mongoose';

@Controller('student/clubs')
export class StudentClubController {
  constructor(private readonly clubService: ClubService) {}

  /**
   * Helper method to extract ObjectId string from clubId
   * Handles both populated objects and ObjectId instances
   */
  private extractClubId(clubId: any): string | null {
    if (!clubId) {
      console.warn('[extractClubId] No clubId provided');
      return null;
    }
    
    // If it's already a valid string ObjectId
    if (typeof clubId === 'string' && Types.ObjectId.isValid(clubId)) {
      return clubId;
    }
    
    // If it's an ObjectId instance, convert to string
    if (Types.ObjectId.isValid(clubId)) {
      return String(clubId);
    }
    
    // If it's a populated object (Mongoose document or plain object)
    if (typeof clubId === 'object') {
      // Try _id first (for populated objects) - THIS IS THE KEY
      if (clubId._id) {
        const id = clubId._id;
        // Handle ObjectId instance
        if (Types.ObjectId.isValid(id)) {
          return String(id);
        }
        // Handle string
        if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
          return id;
        }
      }
      
      // If object has id property (some formats)
      if (clubId.id) {
        const id = clubId.id;
        if (Types.ObjectId.isValid(id)) {
          return String(id);
        }
        if (typeof id === 'string' && Types.ObjectId.isValid(id)) {
          return id;
        }
      }
      
      // Try toString if it's an ObjectId instance wrapped in object
      try {
        if (clubId.toString && typeof clubId.toString === 'function') {
          const idStr = String(clubId);
          if (Types.ObjectId.isValid(idStr)) {
            return idStr;
          }
        }
      } catch (e) {
        // Ignore
      }
    }
    
    // If it's a string that might be stringified JSON, try to parse
    if (typeof clubId === 'string') {
      try {
        // Try to parse as JSON (in case it was stringified)
        const parsed = JSON.parse(clubId);
        if (parsed && parsed._id) {
          return this.extractClubId(parsed._id);
        }
      } catch (e) {
        // Not JSON, continue
      }
    }
    
    console.warn('[extractClubId] Could not extract valid ObjectId from:', {
      clubIdType: typeof clubId,
      has_id: clubId?._id,
      hasId: clubId?.id,
      _idType: typeof clubId?._id,
      _idValue: clubId?._id
    });
    
    return null;
  }

  @Get('my-clubs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getMyClubs(@Req() req: any, @Query('studentId') studentIdParam?: string) {
    // For students, the user _id IS the student profile ID (unified schema)
    let studentId = req.user._id || req.user.studentProfileId;
    
    // If user is a parent and studentId is provided in query, use that
    if (req.user.role === UserRole.PARENT && studentIdParam) {
      studentId = studentIdParam;
    }
    
    if (!studentId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    
    try {
      // Return memberships with populated clubId as expected by the frontend
      const memberships = await this.clubService.getStudentMemberships(studentId);
      const schoolId = req.user.schoolId;

      // Map fields to match frontend expectations (status and meetingSchedule legacy fields)
      const enriched = await Promise.all(memberships.map(async (m: any) => {
        const obj = m.toObject ? m.toObject() : m;
        const club = obj.clubId || obj.club;
        // Fetch club details to get accurate memberCount
        let memberCount = 0;
        try {
          const details = await this.clubService.findOneWithDetails((club as any)._id?.toString?.() || String(club), schoolId);
          memberCount = details?.memberCount ?? 0;
          // Ensure memberCount is always a valid number
          if (typeof memberCount !== 'number' || isNaN(memberCount)) {
            memberCount = 0;
          }
        } catch {
          memberCount = 0;
        }

        const meetingSchedule = club?.meetingSchedule || {};
        // Provide legacy fields day/time if not present
        const legacySchedule = {
          day: meetingSchedule.day || (Array.isArray(meetingSchedule.days) ? meetingSchedule.days[0] : undefined),
          time: meetingSchedule.time || meetingSchedule.startTime,
          frequency: meetingSchedule.frequency
        };

        return {
          ...obj,
          status: obj.status === 'approved' ? 'active' : obj.status, // map approved -> active for UI badges
          clubId: {
            ...club,
            description: club?.description || '', // Ensure description is included
            meetingSchedule: { ...legacySchedule },
            memberCount: memberCount ?? 0 // Ensure memberCount is always a number
          }
        };
      }));

      return enriched;
    } catch (error) {
      console.error('Error fetching student clubs:', error);
      throw new HttpException('Failed to fetch clubs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getAvailableClubs(@Req() req: any, @Query() filters: any) {
    // Check if user is authenticated
    if (!req.user) {
      throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    // For students, the user _id IS the student profile ID (unified schema)
    const studentId = req.user._id || req.user.studentProfileId;
    const schoolId = req.user?.schoolId;
    
    if (!studentId || !schoolId) {
      throw new HttpException('Student or school information not found', HttpStatus.NOT_FOUND);
    }
    
    try {
      // Get all active clubs for the school enriched with stats
      // findAll now returns { clubs: Club[], total: number, page: number, totalPages: number }
      const allClubsResult = await this.clubService.findAll(schoolId, { isActive: true }, 1, 1000);
      const allClubs = allClubsResult.clubs || [];

      // Get student's memberships and requests to exclude those clubs
      const approvedMemberships = await this.clubService.getStudentMemberships(studentId);
      const allRequests = await this.clubService.getStudentMembershipRequests(studentId);
      
      // Safely extract club IDs from memberships and requests
      const extractClubId = (membership: any): string | null => {
        if (!membership || !membership.clubId) {
          return null;
        }
        
        const clubId = membership.clubId;
        
        // If it's an object with _id
        if (typeof clubId === 'object' && clubId._id) {
          return clubId._id.toString();
        }
        
        // If it's already a string
        if (typeof clubId === 'string' && Types.ObjectId.isValid(clubId)) {
          return clubId;
        }
        
        // Try toString if it's an ObjectId instance
        if (clubId && typeof clubId.toString === 'function') {
          const idStr = clubId.toString();
          if (Types.ObjectId.isValid(idStr)) {
            return idStr;
          }
        }
        
        return null;
      };
      
      const excludedClubIds = new Set<string>([
        ...approvedMemberships.map(extractClubId).filter(Boolean) as string[],
        ...allRequests.map(extractClubId).filter(Boolean) as string[],
      ]);

      // Filter out clubs student is already involved with (approved/pending/rejected) and ensure active
      let availableClubs = allClubs.filter((club: any) => 
        !excludedClubIds.has(club._id.toString()) && club.isActive !== false
      );

      // Apply optional filters
      if (filters?.type && filters.type !== 'all') {
        availableClubs = availableClubs.filter((club: any) => club.type === filters.type);
      }
      if (filters?.search) {
        const term = String(filters.search).toLowerCase();
        availableClubs = availableClubs.filter((club: any) => 
          club.name.toLowerCase().includes(term) ||
          (club.description?.toLowerCase?.().includes(term))
        );
      }

      // Add computed helper fields for the frontend
      return availableClubs.map((club: any) => {
        const memberCount = club.memberCount ?? 0;
        // Ensure memberCount is always a valid number
        const validMemberCount = (typeof memberCount === 'number' && !isNaN(memberCount)) ? memberCount : 0;
        
        return {
          ...club,
          memberCount: validMemberCount,
          canJoin: !club.maxMembers || validMemberCount < club.maxMembers,
          spotsRemaining: club.maxMembers ? Math.max(club.maxMembers - validMemberCount, 0) : null
        };
      });
    } catch (error) {
      console.error('Error fetching available clubs:', error);
      throw new HttpException('Failed to fetch available clubs', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('request-membership')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async requestMembership(@Req() req: any, @Body() membershipData: any) {
    // Check if user is authenticated
    if (!req.user) {
      throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    console.log('Membership request received:', { membershipData, user: req.user });
    
    // For students, the user _id IS the student profile ID (unified schema)
    const studentId = req.user._id || req.user.studentProfileId;
    
    if (!studentId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    
    if (!membershipData.clubId) {
      throw new HttpException('Club ID is required', HttpStatus.BAD_REQUEST);
    }
    
    try {
      // Check if student is already a member or has pending request
      const existingMemberships = await this.clubService.getStudentMemberships(studentId);
      const existingMembership = existingMemberships.find((m: any) => {
        const clubId = (m.clubId && (m.clubId as any)._id) ? (m.clubId as any)._id.toString() : m.clubId?.toString?.();
        return clubId === membershipData.clubId;
      });
      
      if (existingMembership) {
        throw new HttpException('You are already a member of this club or have a pending request', HttpStatus.CONFLICT);
      }
      
      // Check if club exists and is active
      console.log('Finding club:', { clubId: membershipData.clubId, schoolId: req.user.schoolId });
      let club;
      try {
        club = await this.clubService.findOneWithDetails(membershipData.clubId, req.user.schoolId);
        console.log('Club found:', { clubId: club?._id, clubName: club?.name, isActive: club?.isActive });
      } catch (error) {
        console.error('Error finding club:', error);
        throw new HttpException('Club not found or not accessible from your school', HttpStatus.NOT_FOUND);
      }
      
      const clubObj = (club as any);
      if (clubObj.isActive === false) {
        throw new HttpException('Club is currently inactive', HttpStatus.CONFLICT);
      }
      
      // Check if club has capacity
      if (clubObj.maxMembers && (clubObj.memberCount || 0) >= clubObj.maxMembers) {
        throw new HttpException('Club has reached maximum capacity', HttpStatus.CONFLICT);
      }
      
      // Basic eligibility check - ensure student is from the same school
      if (req.user.schoolId && clubObj.schoolId && req.user.schoolId.toString() !== clubObj.schoolId.toString()) {
        throw new HttpException('You are not eligible to join clubs from other schools', HttpStatus.FORBIDDEN);
      }
      
      // Create membership request
      const membershipRequest = await this.clubService.requestMembership(
        membershipData.clubId,
        studentId,
        'Member'
      );
      
      console.log('Membership request created successfully:', membershipRequest);
      
      return {
        message: club.requiresApproval 
          ? 'Membership request submitted for approval' 
          : 'You have been added to the club',
        membership: membershipRequest,
        requiresApproval: club.requiresApproval
      };
    } catch (error) {
      console.error('Error requesting membership:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to request membership', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getMyMembershipRequests(@Req() req: any) {
    // Check if user is authenticated
    if (!req.user) {
      throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    // For students, the user _id IS the student profile ID (unified schema)
    const studentId = req.user._id || req.user.studentProfileId;
    
    if (!studentId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    
    try {
      // Get all membership requests for this student
      const requests = await this.clubService.getStudentMembershipRequests(studentId);
      
      return requests;
    } catch (error) {
      console.error('Error fetching membership requests:', error);
      throw new HttpException('Failed to fetch membership requests', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getMyClubSchedule(@Req() req: any, @Query() filters: any) {
    // Check if user is authenticated
    if (!req.user) {
      throw new HttpException('User not authenticated', HttpStatus.UNAUTHORIZED);
    }
    
    // For students, the user _id IS the student profile ID (unified schema)
    const studentId = req.user._id || req.user.studentProfileId;
    
    if (!studentId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    
    try {
      const memberships = await this.clubService.getStudentMemberships(studentId);
      const scheduleData = [];
      
      for (const membership of memberships) {
        const club = await this.clubService.findOne(membership.clubId.toString());
        if (club) {
          const clubObj = (club as any);
          if (clubObj.meetingSchedule) {
            scheduleData.push({
              clubId: clubObj._id,
              clubName: clubObj.name,
              schedule: clubObj.meetingSchedule,
              location: clubObj.location,
              nextMeeting: this.calculateNextMeeting(clubObj.meetingSchedule)
            });
          }
        }
      }
      
      return scheduleData;
    } catch (error) {
      console.error('Error fetching club schedule:', error);
      throw new HttpException('Failed to fetch club schedule', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getStudentClubEvents(@Req() req: any, @Query('studentId') studentIdParam?: string, @Query() query: any = {}) {
    // Get student ID
    let studentId = req.user._id || req.user.studentProfileId;
    
    // If user is a parent and studentId is provided in query, use that
    if (req.user.role === UserRole.PARENT && studentIdParam) {
      studentId = studentIdParam;
    }
    
    if (!studentId) {
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }

    try {
      // Get student's club memberships
      const memberships = await this.clubService.getStudentMemberships(studentId);
      
      if (!memberships || memberships.length === 0) {
        return {
          events: [],
          total: 0,
          page: 1,
          totalPages: 1
        };
      }

      // Extract club IDs from memberships
      const clubIds = memberships.map((m: any) => {
        const clubId = m.clubId;
        if (clubId && typeof clubId === 'object' && clubId._id) {
          return clubId._id.toString();
        }
        if (typeof clubId === 'string') {
          return clubId;
        }
        return null;
      }).filter(Boolean);

      if (clubIds.length === 0) {
        return {
          events: [],
          total: 0,
          page: 1,
          totalPages: 1
        };
      }

      // Get school ID from the first club (all clubs should be from same school)
      const firstMembership = memberships[0] as any;
      let schoolId: string | undefined;
      
      if (firstMembership.clubId && typeof firstMembership.clubId === 'object') {
        schoolId = firstMembership.clubId.schoolId?.toString() || 
                   (firstMembership.clubId.schoolId as any)?._id?.toString();
      }

      // Build query to filter events by club IDs
      const eventQuery = {
        ...query,
        clubIds: clubIds.join(',') // Pass club IDs as comma-separated string
      };

      // Get events for student's clubs - the service will filter by clubIds
      const result = await this.clubService.getSchoolEvents(schoolId, eventQuery);
      
      // Double-check filtering (in case clubIds filter didn't work)
      if (result.events && Array.isArray(result.events)) {
        result.events = result.events.filter((event: any) => {
          if (!event.clubId) return false;
          
          const eventClubId = event.clubId?._id?.toString() || 
                             (event.clubId as any)?._id?.toString() ||
                             event.clubId?.toString();
          
          if (!eventClubId) return false;
          
          return clubIds.some((clubId: string) => clubId.toString() === eventClubId.toString());
        });
        
        // Update total count after filtering
        result.total = result.events.length;
        const limit = parseInt(query.limit) || 10;
        result.totalPages = Math.ceil(result.total / limit);
      }

      return result;
    } catch (error) {
      console.error('Error fetching student club events:', error);
      throw new HttpException('Failed to fetch club events', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getMyClubAttendance(@Req() req: any, @Query() filters: any, @Query('studentId') studentIdParam?: string) {
    // In clubattendances collection, studentId is the User _id (where role is STUDENT)
    // So we use req.user._id which is the authenticated User's _id
    let studentId = req.user._id || req.user.studentProfileId || req.user.id;
    
    // If user is a parent and studentId is provided in query, use that
    if (req.user.role === UserRole.PARENT && studentIdParam) {
      studentId = studentIdParam;
    }
    
    // Ensure studentId is a string
    if (studentId && typeof studentId === 'object' && studentId.toString) {
      studentId = studentId.toString();
    } else if (studentId) {
      studentId = String(studentId);
    }
    
    if (!studentId) {
      console.error('[getMyClubAttendance] Student ID (User _id) not found in request:', {
        _id: req.user._id,
        studentProfileId: req.user.studentProfileId,
        id: req.user.id,
        user: req.user
      });
      throw new HttpException('Student profile not found', HttpStatus.NOT_FOUND);
    }
    
    console.log(`[getMyClubAttendance] Fetching attendance from clubattendances collection`);
    console.log(`[getMyClubAttendance] Using studentId (User _id): ${studentId}`);
    console.log(`[getMyClubAttendance] User info:`, {
      _id: req.user._id?.toString(),
      email: req.user.email,
      role: req.user.role
    });
    
    try {
      const memberships = await this.clubService.getStudentMemberships(studentId);
      console.log(`[getMyClubAttendance] Found ${memberships?.length || 0} memberships for student`);
      
      if (!memberships || memberships.length === 0) {
        console.warn(`[getMyClubAttendance] No memberships found for studentId: ${studentId}`);
        return [];
      }
      
      const attendanceData = [];
      
      for (const membership of memberships) {
        const membershipObj = membership as any;
        
        // Get club info first - check if already populated
        let club: any = null;
        let clubId: string | null = null;
        
        // ALWAYS extract clubId first, regardless of whether it's populated
        // Handle populated object directly - it has _id property
        let extractedClubId: string | null = null;
        
        if (membershipObj.clubId) {
          // If it's a populated object with _id
          if (typeof membershipObj.clubId === 'object' && membershipObj.clubId._id) {
            const idValue = membershipObj.clubId._id;
            if (Types.ObjectId.isValid(idValue)) {
              extractedClubId = String(idValue);
            } else if (typeof idValue === 'string' && Types.ObjectId.isValid(idValue)) {
              extractedClubId = idValue;
            }
          } else {
            // Try extractClubId helper
            extractedClubId = this.extractClubId(membershipObj.clubId);
          }
        }
        
        if (!extractedClubId || typeof extractedClubId !== 'string') {
          console.error('[getMyClubAttendance] Skipping membership - could not extract valid clubId string:', {
            membershipId: membershipObj._id,
            extractedClubId: extractedClubId,
            extractedType: typeof extractedClubId,
            clubIdRaw: membershipObj.clubId,
            clubIdType: typeof membershipObj.clubId,
            has_id: membershipObj.clubId?._id,
            _idType: typeof membershipObj.clubId?._id,
            _idValue: membershipObj.clubId?._id?.toString()
          });
          continue;
        }
        
        // Use the extracted string ID - ensure it's definitely a string
        clubId = String(extractedClubId);
        
        // Validate it's a valid ObjectId string
        if (!Types.ObjectId.isValid(clubId)) {
          console.error(`[getMyClubAttendance] Extracted clubId is not a valid ObjectId: ${clubId}`);
          continue;
        }
        
        // Now get club info
        if (membershipObj.clubId && typeof membershipObj.clubId === 'object' && membershipObj.clubId.name) {
          // Already populated, use it directly
          club = membershipObj.clubId;
        } else {
          // Need to fetch club
          try {
            club = await this.clubService.findOne(clubId);
          } catch (error) {
            console.error(`[getMyClubAttendance] Error fetching club ${clubId}:`, error);
            // Continue - we'll use membership data if available
          }
        }
        
        const clubName = club?.name || membershipObj.clubId?.name || 'Unknown Club';
        console.log(`[getMyClubAttendance] Processing clubId (string): ${clubId}, clubName: ${clubName}`);
        
        // Fetch attendance - clubId is now guaranteed to be a string
        let attendance: any[] = [];
        try {
          // Validate clubId is a string before passing
          if (typeof clubId !== 'string') {
            console.error(`[getMyClubAttendance] ERROR: clubId is not a string! Type: ${typeof clubId}, Value:`, clubId);
            throw new Error(`Invalid clubId type: ${typeof clubId}`);
          }
          
          console.log(`[getMyClubAttendance] Fetching attendance for clubId: ${clubId} (type: ${typeof clubId}), studentId: ${studentId} (type: ${typeof studentId})`);
          attendance = await this.clubService.getStudentAttendance(clubId, studentId) || [];
          console.log(`[getMyClubAttendance] Received ${attendance?.length || 0} attendance records`);
          if (attendance && attendance.length > 0) {
            console.log(`[getMyClubAttendance] Sample attendance:`, {
              status: attendance[0].status,
              meetingDate: attendance[0].meetingDate
            });
          }
        } catch (error) {
          console.error(`[getMyClubAttendance] Error fetching attendance for club ${clubId}, student ${studentId}:`, error);
          attendance = [];
        }
        
        const totalMeetings = attendance?.length || 0;
        const presentMeetings = attendance?.filter((a: any) => a?.status === 'present' || a?.status === 'Present').length || 0;
        
        console.log(`[getMyClubAttendance] Club: ${clubName}, Total Meetings: ${totalMeetings}, Present: ${presentMeetings}`);
        
        attendanceData.push({
          clubId: clubId,
          clubName: clubName,
          attendance: attendance || [],
          attendanceRate: membershipObj.attendanceRate || 0,
          totalMeetings: totalMeetings,
          presentMeetings: presentMeetings
        });
      }
      
      console.log(`[getMyClubAttendance] Returning ${attendanceData.length} clubs with attendance data`);
      return attendanceData;
    } catch (error) {
      console.error('Error fetching club attendance:', error);
      throw new HttpException('Failed to fetch club attendance', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private calculateNextMeeting(meetingSchedule: any): Date | null {
    // Support both legacy { day, time } and current { days[], startTime }
    if (!meetingSchedule) {
      return null;
    }
    
    try {
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = meetingSchedule.day || (Array.isArray(meetingSchedule.days) && meetingSchedule.days[0]);
      const time = meetingSchedule.time || meetingSchedule.startTime;
      if (!day || !time) return null;
      const targetDay = daysOfWeek.indexOf(day);
      
      if (targetDay === -1) return null;
      
      const today = new Date();
      const currentDay = today.getDay();
      
      let daysUntilMeeting = targetDay - currentDay;
      if (daysUntilMeeting <= 0) {
        daysUntilMeeting += 7; // Next week
      }
      
      const nextMeeting = new Date(today);
      nextMeeting.setDate(today.getDate() + daysUntilMeeting);
      
      // Set the time
      const [hours, minutes] = time.split(':');
      nextMeeting.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      return nextMeeting;
    } catch (error) {
      console.error('Error calculating next meeting:', error);
      return null;
    }
  }
}