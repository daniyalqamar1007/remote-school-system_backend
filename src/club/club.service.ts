import { Injectable, NotFoundException, BadRequestException, ForbiddenException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Club, ClubDocument } from './schema/club.schema';
import { ClubMembership, ClubMembershipDocument } from './schema/club-membership.schema';
import { ClubAttendance, ClubAttendanceDocument } from './schema/club-attendance.schema';
import { ClubAnnouncement, ClubAnnouncementDocument } from './schema/club-announcement.schema';
import { ClubEvent, ClubEventDocument } from './schema/club-event.schema';
import { ClubType, ClubTypeDocument } from './schema/club-type.schema';
import { StudentRole, StudentRoleDocument } from './schema/student-role.schema';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { EmailService } from '../email/email.service';
import { CalendarService } from '../calendar/calendar.service';
import { Activity } from 'src/activity/schema/schema.activity';
import { CourseAssignment, CourseAssignmentDocument } from '../course/schema/course-assignment.schema';
import { Schedule, ScheduleDocument } from '../schedule/schema/schedule.schema';

@Injectable()
export class ClubService {
  constructor(
    @InjectModel(Club.name) private clubModel: Model<ClubDocument>,
    @InjectModel(ClubMembership.name) private clubMembershipModel: Model<ClubMembershipDocument>,
    @InjectModel(ClubAttendance.name) private clubAttendanceModel: Model<ClubAttendanceDocument>,
    @InjectModel(ClubAnnouncement.name) private clubAnnouncementModel: Model<ClubAnnouncementDocument>,
    @InjectModel(ClubEvent.name) private clubEventModel: Model<ClubEventDocument>,
    @InjectModel(ClubType.name) private clubTypeModel: Model<ClubTypeDocument>,
    @InjectModel(StudentRole.name) private studentRoleModel: Model<StudentRoleDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(CourseAssignment.name) private courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Schedule.name) private scheduleModel: Model<ScheduleDocument>,
    private emailService: EmailService,
    private calendarService: CalendarService,
  ) { }

  // ==================== CLUB MANAGEMENT ====================

  async create(createClubDto: CreateClubDto, role?: string, createdBy?: string): Promise<Club> {
    try {
      const existingClub = await this.clubModel.findOne({
        name: createClubDto.name,
        schoolId: createClubDto.schoolId
        // isActive: true
      });

      if (existingClub) {
        throw new BadRequestException('A club with this name already exists in the school');
      }

      if (!Types.ObjectId.isValid(createClubDto.schoolId)) {
        throw new BadRequestException('Invalid school ID format');
      }

      if (!Types.ObjectId.isValid(createClubDto.advisorId)) {
        throw new BadRequestException('Invalid advisor ID format');
      }

      // Validate advisor
      if (createClubDto.advisorId) {
        const advisor = await this.userModel.findById(createClubDto.advisorId);
        if (!advisor) {
          throw new BadRequestException('Advisor not found');
        }

        if (advisor.role !== 'TEACHER' && advisor.role !== 'ADMIN') {
          throw new BadRequestException('Only teachers and admins can be club advisors');
        }
        if (!advisor.isActive) {
          throw new BadRequestException('Cannot assign inactive user as advisor');
        }
      }

      // Ensure clubName is set for backward compatibility
      const clubData: any = {
        ...createClubDto,
        clubName: createClubDto.name
      };

      // Convert schoolId to ObjectId
      if (createClubDto.schoolId) {
        clubData.schoolId = new Types.ObjectId(createClubDto.schoolId);
      }

      // Convert advisorId to ObjectId if provided
      if (createClubDto.advisorId) {
        clubData.advisorId = new Types.ObjectId(createClubDto.advisorId);
      }

      // Add createdBy if provided (from admin controller or frontend) - convert to ObjectId
      if ((createClubDto as any).createdBy) {
        const createdById = (createClubDto as any).createdBy;
        if (Types.ObjectId.isValid(createdById)) {
          clubData.createdBy = new Types.ObjectId(createdById);
        } else {
          clubData.createdBy = createdById; // Fallback if not valid ObjectId
        }
      }

      const club = await this.clubModel.create(clubData);

      // Create calendar events for club meetings
      if (club.meetingSchedule && club.meetingSchedule.days && club.meetingSchedule.days.length > 0) {
        try {
          // Use createdBy from club object (saved in schema) or fallback to empty string
          const createdByUserId = club.createdBy?.toString() || (createClubDto as any).createdBy?.toString() || '';
          await this.createClubMeetingEvents(club, createdByUserId);
        } catch (eventError) {
          console.error('Failed to create calendar events for club:', eventError);
          // Don't fail club creation if calendar events fail
        }
      }

      // create activity
      await this.activityModel.create({
        title: 'Club Created',
        subtitle: `Club ${club.name} was created`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy)
      });
      
      return club;
    } catch (error) {
      // Handle MongoDB duplicate key error
      if (error.code === 11000) {
        if (error.message.includes('clubName')) {
          throw new BadRequestException('A club with this name already exists');
        }
        throw new BadRequestException('Duplicate club data detected');
      }

      // Re-throw BadRequestException as-is
      if (error instanceof BadRequestException) {
        throw error;
      }

      // Handle other errors
      throw new BadRequestException('Failed to create club: ' + error.message);
    }
  }


  async getSchoolClubNames(schoolId: string): Promise<any> {
    const session = await this.clubModel.db.startSession();
    try {
      let names: string[] = [];
      await session.withTransaction(async () => {
        const docs = await this.clubModel
          .find({ schoolId, isActive: true })
          .select({ name: 1, _id: 0 })
          .lean()
          .session(session);
        names = docs.map((d: any) => d.name).filter(Boolean);
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Club names fetched successfully',
        data: names
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch club names',
        data: null
      };
    }
  }

  async findAll(schoolId?: string, filters?: any, page: number = 1, limit: number = 10): Promise<{ clubs: Club[], total: number, page: number, totalPages: number }> {
    const query: any = {};

    // Convert schoolId to ObjectId if provided
    if (schoolId) {
      if (Types.ObjectId.isValid(schoolId)) {
        query.schoolId = new Types.ObjectId(schoolId);
      } else {
        // If invalid ObjectId, don't filter by school (return empty or all)
        query.schoolId = schoolId; // Fallback, but this might not match
      }
    }

    // Default to only active clubs unless explicitly requested otherwise
    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    } else {
      query.isActive = true; // Default to active clubs only
    }

    if (filters?.type) {
      query.type = filters.type;
    }

    // Handle pagination from filters or parameters
    const pageNum = filters?.page || page;
    const limitNum = filters?.limit || limit;
    const skip = (pageNum - 1) * limitNum;

    // Build search query if search filter is provided
    let searchQuery = query;
    if (filters?.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      searchQuery = {
        ...query,
        $or: [
          { name: searchRegex },
          { description: searchRegex },
          { type: searchRegex }
        ]
      };
    }

    const totalCount = await this.clubModel.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalCount / limitNum);

    const clubs = await this.clubModel.find(searchQuery)
      .populate('advisorId', 'firstName lastName email')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .exec();

    // Add member count and other statistics to each club
    // Preserve the original order from the sorted query
    const clubsWithStats = await Promise.all(clubs.map(async (club) => {
      // Count active approved members using club membership schema
      const memberCount = await this.clubMembershipModel.countDocuments({
        clubId: club._id,
        status: 'approved',
        isActive: true
      });

      // Calculate participation rate based on recent club attendance
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentAttendance = await this.clubAttendanceModel.find({
        clubId: club._id,
        meetingDate: { $gte: thirtyDaysAgo }
      });

      // Calculate unique students who attended vs total members
      const uniqueAttendees = new Set(recentAttendance.map(a => a.studentId.toString())).size;
      const participationRate = memberCount > 0 ? Math.round((uniqueAttendees / memberCount) * 100) : 0;

      // Calculate attendance rate (present vs total attendance records)
      const presentAttendance = recentAttendance.filter(a => a.status === 'present');
      const attendanceRate = recentAttendance.length > 0
        ? Math.round((presentAttendance.length / recentAttendance.length) * 100)
        : 0;

      const clubObj = club.toObject();
      // Access timestamps from the document (Mongoose adds them automatically with timestamps: true)
      const createdAt = (club as any).createdAt || (clubObj as any).createdAt;
      const updatedAt = (club as any).updatedAt || (clubObj as any).updatedAt;

      return {
        ...clubObj,
        createdAt, // Ensure createdAt is preserved
        updatedAt, // Ensure updatedAt is preserved
        memberCount,
        participationRate,
        attendanceRate
      };
    }));

    // Sort again by createdAt to ensure newest first (Promise.all preserves order, but double-check)
    clubsWithStats.sort((a: any, b: any) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate; // Descending order (newest first)
    });

    return {
      clubs: clubsWithStats,
      total: totalCount,
      page: pageNum,
      totalPages
    };
  }

  async findBySchool(schoolId: string): Promise<Club[]> {
    return this.clubModel.find({ schoolId, isActive: true })
      .populate('advisorId', 'firstName lastName email')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .exec();
  }

  async findByAdvisor(advisorId: string): Promise<Club[]> {
    // Convert advisorId string to ObjectId for proper querying
    const advisorObjectId = Types.ObjectId.isValid(advisorId) ? new Types.ObjectId(advisorId) : null;
    
    if (!advisorObjectId) {
      console.error('Invalid advisorId format:', advisorId);
      return [];
    }
    
    console.log('Searching for clubs with advisorId:', advisorId, 'as ObjectId:', advisorObjectId);
    
    // Query with both ObjectId and string to handle any legacy data
    const clubs = await this.clubModel.find({ 
      $or: [
        { advisorId: advisorObjectId },
        { advisorId: advisorId }
      ],
      isActive: true 
    })
      .populate('advisorId', 'firstName lastName email')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .exec();

    console.log('Found clubs:', clubs.length, 'clubs for advisor:', advisorId);

    // Add member count and other statistics to each club
    const clubsWithStats = await Promise.all(clubs.map(async (club) => {
      // Count active approved members using club membership schema
      const memberCount = await this.clubMembershipModel.countDocuments({
        clubId: club._id,
        status: 'approved',
        isActive: true
      });

      // Calculate participation rate based on recent club attendance
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentAttendance = await this.clubAttendanceModel.find({
        clubId: club._id,
        meetingDate: { $gte: thirtyDaysAgo }
      });

      // Calculate unique students who attended vs total members
      const uniqueAttendees = new Set(recentAttendance.map(a => a.studentId.toString())).size;
      const participationRate = memberCount > 0 ? Math.round((uniqueAttendees / memberCount) * 100) : 0;

      // Calculate attendance rate (present vs total attendance records)
      const presentAttendance = recentAttendance.filter(a => a.status === 'present');
      const attendanceRate = recentAttendance.length > 0
        ? Math.round((presentAttendance.length / recentAttendance.length) * 100)
        : 0;

      const clubObj = club.toObject ? club.toObject() : club;
      return {
        ...clubObj,
        memberCount,
        participationRate,
        attendanceRate
      };
    }));

    return clubsWithStats as any;
  }

  async findByType(type: string, schoolId?: string): Promise<Club[]> {
    const query: any = { type, isActive: true };
    if (schoolId) {
      query.schoolId = schoolId;
    }

    return this.clubModel.find(query)
      .populate('advisorId', 'firstName lastName email')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .exec();
  }

  async findOne(id: string): Promise<Club> {
    const club = await this.clubModel.findById(id)
      .populate('advisorId', 'firstName lastName email')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .exec();

    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  async findOneWithDetails(id: string, schoolId?: string): Promise<any> {
    console.log('findOneWithDetails called with:', { id, schoolId, schoolIdType: typeof schoolId });

    const club = await this.clubModel.findById(id)
      .populate('advisorId', 'firstName lastName email department')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .populate('createdBy', 'firstName lastName')
      .exec();

    console.log('Found club with id:', club);

    if (!club) {
      console.log('Club not found with id:', id);
      throw new NotFoundException('Club not found');
    }

    // Check if club belongs to the school - only validate if schoolId is provided
    // If schoolId is undefined (super-admin), skip validation
    if (schoolId) {
      const clubSchoolIdStr = club.schoolId.toString();
      const requestedSchoolIdStr = schoolId.toString();

      if (clubSchoolIdStr !== requestedSchoolIdStr) {
        throw new ForbiddenException('You can only view clubs from your school');
      }
    }

    // Get member count
    const memberCount = await this.clubMembershipModel.countDocuments({
      clubId: id,
      status: 'approved'
    });

    // Get pending membership requests count
    const pendingRequestsCount = await this.clubMembershipModel.countDocuments({
      clubId: id,
      status: 'pending'
    });

    // Get recent announcements
    const recentAnnouncements = await this.clubAnnouncementModel.find({
      clubId: id
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('createdBy', 'firstName lastName')
      .exec();

    return {
      club,
      memberCount,
      pendingRequestsCount,
      recentAnnouncements
    };
  }

  async update(id: string, updateClubDto: UpdateClubDto, role?: string, createdBy?: string): Promise<Club> {
    // Get the current club to check for advisor changes
    const currentClub = await this.clubModel.findById(id).exec();
    if (!currentClub) {
      throw new NotFoundException('Club not found');
    }

    // Validate advisor if being assigned
    if (updateClubDto.advisorId) {
      if (!Types.ObjectId.isValid(updateClubDto.advisorId)) {
        throw new BadRequestException('Invalid advisor ID format');
      }

      const advisor = await this.userModel.findById(updateClubDto.advisorId);
      if (!advisor) {
        throw new BadRequestException('Advisor not found');
      }
      if (advisor.role !== 'TEACHER' && advisor.role !== 'ADMIN') {
        throw new BadRequestException('Only teachers and admins can be club advisors');
      }
      if (!advisor.isActive) {
        throw new BadRequestException('Cannot assign inactive user as advisor');
      }
    }

    // Prepare update data with proper ObjectId conversion
    const updateData: any = { ...updateClubDto };

    // Convert advisorId to ObjectId if provided (similar to create method)
    if (updateClubDto.advisorId) {
      updateData.advisorId = new Types.ObjectId(updateClubDto.advisorId);
    }

    const updatedClub = await this.clubModel.findByIdAndUpdate(id, updateData, { new: true })
      .populate('advisorId', 'firstName lastName email')
      .populate('studentRoles.studentId', 'firstName lastName email studentId gradeLevel')
      .exec();

    if (!updatedClub) {
      throw new NotFoundException('Club not found');
    }

    // create activity
    await this.activityModel.create({
      title: 'Club Updated',
      subtitle: `Club ${updatedClub.name} was updated`,
      performBy: role,
      actorId: new Types.ObjectId(createdBy),
      adminId: new Types.ObjectId(createdBy)
    });

    // Update calendar events if meeting schedule changed
    if (updateClubDto.meetingSchedule) {
      try {
        await this.updateClubMeetingEvents(updatedClub, updateClubDto.updatedBy?.toString() || '');
      } catch (eventError) {
        console.error('Failed to update calendar events for club:', eventError);
        // Don't fail club update if calendar events fail
      }
    }

    return updatedClub;
  }

  async remove(id: string, role?: string, createdBy?: string): Promise<{ message: string }> {
    const deletedClub = await this.clubModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!deletedClub) {
      throw new NotFoundException('Club not found');
    }

    // create activity
    await this.activityModel.create({
      title: 'Club Deleted',
      subtitle: `Club ${deletedClub.name} was deleted`,
      performBy: role,
      actorId: new Types.ObjectId(createdBy),
      adminId: new Types.ObjectId(createdBy)
    });

    return { message: 'Club deleted successfully' };
  }

  // ==================== MEMBERSHIP MANAGEMENT ====================

  async addMember(membershipData: any, approvedBy: string): Promise<ClubMembership> {
    const existingMembership = await this.clubMembershipModel.findOne({
      clubId: membershipData.clubId,
      studentId: membershipData.studentId,
      isActive: true
    });

    if (existingMembership) {
      throw new BadRequestException('Student is already a member of this club');
    }

    // Check club capacity and get schoolId
    const club = await this.clubModel.findById(membershipData.clubId);
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    if (club.maxMembers) {
      const currentMembers = await this.clubMembershipModel.countDocuments({
        clubId: membershipData.clubId,
        status: 'approved',
        isActive: true
      });

      if (currentMembers >= club.maxMembers) {
        throw new BadRequestException('Club has reached maximum capacity');
      }
    }

    const membership = new this.clubMembershipModel({
      ...membershipData,
      schoolId: club.schoolId, // Add the required schoolId from the club
      approvedBy,
      status: club.requiresApproval ? 'pending' : 'approved',
      approvedDate: club.requiresApproval ? null : new Date()
    });

    return membership.save();
  }

  async getClubMembers(clubId: string, filters?: { status?: string; role?: string; search?: string }): Promise<ClubMembership[]> {
    // Convert clubId to ObjectId
    if (!Types.ObjectId.isValid(clubId)) {
      throw new BadRequestException('Invalid club ID format');
    }
    const clubObjectId = new Types.ObjectId(clubId);

    const query: any = {
      clubId: clubObjectId, // Use ObjectId
      isActive: true,
      status: 'approved' // Only return approved members, not pending requests
    };

    // Allow status filter to override if explicitly provided (for admin/super-admin views)
    if (filters?.status && filters.status !== 'all') {
      query.status = filters.status;
    }

    if (filters?.role && filters.role !== 'all') {
      query.role = filters.role;
    }

    let memberships = await this.clubMembershipModel.find(query)
      .populate('studentId', 'firstName lastName email class gradeLevel studentId')
      .populate('approvedBy', 'firstName lastName')
      .populate('clubId', 'name type')
      .sort({ joinedDate: -1 })
      .exec();

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      memberships = memberships.filter((membership) => {
        const student = membership.studentId as any;
        const club = membership.clubId as any;
        const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';
        const clubName = club?.name ? club.name.toLowerCase() : '';
        return studentName.includes(searchLower) || clubName.includes(searchLower);
      });
    }

    return memberships;
  }

  async findMembershipByClubAndStudent(clubId: string, studentId: string): Promise<ClubMembership | null> {
    // Convert IDs to ObjectId
    if (!Types.ObjectId.isValid(clubId) || !Types.ObjectId.isValid(studentId)) {
      return null;
    }
    const clubObjectId = new Types.ObjectId(clubId);
    const studentObjectId = new Types.ObjectId(studentId);
    
    return this.clubMembershipModel.findOne({
      clubId: clubObjectId,
      studentId: studentObjectId,
      isActive: true
    }).exec();
  }

  async updateMembershipStatus(membershipId: string, status: string, approvedBy: string): Promise<ClubMembership> {
    const updateData: any = { status };

    if (status === 'approved') {
      updateData.approvedBy = approvedBy;
      updateData.approvedDate = new Date();
    }

    const membership = await this.clubMembershipModel.findByIdAndUpdate(
      membershipId,
      updateData,
      { new: true }
    ).populate('studentId', 'firstName lastName email');

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return membership;
  }

  // ==================== ATTENDANCE MANAGEMENT ====================

  async getClubAttendance(clubId: string, filters?: any): Promise<ClubAttendance[]> {
    const query: any = { clubId };

    if (filters?.startDate && filters?.endDate) {
      query.meetingDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    return this.clubAttendanceModel.find(query)
      .populate('clubId', 'name type')
      .populate('studentId', 'firstName lastName email studentId gradeLevel')
      .populate('recordedBy', 'firstName lastName')
      .sort({ meetingDate: -1 })
      .exec();
  }

  async recordBulkAttendance(bulkData: any, recordedBy: string): Promise<any> {
    const { clubId, meetingDate, attendanceRecords } = bulkData;

    const attendanceItems = attendanceRecords.map((record: any) => ({
      clubId,
      studentId: record.studentId,
      meetingDate: new Date(meetingDate),
      status: record.status || 'present',
      notes: record.notes || '',
      recordedBy: new Types.ObjectId(recordedBy),
      schoolId: record.schoolId
    }));

    const savedAttendance = await this.clubAttendanceModel.insertMany(attendanceItems);

    return {
      success: true,
      data: savedAttendance,
      message: `Attendance recorded for ${savedAttendance.length} members`
    };
  }

  // ==================== ANNOUNCEMENTS ====================

  async createAnnouncement(announcementData: any, role?: string, createdBy?: Types.ObjectId): Promise<ClubAnnouncement> {
    console.log('Service: Creating announcement with data:', announcementData);

    // Normalize message/content field
    if (announcementData.message && !announcementData.content) {
      announcementData.content = announcementData.message;
    }

    // Convert schoolId to ObjectId if it's a valid string
    let schoolIdObj = announcementData.schoolId;
    if (schoolIdObj && Types.ObjectId.isValid(schoolIdObj)) {
      schoolIdObj = new Types.ObjectId(schoolIdObj);
    }

    // Convert clubId to ObjectId
    let clubIdObj = announcementData.clubId;
    if (clubIdObj && Types.ObjectId.isValid(clubIdObj)) {
      clubIdObj = new Types.ObjectId(clubIdObj);
    }

    // Verify club exists and belongs to the school
    const club = await this.clubModel.findOne({
      _id: clubIdObj,
      schoolId: schoolIdObj
    });

    console.log('Service: Found club:', club ? 'Yes' : 'No');

    if (!club) {
      console.log('Service: Club not found for schoolId:', announcementData.schoolId);
      throw new NotFoundException('Club not found in your school');
    }

    // Check for existing inactive announcement with same title and club
    const existing = await this.clubAnnouncementModel.findOne({
      clubId: clubIdObj,
      title: announcementData.title,
      isActive: false
    });

    if (existing) {
      console.log('Service: Reactivating existing announcement:', existing._id);
      // Reactivate and update existing announcement
      existing.content = announcementData.content || announcementData.message;
      existing.type = announcementData.type || announcementData.priority;
      existing.notifyParents = announcementData.notifyParents;
      existing.eventDate = announcementData.eventDate || announcementData.scheduledFor;
      existing.expiryDate = announcementData.expiryDate;
      existing.isActive = true;

      // Ensure clubId, schoolId, and createdBy are ObjectIds
      if (clubIdObj) {
        existing.clubId = clubIdObj;
      }
      if (schoolIdObj) {
        existing.schoolId = schoolIdObj;
      }
      if (announcementData.createdBy && Types.ObjectId.isValid(announcementData.createdBy)) {
        existing.createdBy = new Types.ObjectId(announcementData.createdBy);
      }

      const result = await existing.save();
      console.log('Service: Announcement reactivated with ID:', result._id);
      return result;
    }

    console.log('Service: Creating announcement in database...');

    // Normalize scheduledFor/eventDate field - map scheduledFor to eventDate for schema
    if (announcementData.scheduledFor && !announcementData.eventDate) {
      announcementData.eventDate = announcementData.scheduledFor;
    }

    // Normalize targetAudience - map frontend values to valid enum values
    if (announcementData.targetAudience) {
      const targetAudienceMap: Record<string, string> = {
        'both': 'members and parents',
        'members and parents': 'members and parents',
        'parent and member': 'parent and member',
        'parents and members': 'parents and members',
        'members': 'members',
        'parents': 'parents',
        'all': 'all'
      };
      announcementData.targetAudience = targetAudienceMap[announcementData.targetAudience.toLowerCase()] || 'members';
    }

    // Convert clubId, schoolId, and createdBy to ObjectId before saving
    const announcementToCreate: any = {
      ...announcementData
    };

    // Convert clubId to ObjectId
    if (clubIdObj) {
      announcementToCreate.clubId = clubIdObj;
    } else {
      throw new BadRequestException('Invalid club ID format');
    }

    // Convert schoolId to ObjectId
    if (schoolIdObj) {
      announcementToCreate.schoolId = schoolIdObj;
    } else {
      throw new BadRequestException('School ID is required');
    }

    // Convert createdBy to ObjectId if provided
    if (announcementData.createdBy) {
      if (Types.ObjectId.isValid(announcementData.createdBy)) {
        announcementToCreate.createdBy = new Types.ObjectId(announcementData.createdBy);
      } else {
        console.warn('Invalid createdBy ID format, using as-is:', announcementData.createdBy);
      }
    }

    const result = await this.clubAnnouncementModel.create(announcementToCreate);

    // create activity - fetch user to get role
    try {
      console.log('Service: Creating activity for announcement:', result.title);

      // Ensure performBy has a value (role or default to 'ADMIN')
      const performByRole = role || 'ADMIN';

      await this.activityModel.create({
        title: 'Announcement Created',
        subtitle: `Announcement "${result.title}" was created`,
        performBy: performByRole,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy)
      });

      console.log('Service: Activity created for announcement:', result.title);
      
    } catch (activityError) {
      // Log error but don't fail the announcement creation
      console.error('Failed to create activity for announcement:', activityError);
    }

    console.log('Service: Announcement created with ID:', result._id);
    
    // Send email notifications immediately after announcement is saved
    // (unless explicitly scheduled for future)
    // Note: Schema only has eventDate, but we check announcementData for scheduledAt/scheduledFor
    const resultAny = result as any;
    const scheduledAt = announcementData.scheduledAt;
    const scheduledFor = announcementData.scheduledFor;
    const eventDate = resultAny.eventDate || announcementData.eventDate;
    
    // Only consider it scheduled if there's a future date
    let isScheduled = false;
    if (scheduledAt || scheduledFor || eventDate) {
      const scheduledDate = scheduledAt || scheduledFor || eventDate;
      const scheduledDateTime = new Date(scheduledDate);
      const now = new Date();
      // Only skip if scheduled for future (more than 1 minute from now)
      isScheduled = scheduledDateTime > now && (scheduledDateTime.getTime() - now.getTime()) > 60000;
    }
    
    console.log('\n📧 ========== SERVICE: CHECKING IF EMAIL NOTIFICATION SHOULD BE SENT ==========');
    console.log(`📋 Announcement ID: ${result._id.toString()}`);
    console.log(`📋 Club ID: ${announcementData.clubId}`);
    console.log(`📋 scheduledAt: ${scheduledAt || 'null'}`);
    console.log(`📋 scheduledFor: ${scheduledFor || 'null'}`);
    console.log(`📋 eventDate: ${eventDate || 'null'}`);
    console.log(`📋 Is Scheduled (future): ${isScheduled ? 'YES (will not send now)' : 'NO (sending now)'}`);
    
    if (!isScheduled) {
      console.log('\n📧 ========== SERVICE: TRIGGERING EMAIL NOTIFICATION FOR ANNOUNCEMENT ==========');
      console.log(`📋 Announcement ID: ${result._id.toString()}`);
      console.log(`📋 Club ID: ${announcementData.clubId}`);
      console.log(`📋 Created By: ${createdBy}`);
      
      // Send emails in background (don't block response)
      this.notifyMembersOfAnnouncement(
        announcementData.clubId,
        result._id.toString(),
        createdBy?.toString() || ''
      ).then((notificationResult) => {
        console.log('✅ Service: Email notification completed:', JSON.stringify(notificationResult, null, 2));
      }).catch((notificationError: any) => {
        console.error('❌ Service: Error sending announcement notifications:', notificationError);
        console.error('❌ Service: Error details:', notificationError?.message);
        console.error('❌ Service: Error stack:', notificationError?.stack);
      });
    } else {
      console.log('⏰ Service: Announcement is scheduled for future. Emails will not be sent now.');
    }
    
    console.log('Service: Returning announcement object to controller...');
    return result;
  }

  async getAnnouncements(
    filter: any,
    options: { page: number; limit: number }
  ): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
    const { page = 1, limit = 10 } = options;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.clubAnnouncementModel
        .find(filter)
        .populate('clubId', 'name')
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.clubAnnouncementModel.countDocuments(filter)
    ]);

    return {
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  async getClubAnnouncements(clubId: string): Promise<ClubAnnouncement[]> {
    // Convert clubId to ObjectId if it's a valid ObjectId string
    let clubIdObj: any = clubId;
    if (Types.ObjectId.isValid(clubId)) {
      clubIdObj = new Types.ObjectId(clubId);
    }
    
    return this.clubAnnouncementModel.find({
      clubId: clubIdObj,
      isActive: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: { $gt: new Date() } }
      ]
    })
      .populate('createdBy', 'firstName lastName')
      .populate('clubId', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async getSchoolAnnouncements(schoolId: string | undefined, query: any): Promise<any> {
    console.log('Service: Getting school announcements for schoolId:', schoolId);
    const filter: any = {
      isActive: true,
    };

    // If schoolId is provided, convert to ObjectId and add it to filter
    // If schoolId is undefined (super-admin viewing all), don't filter by schoolId
    if (schoolId && schoolId !== 'all' && schoolId !== '') {
      if (Types.ObjectId.isValid(schoolId)) {
        filter.schoolId = new Types.ObjectId(schoolId);
      } else {
        console.warn('Invalid schoolId format:', schoolId);
      }
    } else if (query.clubId) {
      // For super-admin, if clubId is provided, get schoolId from the club
      try {
        const club = await this.clubModel.findById(query.clubId).select('schoolId').lean();
        if (club && club.schoolId) {
          filter.schoolId = club.schoolId;
        }
      } catch (error) {
        console.error('Error fetching club for schoolId:', error);
      }
    }
    // If schoolId is undefined and no clubId, don't filter by school (show all for super-admin)

    console.log('Service: Filter:', filter);

    const andConditions: any[] = [
      {
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: { $gt: new Date() } }
        ]
      }
    ];

    console.log('Service: And conditions:', andConditions);

    if (query.clubId) {
      // Convert clubId to ObjectId if it's a valid ObjectId string
      if (Types.ObjectId.isValid(query.clubId)) {
        filter.clubId = new Types.ObjectId(query.clubId);
      } else {
        // If invalid, don't add to filter (will return no results)
        console.warn('Invalid clubId format:', query.clubId);
      }
    }
    console.log('Service: Club ID:', query.clubId);
    // Optional search
    if (query.search) {
      const searchRegex = new RegExp(query.search, 'i');
      andConditions.push({
        $or: [
          { title: searchRegex },
          { content: searchRegex },
          { message: searchRegex }
        ]
      });
      console.log('Service: Search regex:', searchRegex);
    }

    // Optional status filter for tabs
    const now = new Date();
    if (query.status === 'draft') {
      andConditions.push({
        $and: [
          { $or: [{ sentAt: { $exists: false } }, { sentAt: null }] },
          {
            $or: [
              { eventDate: { $exists: false } },
              { scheduledFor: { $exists: false } },
              { eventDate: { $lte: now } },
              { scheduledFor: { $lte: now } }
            ]
          }
        ]
      });
    } else if (query.status === 'sent') {
      andConditions.push({ sentAt: { $exists: true, $ne: null } });
    } else if (query.status === 'scheduled') {
      // Scheduled: has future eventDate/scheduledFor AND not sent yet
      andConditions.push({
        $and: [
          {
            $or: [
              { eventDate: { $gt: now } },
              { scheduledFor: { $gt: now } }
            ]
          },
          { $or: [{ sentAt: { $exists: false } }, { sentAt: null }] }
        ]
      });
    }

    console.log('Service: And conditions:', andConditions);

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    console.log('Service: Filter:', filter);

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    console.log('Service: Skip:', skip);

    console.log('Service: Counting documents...');
    const total = await this.clubAnnouncementModel.countDocuments(filter);
    console.log('Service: Total:', total);

    const announcements = await this.clubAnnouncementModel.find(filter)
      .populate({
        path: 'clubId',
        select: 'name type schoolId',
        populate: {
          path: 'schoolId',
          select: 'name'
        }
      })
      .populate('schoolId', 'name')
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    console.log('Service: Announcements:', announcements);

    // Normalize announcements to include message field from content
    const normalizedAnnouncements = announcements.map((ann: any) => {
      // Normalize priority - map 'general' or invalid values to 'normal'
      let priority = ann.priority || ann.type || 'normal';
      if (!['low', 'normal', 'high', 'urgent'].includes(priority)) {
        priority = 'normal';
      }

      return {
        ...ann,
        message: ann.message || ann.content || '',
        priority: priority,
        targetAudience: ann.targetAudience || 'members',
        scheduledFor: ann.scheduledFor || ann.eventDate || null
      };
    });

    return {
      announcements: normalizedAnnouncements,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    };
  }

  async getAnnouncementsStats(schoolId: string): Promise<any> {
    const filter: any = {
      schoolId,
      isActive: true,
    };

    const andConditions: any[] = [
      {
        $or: [
          { expiryDate: { $exists: false } },
          { expiryDate: { $gt: new Date() } }
        ]
      }
    ];

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const allAnnouncements = await this.clubAnnouncementModel.find(filter)
      .populate('clubId', 'name')
      .lean()
      .exec();

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const stats = {
      totalClubs: await this.clubModel.countDocuments({ schoolId, isActive: true }),
      totalAnnouncements: allAnnouncements.length,
      scheduled: allAnnouncements.filter((ann: any) => {
        const eventDate = ann.eventDate || ann.scheduledFor;
        if (!eventDate) return false;
        const eventDateTime = new Date(eventDate);
        return eventDateTime > now && (!ann.sentAt || ann.sentAt === null);
      }).length,
      sentToday: allAnnouncements.filter((ann: any) => {
        if (!ann.sentAt) return false;
        const sentDate = new Date(ann.sentAt);
        return sentDate >= todayStart && sentDate <= todayEnd;
      }).length
    };

    return stats;
  }

  // ==================== REPORTS ====================

  async getClubParticipationReport(schoolId: string): Promise<any> {
    const clubs = await this.clubModel.find({ schoolId, isActive: true });
    const report = [];

    for (const club of clubs) {
      const memberCount = await this.clubMembershipModel.countDocuments({
        clubId: club._id,
        status: 'approved',
        isActive: true
      });

      const recentAttendance = await this.clubAttendanceModel.find({
        clubId: club._id,
        meetingDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      });

      const attendanceRate = recentAttendance.length > 0
        ? (recentAttendance.filter(a => a.status === 'present').length / recentAttendance.length) * 100
        : 0;

      report.push({
        clubName: club.name,
        clubType: club.type,
        memberCount,
        attendanceRate: Math.round(attendanceRate),
        advisor: club.advisorId
      });
    }

    return report;
  }

  async getStudentClubMemberships(studentId: string): Promise<ClubMembership[]> {
    if (!studentId) {
      console.error('[getStudentClubMemberships] No studentId provided');
      return [];
    }
    
    // Normalize studentId - convert to string first
    const studentIdStr = String(studentId);
    
    // Build query array for $or clause
    const orConditions: any[] = [];
    
    // Add string format
    orConditions.push({ studentId: studentIdStr });
    
    // Add ObjectId format if valid
    if (Types.ObjectId.isValid(studentIdStr)) {
      try {
        const studentObjectId = new Types.ObjectId(studentIdStr);
        orConditions.push({ studentId: studentObjectId });
      } catch (e) {
        console.warn('[getStudentClubMemberships] Failed to create ObjectId:', e);
      }
    }

    const query: any = {
      $or: orConditions,
      status: 'approved',
      isActive: true
    };
    
    console.log(`[getStudentClubMemberships] Querying memberships for studentId: ${studentIdStr}`);

    try {
      const memberships = await this.clubMembershipModel.find(query)
        .populate('clubId', 'name description type meetingSchedule location')
        .exec();
      
      console.log(`[getStudentClubMemberships] Found ${memberships?.length || 0} memberships`);
      
      if (memberships && memberships.length > 0) {
        memberships.forEach((m, idx) => {
          const mem = m as any;
          console.log(`[getStudentClubMemberships] Membership ${idx + 1}:`, {
            membershipId: mem._id,
            clubId: mem.clubId?._id || mem.clubId,
            clubName: mem.clubId?.name,
            status: mem.status,
            isActive: mem.isActive
          });
        });
      }
      
      return memberships || [];
    } catch (error) {
      console.error('[getStudentClubMemberships] Error querying memberships:', error);
      return [];
    }
  }

  // ==================== MISSING METHODS FOR CONTROLLERS ====================

  async requestMembership(clubId: string, studentId: string, role: string = 'Member'): Promise<ClubMembership> {
    // Validate ObjectId formats
    if (!Types.ObjectId.isValid(clubId)) {
      throw new BadRequestException('Invalid club ID format');
    }
    if (!Types.ObjectId.isValid(studentId)) {
      throw new BadRequestException('Invalid student ID format');
    }

    const clubObjectId = new Types.ObjectId(clubId);
    const studentObjectId = new Types.ObjectId(studentId);

    // If there is an existing active membership, block
    const existingActive = await this.clubMembershipModel.findOne({
      clubId: clubObjectId,
      studentId: studentObjectId,
      isActive: true
    });

    if (existingActive) {
      throw new BadRequestException('Student is already a member or has a pending request');
    }

    // If there is an inactive membership, reactivate instead of creating a duplicate
    const existingInactive = await this.clubMembershipModel.findOne({
      clubId: clubObjectId,
      studentId: studentObjectId,
      isActive: false
    });

    const club = await this.clubModel.findById(clubObjectId);
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Enforce capacity if maxMembers is set
    if (club.maxMembers && club.maxMembers > 0) {
      const approvedCount = await this.clubMembershipModel.countDocuments({
        clubId: clubObjectId,
        status: 'approved',
        isActive: true,
      });
      if (approvedCount >= club.maxMembers) {
        throw new BadRequestException('Club has reached maximum capacity');
      }
    }

    if (existingInactive) {
      existingInactive.isActive = true;
      existingInactive.role = role;
      existingInactive.status = club.requiresApproval ? 'pending' : 'approved';
      existingInactive.approvedBy = club.requiresApproval ? undefined : new Types.ObjectId(club.advisorId);
      existingInactive.approvedDate = club.requiresApproval ? null : new Date();
      if (!existingInactive.joinedDate) existingInactive.joinedDate = new Date();
      // Ensure clubId and studentId are ObjectIds
      existingInactive.clubId = clubObjectId;
      existingInactive.studentId = studentObjectId;
      await existingInactive.save();
      return existingInactive;
    }

    const membership = new this.clubMembershipModel({
      clubId: clubObjectId, // Use ObjectId
      studentId: studentObjectId, // Use ObjectId
      role,
      schoolId: club.schoolId,
      approvedBy: club.requiresApproval ? undefined : new Types.ObjectId(club.advisorId),
      status: club.requiresApproval ? 'pending' : 'approved',
      joinedDate: new Date(),
      approvedDate: club.requiresApproval ? null : new Date()
    });

    return membership.save();
  }

  async approveMembership(membershipId: string, approvedBy: string): Promise<ClubMembership> {
    const membership = await this.clubMembershipModel.findByIdAndUpdate(
      membershipId,
      {
        status: 'approved',
        approvedBy: new Types.ObjectId(approvedBy),
        approvedDate: new Date()
      },
      { new: true }
    ).populate('studentId', 'firstName lastName email');

    if (!membership) {
      throw new NotFoundException('Membership request not found');
    }

    return membership;
  }

  async rejectMembership(membershipId: string, rejectedBy: string, reason?: string): Promise<ClubMembership> {
    const membership = await this.clubMembershipModel.findByIdAndUpdate(
      membershipId,
      {
        status: 'rejected',
        rejectedBy,
        rejectedDate: new Date(),
        rejectionReason: reason
      },
      { new: true }
    ).populate('studentId', 'firstName lastName email');

    if (!membership) {
      throw new NotFoundException('Membership request not found');
    }

    return membership;
  }

  async removeMembership(membershipId: string): Promise<{ message: string }> {
    const membership = await this.clubMembershipModel.findByIdAndUpdate(
      membershipId,
      { isActive: false },
      { new: true }
    );

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    return { message: 'Membership removed successfully' };
  }

  async getPendingRequests(clubId: string, filters?: { role?: string; search?: string }): Promise<ClubMembership[]> {
    // Convert clubId to ObjectId
    if (!Types.ObjectId.isValid(clubId)) {
      throw new BadRequestException('Invalid club ID format');
    }
    const clubObjectId = new Types.ObjectId(clubId);

    const query: any = {
      clubId: clubObjectId, // Use ObjectId
      status: 'pending',
      isActive: true
    };

    if (filters?.role && filters.role !== 'all') {
      query.role = filters.role;
    }

    let pending = await this.clubMembershipModel.find(query)
      .populate('studentId', 'firstName lastName email studentId gradeLevel class')
      .populate('clubId', 'name type schoolId')
      .sort({ createdAt: -1 })
      .exec();

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      pending = pending.filter((membership) => {
        const student = membership.studentId as any;
        const club = membership.clubId as any;
        const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';
        const clubName = club?.name ? club.name.toLowerCase() : '';
        return studentName.includes(searchLower) || clubName.includes(searchLower);
      });
    }

    return pending;
  }

  // Get all memberships with optional schoolId filter (for super-admin)
  async getAllMemberships(schoolId?: string, filters?: { status?: string; role?: string; search?: string; clubId?: string }): Promise<ClubMembership[]> {
    const query: any = {
      isActive: true
    };

    // Convert schoolId to ObjectId if provided
    if (schoolId && schoolId !== 'all' && schoolId !== '') {
      if (Types.ObjectId.isValid(schoolId)) {
        query.schoolId = new Types.ObjectId(schoolId);
      } else {
        throw new BadRequestException('Invalid school ID format');
      }
    }

    // Filter by status
    if (filters?.status && filters.status !== 'all') {
      query.status = filters.status;
    } else {
      // Default to approved if no status specified
      query.status = 'approved';
    }

    // Filter by role
    if (filters?.role && filters.role !== 'all') {
      query.role = filters.role;
    }

    // Filter by clubId
    if (filters?.clubId && filters.clubId !== 'all') {
      if (Types.ObjectId.isValid(filters.clubId)) {
        query.clubId = new Types.ObjectId(filters.clubId);
      }
    }

    let memberships = await this.clubMembershipModel.find(query)
      .populate('studentId', 'firstName lastName email class gradeLevel studentId')
      .populate('approvedBy', 'firstName lastName')
      .populate('clubId', 'name type schoolId')
      .sort({ joinedDate: -1 })
      .exec();

    // Apply search filter if provided
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      memberships = memberships.filter((membership) => {
        const student = membership.studentId as any;
        const club = membership.clubId as any;
        const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';
        const clubName = club?.name ? club.name.toLowerCase() : '';
        return studentName.includes(searchLower) || clubName.includes(searchLower);
      });
    }

    return memberships;
  }

  // Get all pending requests with optional schoolId filter (for super-admin)
  async getAllPendingRequests(schoolId?: string, filters?: { role?: string; search?: string; clubId?: string }): Promise<ClubMembership[]> {
    const query: any = {
      status: 'pending',
      isActive: true
    };

    // Convert schoolId to ObjectId if provided
    if (schoolId && schoolId !== 'all' && schoolId !== '') {
      if (Types.ObjectId.isValid(schoolId)) {
        query.schoolId = new Types.ObjectId(schoolId);
      } else {
        throw new BadRequestException('Invalid school ID format');
      }
    }

    // Filter by role
    if (filters?.role && filters.role !== 'all') {
      query.role = filters.role;
    }

    // Filter by clubId
    if (filters?.clubId && filters.clubId !== 'all') {
      if (Types.ObjectId.isValid(filters.clubId)) {
        query.clubId = new Types.ObjectId(filters.clubId);
      }
    }

    let pending = await this.clubMembershipModel.find(query)
      .populate('studentId', 'firstName lastName email studentId gradeLevel class')
      .populate('clubId', 'name type schoolId')
      .sort({ createdAt: -1 })
      .exec();

    // Apply search filter if provided
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      pending = pending.filter((membership) => {
        const student = membership.studentId as any;
        const club = membership.clubId as any;
        const studentName = student ? `${student.firstName} ${student.lastName}`.toLowerCase() : '';
        const clubName = club?.name ? club.name.toLowerCase() : '';
        return studentName.includes(searchLower) || clubName.includes(searchLower);
      });
    }

    return pending;
  }

  async getStudentMemberships(studentId: string): Promise<ClubMembership[]> {
    return this.getStudentClubMemberships(studentId);
  }

  async getStudentMembershipRequests(studentId: string): Promise<ClubMembership[]> {
    return this.clubMembershipModel.find({
      studentId,
      status: { $in: ['pending', 'approved', 'rejected'] }
    })
      .populate('clubId', 'name description type status location maxMembers')
      .sort({ requestDate: -1 })
      .exec();
  }

  // Attendance methods
  async markAttendance(clubId: string, studentId: string, date: string, status: string, markedBy: string): Promise<ClubAttendance> {
    // Validate inputs
    if (!clubId || !Types.ObjectId.isValid(clubId)) {
      throw new BadRequestException('Invalid club ID format');
    }

    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      throw new BadRequestException('Invalid student ID format');
    }

    if (!date) {
      throw new BadRequestException('Date is required');
    }

    // Parse the date and validate
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date format. Expected format: YYYY-MM-DD or ISO date string');
    }

    // Get club to retrieve schoolId
    const club = await this.clubModel.findById(clubId);
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Create a date range for the entire day without mutating the original
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceData = {
      clubId: new Types.ObjectId(clubId),
      studentId: new Types.ObjectId(studentId),
      meetingDate: startOfDay, // Use start of day for consistency
      status,
      recordedBy: new Types.ObjectId(markedBy),
      schoolId: club.schoolId
    };

    // Check if attendance already exists for this date (using date range)
    const existingAttendance = await this.clubAttendanceModel.findOne({
      clubId: new Types.ObjectId(clubId),
      studentId: new Types.ObjectId(studentId),
      meetingDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    if (existingAttendance) {
      // Update existing attendance
      return this.clubAttendanceModel.findByIdAndUpdate(
        existingAttendance._id,
        { status, recordedBy: new Types.ObjectId(markedBy), meetingDate: startOfDay },
        { new: true }
      ).populate('clubId', 'name type')
        .populate('studentId', 'firstName lastName email studentId gradeLevel')
        .populate('recordedBy', 'firstName lastName');
    }

    const newAttendance = await this.clubAttendanceModel.create(attendanceData);
    const savedAttendance = await this.clubAttendanceModel.findById(newAttendance._id)
      .populate('clubId', 'name type')
      .populate('studentId', 'firstName lastName email studentId gradeLevel')
      .populate('recordedBy', 'firstName lastName');

    // Auto-notify parents if student is absent
    if (status === 'absent' && savedAttendance) {
      try {
        await this.notifyParentsOfAbsence(clubId, studentId, new Date(date), markedBy);
      } catch (notifyError) {
        // Log error but don't fail the attendance recording
        console.error('Failed to notify parents of absence:', notifyError);
      }
    }

    return savedAttendance;
  }

  async getAttendanceByDate(clubId: string, date: Date): Promise<ClubAttendance[]> {
    // Create date range without mutating the original date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.clubAttendanceModel.find({
      clubId,
      meetingDate: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    })
      .populate('clubId', 'name type')
      .populate('studentId', 'firstName lastName email studentId gradeLevel')
      .populate('recordedBy', 'firstName lastName')
      .exec();
  }

  async getStudentAttendance(clubId: string, studentId: string): Promise<ClubAttendance[]> {
    // Ensure both IDs are valid ObjectIds
    if (!Types.ObjectId.isValid(clubId)) {
      console.error('[getStudentAttendance] Invalid clubId format:', clubId);
      return [];
    }
    
    if (!Types.ObjectId.isValid(studentId)) {
      console.error('[getStudentAttendance] Invalid studentId format:', studentId);
      return [];
    }
    
    // Convert to ObjectId for query - both clubId and studentId are ObjectIds in the collection
    const clubObjectId = new Types.ObjectId(clubId);
    const studentObjectId = new Types.ObjectId(studentId);
    
    console.log(`[getStudentAttendance] Querying clubattendances collection`);
    console.log(`[getStudentAttendance] clubId (string): ${clubId} -> ObjectId: ${clubObjectId.toString()}`);
    console.log(`[getStudentAttendance] studentId (string): ${studentId} -> ObjectId: ${studentObjectId.toString()}`);
    
    try {
      // Query the clubattendances collection directly with ObjectIds
      // Both clubId and studentId are stored as ObjectId types in the collection
      let attendance = await this.clubAttendanceModel.find({ 
        clubId: clubObjectId,  // ObjectId matching
        studentId: studentObjectId  // ObjectId matching (references User table with role STUDENT)
      })
        .populate('clubId', 'name type')
        .populate('studentId', 'firstName lastName email studentId gradeLevel')
        .populate('recordedBy', 'firstName lastName')
        .sort({ meetingDate: -1 })
        .lean()
        .exec();
      
      console.log(`[getStudentAttendance] Direct ObjectId query found ${attendance?.length || 0} records`);
      
      // Debug: If no results, check what's actually in the collection
      if (!attendance || attendance.length === 0) {
        console.log(`[getStudentAttendance] ⚠️ No records found. Checking clubattendances collection...`);
        
        // Query all records for this club to see what studentIds exist
        const allClubRecords = await this.clubAttendanceModel.find({ 
          clubId: clubObjectId 
        })
          .select('studentId clubId meetingDate status _id')
          .lean()
          .exec();
        
        console.log(`[getStudentAttendance] Total records in clubattendances for clubId ${clubObjectId.toString()}: ${allClubRecords.length}`);
        
        if (allClubRecords.length > 0) {
          // Get all unique studentIds (User _id) stored in attendance records
          const studentIdsInCollection = allClubRecords.map((r: any) => {
            if (r.studentId) {
              return r.studentId.toString();
            }
            return null;
          }).filter(Boolean);
          
          const uniqueStudentIds = [...new Set(studentIdsInCollection)];
          console.log(`[getStudentAttendance] Student IDs (User _id) stored in clubattendances:`, uniqueStudentIds);
          console.log(`[getStudentAttendance] Looking for studentId (User _id): ${studentObjectId.toString()}`);
          console.log(`[getStudentAttendance] Match exists in collection: ${uniqueStudentIds.includes(studentObjectId.toString())}`);
          
          // Show sample records
          console.log(`[getStudentAttendance] Sample records from collection:`, allClubRecords.slice(0, 3).map((r: any) => ({
            _id: r._id?.toString(),
            clubId: r.clubId?.toString(),
            studentId: r.studentId?.toString(),
            status: r.status,
            meetingDate: r.meetingDate
          })));
          
          // If studentId exists in collection but query didn't find it, try manual filter
          if (uniqueStudentIds.includes(studentObjectId.toString())) {
            console.log(`[getStudentAttendance] StudentId exists in collection but query didn't find it. Using manual filter...`);
            
            // Filter records manually and then populate
            const matchingRecords = allClubRecords.filter((r: any) => {
              return r.studentId && r.studentId.toString() === studentObjectId.toString();
            });
            
            if (matchingRecords.length > 0) {
              const recordIds = matchingRecords.map((r: any) => r._id);
              attendance = await this.clubAttendanceModel.find({ 
                _id: { $in: recordIds }
              })
                .populate('clubId', 'name type')
                .populate('studentId', 'firstName lastName email studentId gradeLevel')
                .populate('recordedBy', 'firstName lastName')
                .sort({ meetingDate: -1 })
                .lean()
                .exec();
              
              console.log(`[getStudentAttendance] Found ${attendance?.length || 0} records after manual filter and populate`);
            }
          }
        }
      }
      
      console.log(`[getStudentAttendance] Found ${attendance?.length || 0} records for clubId: ${clubId}, studentId: ${studentId}`);
      if (attendance && attendance.length > 0) {
        console.log(`[getStudentAttendance] Sample record:`, {
          _id: attendance[0]._id,
          status: attendance[0].status,
          meetingDate: attendance[0].meetingDate,
          studentIdFromRecord: attendance[0].studentId?._id || attendance[0].studentId
        });
        
        // Format attendance records to ensure they have the right structure
        const formattedAttendance = attendance.map((record: any) => ({
          _id: record._id,
          meetingDate: record.meetingDate,
          date: record.meetingDate, // Also include as 'date' for frontend compatibility
          status: record.status,
          notes: record.notes,
          clubId: record.clubId?._id || record.clubId,
          studentId: record.studentId?._id || record.studentId,
          recordedBy: record.recordedBy?._id || record.recordedBy,
          schoolId: record.schoolId || null,
          meetingTopic: record.meetingTopic || null
        })) as ClubAttendance[];
        
        console.log(`[getStudentAttendance] Returning ${formattedAttendance.length} formatted records`);
        return formattedAttendance;
      } else {
        console.warn(`[getStudentAttendance] No attendance records found. Query was:`, {
          clubId: clubObjectId.toString(),
          studentId: studentObjectId.toString()
        });
      }
      
      return [];
    } catch (error) {
      console.error('[getStudentAttendance] Error querying attendance:', error);
      return [];
    }
  }

  async getAttendanceSummary(clubId: string, startDate: Date, endDate: Date): Promise<any> {
    const attendance = await this.clubAttendanceModel.find({
      clubId,
      meetingDate: { $gte: startDate, $lte: endDate }
    })
      .populate('studentId', 'firstName lastName')
      .exec();

    const summary = {
      totalMeetings: 0,
      totalAttendees: attendance.length,
      presentCount: attendance.filter(a => a.status === 'present').length,
      absentCount: attendance.filter(a => a.status === 'absent').length,
      excusedCount: attendance.filter(a => a.status === 'excused').length,
      attendanceRate: 0
    };

    if (summary.totalAttendees > 0) {
      summary.attendanceRate = Math.round((summary.presentCount / summary.totalAttendees) * 100);
    }

    return summary;
  }

  // Announcement methods
  async updateAnnouncement(announcementId: string, updateData: any, schoolId?: string, role?: string, createdBy?: string): Promise<ClubAnnouncement> {
    // Normalize message/content field
    if (updateData.message && !updateData.content) {
      updateData.content = updateData.message;
    }
    // Normalize priority/type field
    if (updateData.priority && !updateData.type) {
      updateData.type = updateData.priority;
    }
    // Normalize scheduledFor/eventDate field
    if (updateData.scheduledFor && !updateData.eventDate) {
      updateData.eventDate = updateData.scheduledFor;
    }

    // Convert announcementId to ObjectId
    if (!Types.ObjectId.isValid(announcementId)) {
      throw new BadRequestException('Invalid announcement ID format');
    }
    const announcementObjectId = new Types.ObjectId(announcementId);

    const filter: any = { _id: announcementObjectId };
    if (schoolId) {
      // Convert schoolId to ObjectId if provided
      if (Types.ObjectId.isValid(schoolId)) {
        filter.schoolId = new Types.ObjectId(schoolId);
      } else {
        filter.schoolId = schoolId;
      }
    }

    const announcement = await this.clubAnnouncementModel.findOneAndUpdate(
      filter,
      updateData,
      { new: true }
    );

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // create activity
    await this.activityModel.create({
      title: 'Announcement Updated',
      subtitle: `Announcement ${announcement.title} was updated`,
      performBy: role,
      actorId: new Types.ObjectId(createdBy),
      adminId: new Types.ObjectId(createdBy)
    });

    return announcement;
  }

  async deleteAnnouncement(announcementId: string, schoolId?: string, role?: string, createdBy?: string): Promise<{ message: string }> {
    // Convert announcementId to ObjectId
    if (!Types.ObjectId.isValid(announcementId)) {
      throw new BadRequestException('Invalid announcement ID format');
    }
    const announcementObjectId = new Types.ObjectId(announcementId);

    const filter: any = { _id: announcementObjectId };
    if (schoolId) {
      // Convert schoolId to ObjectId if provided
      if (Types.ObjectId.isValid(schoolId)) {
        filter.schoolId = new Types.ObjectId(schoolId);
      } else {
        filter.schoolId = schoolId;
      }
    }

    const announcement = await this.clubAnnouncementModel.findOneAndUpdate(
      filter,
      { isActive: false },
      { new: true }
    );

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // create activity
    await this.activityModel.create({
      title: 'Announcement Deleted',
      subtitle: `Announcement ${announcement.title} was deleted`,
      performBy: role,
      actorId: new Types.ObjectId(announcement.createdBy),
      adminId: new Types.ObjectId(announcement.createdBy)
    });
    return { message: 'Announcement deleted successfully' };
  }

  async getParticipationReport(clubId: string, startDate: Date, endDate: Date): Promise<any> {
    const club = await this.clubModel.findById(clubId);
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const members = await this.clubMembershipModel.find({
      clubId,
      status: 'approved',
      isActive: true
    }).populate('studentId', 'firstName lastName');

    const attendance = await this.clubAttendanceModel.find({
      clubId,
      meetingDate: { $gte: startDate, $lte: endDate }
    });

    const report = {
      clubName: club.name,
      reportPeriod: { startDate, endDate },
      totalMembers: members.length,
      totalMeetings: [...new Set(attendance.map(a => a.meetingDate.toDateString()))].length,
      memberParticipation: members.map(member => {
        const memberAttendance = attendance.filter(a => a.studentId.toString() === (member.studentId as any)._id.toString());
        const presentCount = memberAttendance.filter(a => a.status === 'present').length;
        const totalMeetings = memberAttendance.length;

        return {
          studentName: `${(member.studentId as any).firstName} ${(member.studentId as any).lastName}`,
          role: member.role,
          attendanceRate: totalMeetings > 0 ? Math.round((presentCount / totalMeetings) * 100) : 0,
          presentCount,
          totalMeetings
        };
      })
    };

    return report;
  }

  async getSchoolClubAnalytics(schoolId: string, range: string = '30d'): Promise<any> {
    // Parse range parameter (e.g., '30d', '7d', '90d', '1y')
    const parseRange = (rangeStr: string): number => {
      const match = rangeStr.match(/^(\d+)([dwmy])$/i);
      if (!match) return 30; // Default to 30 days

      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();

      switch (unit) {
        case 'd': return value; // days
        case 'w': return value * 7; // weeks to days
        case 'm': return value * 30; // months to days (approximate)
        case 'y': return value * 365; // years to days
        default: return 30;
      }
    };

    const daysBack = parseRange(range);

    // Convert schoolId to ObjectId if it's a valid string
    const schoolIdObj = Types.ObjectId.isValid(schoolId)
      ? (typeof schoolId === 'string' ? new Types.ObjectId(schoolId) : schoolId)
      : schoolId;

    // Get all active clubs with advisor information
    const clubs = await this.clubModel.find({ schoolId: schoolIdObj, isActive: true })
      .populate('advisorId', 'firstName lastName email')
      .lean();

    // Get all active memberships with student and club details
    const memberships = await this.clubMembershipModel.find({
      schoolId: schoolIdObj,
      status: 'approved',
      isActive: true
    }).populate('studentId', 'firstName lastName email');

    // Calculate total active members
    const totalMembers = memberships.length;

    // Calculate members by club
    const membersByClub = memberships.reduce((acc, membership) => {
      const clubId = membership.clubId.toString();
      acc[clubId] = (acc[clubId] || 0) + 1;
      return acc;
    }, {});

    // Enrich clubs with member counts and other metrics
    const enrichedClubs = clubs.map(club => ({
      ...club,
      memberCount: membersByClub[club._id.toString()] || 0
    }));

    // Calculate clubs by type with member counts
    const clubsByType = clubs.reduce((acc, club) => {
      if (!acc[club.type]) {
        acc[club.type] = { count: 0, members: 0 };
      }
      acc[club.type].count += 1;
      acc[club.type].members += membersByClub[club._id.toString()] || 0;
      return acc;
    }, {});

    // Find most popular club type by member count
    const mostPopularType = Object.entries(clubsByType)
      .sort(([, a]: [string, any], [, b]: [string, any]) => b.members - a.members)[0]?.[0] || 'N/A';

    // Get attendance data for the specified range
    const rangeStartDate = new Date();
    rangeStartDate.setDate(rangeStartDate.getDate() - daysBack);

    const attendanceData = await this.clubAttendanceModel.aggregate([
      {
        $match: {
          schoolId: schoolIdObj,
          meetingDate: { $gte: rangeStartDate },
          status: { $in: ['present', 'absent', 'late', 'excused'] }
        }
      },
      {
        $group: {
          _id: '$clubId',
          totalMeetings: { $sum: 1 },
          presentCount: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          uniqueStudents: { $addToSet: '$studentId' },
          lastMeetingDate: { $max: '$meetingDate' },
          meetingCount: { $sum: 1 }
        }
      }
    ]);

    // Create map of clubId -> attendance stats
    const attendanceMap = new Map(attendanceData.map(d => [d._id.toString(), d]));

    // Calculate performance metrics for each club
    const clubPerformance = enrichedClubs.map(club => {
      const clubId = club._id.toString();
      const memberCount = membersByClub[clubId] || 0;
      const attendance = attendanceMap.get(clubId) || {
        presentCount: 0,
        totalMeetings: 0,
        uniqueStudents: [],
        meetingCount: 0,
        lastMeetingDate: null
      };

      const participationRate = memberCount > 0
        ? Math.round((attendance.uniqueStudents.length / memberCount) * 100)
        : 0;

      const attendanceRate = attendance.totalMeetings > 0
        ? Math.round((attendance.presentCount / attendance.totalMeetings) * 100)
        : 0;

      // Calculate activity level based on meetings in last 30 days
      let activityLevel = 'Low';
      if (attendance.meetingCount >= 4) activityLevel = 'High';
      else if (attendance.meetingCount >= 2) activityLevel = 'Medium';

      return {
        clubId: club._id,
        name: club.name,
        type: club.type,
        memberCount,
        meetingCount: attendance.meetingCount,
        lastMeetingDate: attendance.lastMeetingDate,
        participationRate,
        attendanceRate,
        activityLevel,
        performanceScore: Math.round((participationRate + attendanceRate) / 2)
      };
    });

    // Sort clubs by performance score (descending)
    const sortedClubs = [...clubPerformance].sort((a, b) => b.performanceScore - a.performanceScore);

    // Get top 5 performing clubs
    const topPerformingClubs = sortedClubs.slice(0, 5);

    // Calculate membership trends for the last 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const membershipTrends = await this.clubMembershipModel.aggregate([
      {
        $match: {
          schoolId: schoolIdObj,
          status: 'approved',
          isActive: true,
          joinedDate: { $gte: twelveMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$joinedDate' },
            month: { $month: '$joinedDate' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Calculate average club size (median instead of mean for better representation)
    const memberCounts: number[] = (Object.values(membersByClub) as number[]).sort((a: number, b: number) => a - b);
    const mid = Math.floor(memberCounts.length / 2);
    const averageClubSize: number = memberCounts.length > 0
      ? memberCounts.length % 2 !== 0
        ? memberCounts[mid] as number
        : ((memberCounts[mid - 1] as number) + (memberCounts[mid] as number)) / 2
      : 0;

    // Calculate overall participation rate across all clubs
    const totalUniqueParticipants = new Set(
      attendanceData.flatMap(d => d.uniqueStudents)
    ).size;

    const overallParticipationRate = totalMembers > 0
      ? Math.round((totalUniqueParticipants / totalMembers) * 100)
      : 0;

    return {
      // Summary metrics
      totalClubs: enrichedClubs.length,
      totalMembers,
      averageClubSize: Math.round(Number(averageClubSize) * 100) / 100, // Round to 2 decimal places
      overallParticipationRate,
      mostPopularType,

      // Detailed breakdowns
      clubsByType: Object.entries(clubsByType).map(([type, data]: [string, any]) => ({
        type,
        count: data.count,
        members: data.members,
        avgMembersPerClub: Math.round((data.members / data.count) * 100) / 100
      })),

      // Performance metrics
      topPerformingClubs,

      // Time-based metrics
      membershipTrends: membershipTrends.map(t => ({
        month: `${String(t._id.month).padStart(2, '0')}/${t._id.year}`,
        memberships: t.count
      })),

      // Activity metrics
      activeClubs: clubPerformance.filter(c => c.meetingCount > 0).length,
      inactiveClubs: clubPerformance.filter(c => c.meetingCount === 0).length,

      // Additional metrics
      clubsByActivityLevel: {
        high: clubPerformance.filter(c => c.activityLevel === 'High').length,
        medium: clubPerformance.filter(c => c.activityLevel === 'Medium').length,
        low: clubPerformance.filter(c => c.activityLevel === 'Low').length
      },

      // Raw data for additional processing if needed
      _raw: {
        clubs: enrichedClubs,
        memberships,
        attendance: attendanceData
      }
    };
  }

  // ==================== PARENT NOTIFICATIONS ====================

  async notifyParentsOfAbsence(clubId: string, studentId: string, date: Date, notifiedBy: string): Promise<any> {
    try {
      // Get club and student information
      const club = await this.clubModel.findById(clubId).populate('advisorId', 'firstName lastName');
      if (!club) {
        throw new NotFoundException('Club not found');
      }

      const student = await this.userModel.findById(studentId);
      if (!student) {
        throw new NotFoundException('Student not found');
      }

      // Get parent information
      const parentIds = student.parentIds || [];
      if (parentIds.length === 0 && !student.guardianEmail) {
        return {
          success: false,
          message: 'No parent or guardian email found for student',
          notificationSent: false
        };
      }

      // Prepare email content
      const studentName = `${student.firstName} ${student.lastName}`;
      const clubName = club.name;
      const meetingDate = new Date(date).toLocaleDateString();
      const advisorName = club.advisorId
        ? `${(club.advisorId as any).firstName} ${(club.advisorId as any).lastName}`
        : 'Club Advisor';

      // Send emails to parents
      const emailPromises: Promise<boolean>[] = [];

      // Send to parent emails
      for (const parentId of parentIds) {
        const parent = await this.userModel.findById(parentId);
        if (parent && parent.email) {
          emailPromises.push(
            this.emailService.sendEmail(
              parent.email,
              `Club Absence Notification - ${studentName}`,
              `Dear ${parent.firstName || 'Parent'},\n\n` +
              `This is to inform you that ${studentName} was marked as absent from the ${clubName} club meeting on ${meetingDate}.\n\n` +
              `Club: ${clubName}\n` +
              `Meeting Date: ${meetingDate}\n` +
              `Advisor: ${advisorName}\n\n` +
              `If you have any questions or concerns, please contact the club advisor or school administration.\n\n` +
              `Best regards,\nSchool Administration`,
              `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #667eea;">Club Absence Notification</h2>
                <p>Dear ${parent.firstName || 'Parent'},</p>
                <p>This is to inform you that <strong>${studentName}</strong> was marked as <strong style="color: #dc2626;">absent</strong> from the <strong>${clubName}</strong> club meeting on <strong>${meetingDate}</strong>.</p>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Club:</strong> ${clubName}</p>
                  <p style="margin: 5px 0;"><strong>Meeting Date:</strong> ${meetingDate}</p>
                  <p style="margin: 5px 0;"><strong>Advisor:</strong> ${advisorName}</p>
                </div>
                <p>If you have any questions or concerns, please contact the club advisor or school administration.</p>
                <p>Best regards,<br>School Administration</p>
              </div>`
            )
          );
        }
      }

      // Send to guardian email if available
      if (student.guardianEmail) {
        emailPromises.push(
          this.emailService.sendEmail(
            student.guardianEmail,
            `Club Absence Notification - ${studentName}`,
            `Dear ${student.guardianName || 'Guardian'},\n\n` +
            `This is to inform you that ${studentName} was marked as absent from the ${clubName} club meeting on ${meetingDate}.\n\n` +
            `Club: ${clubName}\n` +
            `Meeting Date: ${meetingDate}\n` +
            `Advisor: ${advisorName}\n\n` +
            `If you have any questions or concerns, please contact the club advisor or school administration.\n\n` +
            `Best regards,\nSchool Administration`,
            `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #667eea;">Club Absence Notification</h2>
              <p>Dear ${student.guardianName || 'Guardian'},</p>
              <p>This is to inform you that <strong>${studentName}</strong> was marked as <strong style="color: #dc2626;">absent</strong> from the <strong>${clubName}</strong> club meeting on <strong>${meetingDate}</strong>.</p>
              <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Club:</strong> ${clubName}</p>
                <p style="margin: 5px 0;"><strong>Meeting Date:</strong> ${meetingDate}</p>
                <p style="margin: 5px 0;"><strong>Advisor:</strong> ${advisorName}</p>
              </div>
              <p>If you have any questions or concerns, please contact the club advisor or school administration.</p>
              <p>Best regards,<br>School Administration</p>
            </div>`
          )
        );
      }

      const results = await Promise.allSettled(emailPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;

      return {
        success: successCount > 0,
        message: `Notifications sent to ${successCount} parent(s)/guardian(s)`,
        notificationSent: successCount > 0,
        totalRecipients: emailPromises.length,
        successfulSends: successCount,
        clubId,
        studentId,
        date,
        notifiedBy
      };
    } catch (error) {
      console.error('Error notifying parents of absence:', error);
      throw new BadRequestException('Failed to notify parents of absence: ' + error.message);
    }
  }

  async notifyMembersOfAnnouncement(clubId: string, announcementId: string, notifiedBy: string): Promise<any> {
    try {
      console.log(`\n📢 ========== CLUB ANNOUNCEMENT EMAIL NOTIFICATION ==========`);
      console.log(`📋 Club ID: ${clubId}`);
      console.log(`📋 Announcement ID: ${announcementId}`);
      console.log(`📋 Notified By: ${notifiedBy}`);

      // Get announcement details
      const announcement = await this.clubAnnouncementModel.findById(announcementId).populate('clubId', 'name').lean();
      if (!announcement) {
        console.error(`❌ Announcement not found with ID: ${announcementId}`);
        throw new NotFoundException('Announcement not found');
      }

      // Convert clubId to ObjectId if it's a string
      const clubIdObj = Types.ObjectId.isValid(clubId) ? new Types.ObjectId(clubId) : clubId;
      const club = await this.clubModel.findById(clubIdObj).lean();
      if (!club) {
        console.error(`❌ Club not found with ID: ${clubId}`);
        throw new NotFoundException('Club not found');
      }

      const targetAudience = (announcement as any).targetAudience || 'members';
      const notifyParents = (announcement as any).notifyParents || false;
      
      console.log(`🎯 Target Audience: ${targetAudience}`);
      console.log(`📧 Notify Parents: ${notifyParents}`);
      console.log(`📝 Announcement Title: ${(announcement as any).title}`);
      console.log(`🏫 Club Name: ${(club as any).name}`);

      // Get ALL assigned students to the club (not just approved)
      // Include all members except those with 'rejected' or 'withdrawn' status
      // This matches the club assignments page logic
      const members = await this.clubMembershipModel
        .find({ 
          clubId: clubIdObj, 
          status: { $nin: ['rejected', 'withdrawn'] }, // Exclude only rejected and withdrawn
          isActive: { $ne: false } // Include all except explicitly set to false
        })
        .populate('studentId', 'firstName lastName email parentIds')
        .exec();

      console.log(`👥 Total Active Club Members: ${members.length}`);

      if (members.length === 0) {
        console.log(`⚠️ No active members found. No emails will be sent.`);
      return {
        success: true,
          message: 'No active members to notify',
          notificationsSent: 0,
          clubId,
          announcementId
        };
      }

      // Collect student emails and parent IDs
      const studentEmails: Array<{ email: string; firstName: string; lastName: string }> = [];
      const parentIds = new Set<string>();
      const studentParentMap = new Map<string, string[]>(); // studentId -> parentIds[]

      members.forEach(member => {
        const student = member.studentId as any;
        if (student && student._id) {
          const studentIdStr = student._id.toString();
          const studentEmail = student.email;
          const studentFirstName = student.firstName || '';
          const studentLastName = student.lastName || '';

          // Collect student email if available
          if (studentEmail) {
            studentEmails.push({
              email: studentEmail,
              firstName: studentFirstName,
              lastName: studentLastName
            });
            console.log(`📧 Student Email Found: ${studentEmail} (${studentFirstName} ${studentLastName})`);
          } else {
            console.log(`⚠️ Student ${studentFirstName} ${studentLastName} (ID: ${studentIdStr}) has no email`);
          }

          // Collect parent IDs
          if (student.parentIds && Array.isArray(student.parentIds)) {
            const studentParentIds: string[] = [];
            student.parentIds.forEach((parentId: any) => {
              const parentIdStr = parentId.toString ? parentId.toString() : parentId._id ? parentId._id.toString() : parentId;
              if (parentIdStr) {
                parentIds.add(parentIdStr);
                studentParentIds.push(parentIdStr);
              }
            });
            studentParentMap.set(studentIdStr, studentParentIds);
            if (studentParentIds.length > 0) {
              console.log(`👨‍👩‍👧 Student ${studentFirstName} ${studentLastName} has ${studentParentIds.length} parent(s)`);
            }
          }
        }
      });

      console.log(`\n📊 EMAIL RECIPIENT SUMMARY:`);
      console.log(`   - Students with emails: ${studentEmails.length}`);
      console.log(`   - Unique parent IDs: ${parentIds.size}`);

      // Get parent details
      const parents = await this.userModel
        .find({ _id: { $in: Array.from(parentIds).map(id => new Types.ObjectId(id)) }, role: 'PARENT', isActive: true })
        .select('email firstName lastName')
        .lean();

      console.log(`   - Active parents found: ${parents.length}`);
      const parentsWithEmail = parents.filter(p => p.email);
      console.log(`   - Parents with emails: ${parentsWithEmail.length}`);

      // Determine who should receive emails based on targetAudience AND notifyParents
      // If targetAudience is 'members' → only students
      // If targetAudience includes parents OR notifyParents is true → both students and parents
      const shouldNotifyStudents = targetAudience === 'members' || targetAudience === 'parent and member' || targetAudience === 'parents and members' || targetAudience === 'members and parents' || targetAudience === 'all' || notifyParents;
      const shouldNotifyParents = notifyParents || targetAudience === 'parent and member' || targetAudience === 'parents and members' || targetAudience === 'members and parents' || targetAudience === 'parents' || targetAudience === 'all';

      console.log(`\n📨 EMAIL SENDING PLAN:`);
      console.log(`   - Send to Students: ${shouldNotifyStudents ? 'YES' : 'NO'}`);
      console.log(`   - Send to Parents: ${shouldNotifyParents ? 'YES' : 'NO'}`);

      let studentEmailsSent = 0;
      let parentEmailsSent = 0;
      const emailPromises: Promise<boolean>[] = [];

      // Send emails to students if targetAudience includes members
      if (shouldNotifyStudents && studentEmails.length > 0) {
        console.log(`\n📧 SENDING EMAILS TO STUDENTS (${studentEmails.length} recipients):`);
        studentEmails.forEach((student) => {
          emailPromises.push(
            (async () => {
              try {
                const subject = `New Club Announcement: ${(announcement as any).title}`;
                const html = this.generateAnnouncementEmailTemplate(
                  student.firstName || 'Student',
                  (club as any).name || 'Club',
                  (announcement as any).title || '',
                  (announcement as any).content || ''
                );
                const text = this.generateAnnouncementEmailText(
                  student.firstName || 'Student',
                  (club as any).name || 'Club',
                  (announcement as any).title || '',
                  (announcement as any).content || ''
                );
                
                console.log(`   📤 Sending email to student: ${student.email} (${student.firstName} ${student.lastName})`);
                const sent = await this.emailService.sendEmail(student.email, subject, text, html);
                if (sent) {
                  studentEmailsSent++;
                  console.log(`   ✅ Email sent successfully to student: ${student.email}`);
                } else {
                  console.log(`   ❌ Failed to send email to student: ${student.email}`);
                }
                return sent;
              } catch (error) {
                console.error(`   ❌ Error sending email to student ${student.email}:`, error);
                return false;
              }
            })()
          );
        });
      } else if (shouldNotifyStudents) {
        console.log(`⚠️ Target audience includes students but no student emails found.`);
      }

      // Send emails to parents if targetAudience includes parents
      if (shouldNotifyParents && parentsWithEmail.length > 0) {
        console.log(`\n📧 SENDING EMAILS TO PARENTS (${parentsWithEmail.length} recipients):`);
        parentsWithEmail.forEach((parent) => {
          emailPromises.push(
            (async () => {
              try {
                const subject = `New Club Announcement: ${(announcement as any).title}`;
                const html = this.generateAnnouncementEmailTemplate(
                  parent.firstName || 'Parent',
                  (club as any).name || 'Club',
                  (announcement as any).title || '',
                  (announcement as any).content || ''
                );
                const text = this.generateAnnouncementEmailText(
                  parent.firstName || 'Parent',
                  (club as any).name || 'Club',
                  (announcement as any).title || '',
                  (announcement as any).content || ''
                );
                
                console.log(`   📤 Sending email to parent: ${parent.email} (${parent.firstName} ${parent.lastName})`);
                const sent = await this.emailService.sendEmail(parent.email, subject, text, html);
                if (sent) {
                  parentEmailsSent++;
                  console.log(`   ✅ Email sent successfully to parent: ${parent.email}`);
                } else {
                  console.log(`   ❌ Failed to send email to parent: ${parent.email}`);
                }
                return sent;
              } catch (error) {
                console.error(`   ❌ Error sending email to parent ${parent.email}:`, error);
                return false;
              }
            })()
          );
        });
      } else if (shouldNotifyParents) {
        console.log(`⚠️ Target audience includes parents but no parent emails found.`);
      }

      await Promise.all(emailPromises);

      const totalEmailsSent = studentEmailsSent + parentEmailsSent;
      console.log(`\n📊 EMAIL SENDING SUMMARY:`);
      console.log(`   ✅ Student emails sent: ${studentEmailsSent} / ${shouldNotifyStudents ? studentEmails.length : 0}`);
      console.log(`   ✅ Parent emails sent: ${parentEmailsSent} / ${shouldNotifyParents ? parentsWithEmail.length : 0}`);
      console.log(`   ✅ Total emails sent: ${totalEmailsSent}`);
      console.log(`📢 ========== END EMAIL NOTIFICATION ==========\n`);

      return {
        success: true,
        message: `Email notifications sent: ${studentEmailsSent} student(s), ${parentEmailsSent} parent(s)`,
        notificationsSent: totalEmailsSent,
        studentEmailsSent,
        parentEmailsSent,
        totalStudents: studentEmails.length,
        totalParents: parentsWithEmail.length,
        targetAudience,
        clubId,
        announcementId,
        notifiedBy
      };
    } catch (error) {
      console.error('❌ Error notifying members of announcement:', error);
      console.error('❌ Error stack:', error?.stack);
      throw new BadRequestException('Failed to notify members of announcement: ' + (error?.message || 'Unknown error'));
    }
  }

  /**
   * Notify club members (parents and students) of a new event
   */
  async notifyMembersOfEvent(clubId: string, eventId: string, club?: any): Promise<any> {
    try {
      // Get event details if not provided
      let event: any;
      if (!eventId) {
        throw new BadRequestException('Event ID is required');
      }
      event = await this.clubEventModel.findById(eventId).lean();
      if (!event) {
        throw new NotFoundException('Event not found');
      }

      // Get club details if not provided
      let clubData: any;
      if (!club) {
        clubData = await this.clubModel.findById(clubId).lean();
      } else {
        clubData = club;
      }
      if (!clubData) {
        throw new NotFoundException('Club not found');
      }

      // Get ALL assigned students to the club (not just approved)
      // Include all members except those with 'rejected' or 'withdrawn' status
      // This matches the club assignments page logic and announcement notification logic
      const members = await this.clubMembershipModel
        .find({ 
          clubId: new Types.ObjectId(clubId), 
          status: { $nin: ['rejected', 'withdrawn'] }, // Exclude only rejected and withdrawn
          isActive: { $ne: false } // Include all except explicitly set to false
        })
        .populate('studentId', 'firstName lastName email parentIds')
        .exec();
      
      console.log(`\n📢 ========== CLUB EVENT EMAIL NOTIFICATION ==========`);
      console.log(`📋 Club ID: ${clubId}`);
      console.log(`📋 Event ID: ${eventId}`);
      console.log(`📋 Event Name: ${event.name || 'Club Event'}`);
      console.log(`👥 Total Active Club Members: ${members.length}`);

      if (members.length === 0) {
        return {
          success: true,
          message: 'No active members to notify',
          notificationsSent: 0,
          clubId,
          eventId
        };
      }

      // Get all unique parent IDs and student IDs
      const parentIds = new Set<string>();
      const studentEmails: Array<{ email: string; firstName: string; lastName: string }> = [];
      
      members.forEach(member => {
        const student = member.studentId as any;
        if (student && student._id) {
          const studentEmail = student.email;
          const studentFirstName = student.firstName || '';
          const studentLastName = student.lastName || '';
          
          // Collect student email if available
          if (studentEmail) {
            studentEmails.push({
              email: studentEmail,
              firstName: studentFirstName,
              lastName: studentLastName
            });
            console.log(`📧 Student Email Found: ${studentEmail} (${studentFirstName} ${studentLastName})`);
          } else {
            console.log(`⚠️ Student ${studentFirstName} ${studentLastName} (ID: ${student._id.toString()}) has no email`);
          }
          
          // Collect parent IDs
          if (student.parentIds && Array.isArray(student.parentIds)) {
            student.parentIds.forEach((parentId: any) => {
              const parentIdStr = parentId.toString ? parentId.toString() : parentId._id ? parentId._id.toString() : parentId;
              if (parentIdStr) {
                parentIds.add(parentIdStr);
              }
            });
            if (student.parentIds.length > 0) {
              console.log(`👨‍👩‍👧 Student ${studentFirstName} ${studentLastName} has ${student.parentIds.length} parent(s)`);
            }
          }
        }
      });

      console.log(`\n📊 EMAIL RECIPIENT SUMMARY:`);
      console.log(`   - Students with emails: ${studentEmails.length}`);
      console.log(`   - Unique parent IDs: ${parentIds.size}`);

      // Get parent details
      const parents = await this.userModel
        .find({ _id: { $in: Array.from(parentIds).map(id => new Types.ObjectId(id)) }, role: 'PARENT', isActive: true })
        .select('email firstName lastName')
        .lean();
      
      console.log(`   - Active parents found: ${parents.length}`);
      const parentsWithEmail = parents.filter(p => p.email);
      console.log(`   - Parents with emails: ${parentsWithEmail.length}`);
      
      console.log(`\n📨 EMAIL SENDING PLAN:`);
      console.log(`   - Send to Students: YES (${studentEmails.length} recipients)`);
      console.log(`   - Send to Parents: YES (${parentsWithEmail.length} recipients)`);

      // Send email notifications to parents
      let parentEmailsSent = 0;
      const parentEmailPromises = parents.map(async (parent) => {
        if (parent.email) {
          try {
            const subject = `New Club Event: ${event.name || 'Club Event'}`;
            const html = this.generateEventEmailTemplate(
              parent.firstName || 'Parent',
              clubData.name || 'Club',
              event.name || 'Club Event',
              event.description || '',
              event.startDate ? new Date(event.startDate).toLocaleString() : 'TBA',
              event.endDate ? new Date(event.endDate).toLocaleString() : 'TBA',
              event.location || 'TBA',
              event.timeSlots || []
            );
            const text = this.generateEventEmailText(
              parent.firstName || 'Parent',
              clubData.name || 'Club',
              event.name || 'Club Event',
              event.description || '',
              event.startDate ? new Date(event.startDate).toLocaleString() : 'TBA',
              event.endDate ? new Date(event.endDate).toLocaleString() : 'TBA',
              event.location || 'TBA',
              event.timeSlots || []
            );
            
            console.log(`   📤 Sending email to parent: ${parent.email} (${parent.firstName} ${parent.lastName})`);
            const sent = await this.emailService.sendEmail(parent.email, subject, text, html);
            if (sent) {
              parentEmailsSent++;
              console.log(`   ✅ Email sent successfully to parent: ${parent.email}`);
            } else {
              console.log(`   ❌ Failed to send email to parent: ${parent.email}`);
            }
            return sent;
          } catch (error) {
            console.error(`   ❌ Error sending email to parent ${parent.email}:`, error);
            return false;
          }
        }
        return false;
      });

      // Send email notifications to students
      let studentEmailsSent = 0;
      console.log(`\n📧 SENDING EMAILS TO STUDENTS (${studentEmails.length} recipients):`);
      const studentEmailPromises = studentEmails.map(async (student) => {
        try {
          const subject = `New Club Event: ${event.name || 'Club Event'}`;
          const html = this.generateEventEmailTemplate(
            student.firstName || 'Student',
            clubData.name || 'Club',
            event.name || 'Club Event',
            event.description || '',
            event.startDate ? new Date(event.startDate).toLocaleString() : 'TBA',
            event.endDate ? new Date(event.endDate).toLocaleString() : 'TBA',
            event.location || 'TBA',
            event.timeSlots || []
          );
          const text = this.generateEventEmailText(
            student.firstName || 'Student',
            clubData.name || 'Club',
            event.name || 'Club Event',
            event.description || '',
            event.startDate ? new Date(event.startDate).toLocaleString() : 'TBA',
            event.endDate ? new Date(event.endDate).toLocaleString() : 'TBA',
            event.location || 'TBA',
            event.timeSlots || []
          );
          
          console.log(`   📤 Sending email to student: ${student.email} (${student.firstName} ${student.lastName})`);
          const sent = await this.emailService.sendEmail(student.email, subject, text, html);
          if (sent) {
            studentEmailsSent++;
            console.log(`   ✅ Email sent successfully to student: ${student.email}`);
          } else {
            console.log(`   ❌ Failed to send email to student: ${student.email}`);
          }
          return sent;
        } catch (error) {
          console.error(`   ❌ Error sending email to student ${student.email}:`, error);
          return false;
        }
      });

      await Promise.all([...parentEmailPromises, ...studentEmailPromises]);

      const totalEmailsSent = studentEmailsSent + parentEmailsSent;
      console.log(`\n📊 EMAIL SENDING SUMMARY:`);
      console.log(`   ✅ Student emails sent: ${studentEmailsSent} / ${studentEmails.length}`);
      console.log(`   ✅ Parent emails sent: ${parentEmailsSent} / ${parentsWithEmail.length}`);
      console.log(`   ✅ Total emails sent: ${totalEmailsSent}`);
      console.log(`📢 ========== END EMAIL NOTIFICATION ==========\n`);

      return {
        success: true,
        message: `Email notifications sent to ${parentEmailsSent} parent(s) and ${studentEmailsSent} student(s)`,
        notificationsSent: totalEmailsSent,
        parentEmailsSent,
        studentEmailsSent,
        totalParents: parentsWithEmail.length,
        totalStudents: studentEmails.length,
        clubId,
        eventId
      };
    } catch (error) {
      console.error('Error notifying members of event:', error);
      throw new BadRequestException('Failed to notify members of event: ' + (error?.message || 'Unknown error'));
    }
  }

  /**
   * Generate HTML email template for club announcements
   */
  private generateAnnouncementEmailTemplate(
    recipientName: string,
    clubName: string,
    announcementTitle: string,
    announcementContent: string
  ): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Club Announcement</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: #000000; padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Club Announcement</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${clubName}</p>
          </div>
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${recipientName}!</h2>
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              A new announcement has been posted for the <strong>${clubName}</strong> club.
            </p>
            <div style="background: #f8f9fa; border: 2px solid #000000; border-radius: 12px; padding: 25px; margin: 30px 0;">
              <h3 style="color: #333; margin-top: 0; font-size: 20px;">${announcementTitle}</h3>
              <div style="color: #666; line-height: 1.8; font-size: 16px; white-space: pre-wrap;">${announcementContent}</div>
            </div>
          </div>
          <div style="background: #f8f9fa; padding: 25px 30px; border-top: 1px solid #e9ecef; text-align: center;">
            <p style="color: #6c757d; font-size: 14px; margin: 0;">
              This is an automated message from the Student Revelation System. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text email for club announcements
   */
  private generateAnnouncementEmailText(
    recipientName: string,
    clubName: string,
    announcementTitle: string,
    announcementContent: string
  ): string {
    return `
Club Announcement - ${clubName}

Hello ${recipientName}!

A new announcement has been posted for the ${clubName} club.

Title: ${announcementTitle}

${announcementContent}

---
Student Revelation System
This is an automated message. Please do not reply.
    `;
  }

  /**
   * Generate HTML email template for club events
   */
  private generateEventEmailTemplate(
    recipientName: string,
    clubName: string,
    eventName: string,
    eventDescription: string,
    eventStartDate: string,
    eventEndDate: string,
    eventLocation: string,
    timeSlots: any[] = []
  ): string {
    // Format time slots if available
    let timeSlotsHtml = '';
    if (timeSlots && timeSlots.length > 0) {
      timeSlotsHtml = `
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
          <h4 style="color: #333; margin-bottom: 15px; font-size: 18px;">Schedule:</h4>
          <ul style="list-style: none; padding: 0; margin: 0;">
            ${timeSlots.map(slot => {
              const slotDate = slot.date ? new Date(slot.date).toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              }) : 'TBA';
              const slotTime = slot.startTime && slot.endTime 
                ? `${slot.startTime} - ${slot.endTime}` 
                : (slot.startTime || 'TBA');
              const slotDesc = slot.description ? ` - ${slot.description}` : '';
              return `
                <li style="margin-bottom: 10px; padding: 10px; background: #ffffff; border-left: 3px solid #000000;">
                  <strong>${slotDate}</strong><br>
                  <span style="color: #666;">Time: ${slotTime}${slotDesc}</span>
                </li>
              `;
            }).join('')}
          </ul>
        </div>
      `;
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Club Event</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: #000000; padding: 40px 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Club Event</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 18px;">${clubName}</p>
          </div>
          <div style="padding: 40px 30px;">
            <h2 style="color: #333; margin-top: 0; font-size: 24px;">Hello ${recipientName}!</h2>
            <p style="color: #666; line-height: 1.6; font-size: 16px;">
              A new event has been scheduled for the <strong>${clubName}</strong> club.
            </p>
            <div style="background: #f8f9fa; border: 2px solid #000000; border-radius: 12px; padding: 25px; margin: 30px 0;">
              <h3 style="color: #333; margin-top: 0; font-size: 20px;">${eventName}</h3>
              <div style="color: #666; line-height: 1.8; font-size: 16px; margin: 15px 0;">
                <p style="margin: 10px 0;"><strong>Start Date & Time:</strong> ${eventStartDate}</p>
                ${eventEndDate && eventEndDate !== 'TBA' ? `<p style="margin: 10px 0;"><strong>End Date & Time:</strong> ${eventEndDate}</p>` : ''}
                <p style="margin: 10px 0;"><strong>Location:</strong> ${eventLocation}</p>
                ${eventDescription ? `<div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6; white-space: pre-wrap;">${eventDescription}</div>` : ''}
                ${timeSlotsHtml}
              </div>
            </div>
          </div>
          <div style="background: #f8f9fa; padding: 25px 30px; border-top: 1px solid #e9ecef; text-align: center;">
            <p style="color: #6c757d; font-size: 14px; margin: 0;">
              This is an automated message from the Student Revelation System. Please do not reply to this email.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Generate plain text email for club events
   */
  private generateEventEmailText(
    recipientName: string,
    clubName: string,
    eventName: string,
    eventDescription: string,
    eventStartDate: string,
    eventEndDate: string,
    eventLocation: string,
    timeSlots: any[] = []
  ): string {
    // Format time slots if available
    let timeSlotsText = '';
    if (timeSlots && timeSlots.length > 0) {
      timeSlotsText = '\n\nSchedule:\n';
      timeSlots.forEach(slot => {
        const slotDate = slot.date ? new Date(slot.date).toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        }) : 'TBA';
        const slotTime = slot.startTime && slot.endTime 
          ? `${slot.startTime} - ${slot.endTime}` 
          : (slot.startTime || 'TBA');
        const slotDesc = slot.description ? ` - ${slot.description}` : '';
        timeSlotsText += `  • ${slotDate}: ${slotTime}${slotDesc}\n`;
      });
    }

    return `
Club Event - ${clubName}

Hello ${recipientName}!

A new event has been scheduled for the ${clubName} club.

Event: ${eventName}
Start Date & Time: ${eventStartDate}
${eventEndDate && eventEndDate !== 'TBA' ? `End Date & Time: ${eventEndDate}\n` : ''}Location: ${eventLocation}
${eventDescription ? `\nDescription:\n${eventDescription}` : ''}${timeSlotsText}

---
Student Revelation System
This is an automated message. Please do not reply.
    `;
  }

  // ==================== ATTENDANCE MANAGEMENT ====================

  async getClubsForAttendance(schoolId: string): Promise<Club[]> {
    return await this.clubModel
      .find({ schoolId, isActive: true })
      .select('name type meetingSchedule location advisorId')
      .populate('advisorId', 'firstName lastName')
      .sort({ name: 1 })
      .exec();
  }

  async getClubMembersForAttendance(clubId: string, schoolId: string): Promise<any[]> {
    // Convert schoolId to ObjectId if it's a valid string
    const schoolIdObj = Types.ObjectId.isValid(schoolId)
      ? (typeof schoolId === 'string' ? new Types.ObjectId(schoolId) : schoolId)
      : schoolId;

    // Verify club belongs to school
    const club = await this.clubModel.findOne({ _id: clubId, schoolId: schoolIdObj, isActive: true });
    if (!club) {
      throw new NotFoundException('Club not found in your school');
    }

    console.log('getClubMembersForAttendance called with:', { clubId, schoolId, schoolIdObj });

    // Get all assigned students to the club
    // Include all members except those with 'rejected' or 'withdrawn' status
    // Only include active members (isActive: true or not explicitly false)
    const members = await this.clubMembershipModel
      .find({
        clubId: new Types.ObjectId(clubId),
        schoolId: schoolIdObj,
        status: { $nin: ['rejected', 'withdrawn'] }, // Exclude only rejected and withdrawn
        isActive: { $ne: false } // Include all except explicitly set to false
      })
      .populate('studentId', 'firstName lastName studentId gradeLevel class email')
      .sort({ 'studentId.lastName': 1, 'studentId.firstName': 1 })
      .exec();

    console.log('getClubMembersForAttendance - Found members:', members.length);

    // Filter out any members with null studentId (in case of data issues)
    const validMembers = members.filter(member => member.studentId != null);

    return validMembers.map(member => ({
      membershipId: member._id,
      student: member.studentId,
      role: member.role,
      joinedDate: member.joinedDate
    }));
  }

  async recordAttendance(attendanceData: any, recordedBy: string, schoolId: string, role?: string | undefined): Promise<any> {

    console.log('clubId:', attendanceData.clubId)
    console.log('schoolId:', schoolId)

    // Verify club belongs to school
    const club = await this.clubModel.findOne({
      _id: new Types.ObjectId(attendanceData.clubId),
      schoolId: new Types.ObjectId(schoolId)
    });
    if (!club) {
      throw new NotFoundException('Club not found in your school');
    }

    // Validate and parse date
    if (!attendanceData.date) {
      throw new BadRequestException('Date is required');
    }

    const attendanceDate = new Date(attendanceData.date);
    if (isNaN(attendanceDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    // Create date range without mutating the original
    const startOfDay = new Date(attendanceDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(attendanceDate);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceRecords = [];

    for (const record of attendanceData.attendance) {
      // Check if attendance already recorded for this date
      const existingAttendance = await this.clubAttendanceModel.findOne({
        clubId: attendanceData.clubId,
        studentId: record.studentId,
        meetingDate: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      });

      if (existingAttendance) {
        // Update existing record
        const wasAbsent = existingAttendance.status === 'absent';
        existingAttendance.status = record.status;
        existingAttendance.notes = record.notes;
        existingAttendance.recordedBy = new Types.ObjectId(recordedBy);
        await existingAttendance.save();
        attendanceRecords.push(existingAttendance);

        // Notify parents if status changed to absent
        if (record.status === 'absent' && !wasAbsent) {
          try {
            await this.notifyParentsOfAbsence(
              attendanceData.clubId.toString(),
              record.studentId.toString(),
              new Date(attendanceData.date),
              recordedBy
            );
          } catch (notifyError) {
            console.error('Failed to notify parents of absence:', notifyError);
          }
        }
      } else {
        // Create new record - use startOfDay for consistency
        const attendance = new this.clubAttendanceModel({
          clubId: attendanceData.clubId,
          studentId: record.studentId,
          meetingDate: startOfDay, // Use startOfDay instead of raw date
          status: record.status,
          notes: record.notes || '',
          recordedBy: new Types.ObjectId(recordedBy),
          schoolId: Types.ObjectId.isValid(schoolId) ? new Types.ObjectId(schoolId) : schoolId
        });
        await attendance.save();
        attendanceRecords.push(attendance);

        // Auto-notify parents if student is absent
        if (record.status === 'absent') {
          try {
            await this.notifyParentsOfAbsence(
              attendanceData.clubId.toString(),
              record.studentId.toString(),
              new Date(attendanceData.date),
              recordedBy
            );
          } catch (notifyError) {
            console.error('Failed to notify parents of absence:', notifyError);
          }
        }
      }
    }

    // create activity
    await this.activityModel.create({
      title: 'Attendance Recorded',
      subtitle: `Attendance for club ${attendanceData.clubId} was recorded`,
      performBy: role,
      actorId: new Types.ObjectId(recordedBy),
      adminId: new Types.ObjectId(recordedBy)
    });
    
    return {
      success: true,
      recordsProcessed: attendanceRecords.length,
      clubId: attendanceData.clubId,
      date: attendanceData.date,
      recordedBy
    };
  }

  async getAllAttendanceSessions(schoolId: string, query?: { clubId?: string; search?: string }): Promise<any[]> {
    try {
      // Build query filter - convert schoolId to ObjectId if valid
      // For super-admin, schoolId can be empty string to fetch all sessions
      const filter: any = {};
      if (schoolId && schoolId !== '') {
        if (Types.ObjectId.isValid(schoolId)) {
          filter.schoolId = new Types.ObjectId(schoolId);
        } else {
          filter.schoolId = schoolId;
        }
      }
      // If schoolId is empty, don't filter by schoolId (fetch all)

      if (query?.clubId && Types.ObjectId.isValid(query.clubId)) {
        filter.clubId = new Types.ObjectId(query.clubId);
      }

      // Get all attendance records grouped by club and date
      let attendanceRecords = await this.clubAttendanceModel
        .find(filter)
        .populate('clubId', 'name type schoolId')
        .populate('schoolId', 'name')
        .sort({ meetingDate: -1 })
        .exec();

      // Filter out records with null or missing clubId
      attendanceRecords = attendanceRecords.filter((record: any) => {
        return record.clubId && (record.clubId as any)._id;
      });

      // Apply search filter if provided
      if (query?.search) {
        const searchLower = query.search.toLowerCase();
        attendanceRecords = attendanceRecords.filter((record: any) => {
          const clubName = (record.clubId as any)?.name?.toLowerCase() || '';
          return clubName.includes(searchLower);
        });
      }

      // Group by clubId and meetingDate
      const sessionsMap = new Map<string, any>();

      for (const record of attendanceRecords) {
        // Skip if clubId is null or not populated
        if (!record.clubId || !(record.clubId as any)._id) {
          continue;
        }

        const clubId = (record.clubId as any)._id.toString();
        const clubName = (record.clubId as any).name || 'Unknown Club';
        const clubSchoolId = (record.clubId as any).schoolId;
        const schoolName = (record.schoolId as any)?.name || (clubSchoolId?.name || 'N/A');
        const schoolIdValue = (record.schoolId as any)?._id?.toString() || (clubSchoolId?._id?.toString() || record.schoolId?.toString() || '');
        const dateKey = new Date(record.meetingDate).toISOString().split('T')[0];
        const sessionKey = `${clubId}-${dateKey}`;

        if (!sessionsMap.has(sessionKey)) {
          sessionsMap.set(sessionKey, {
            _id: sessionKey,
            clubId: clubId,
            clubName: clubName,
            schoolId: schoolIdValue,
            schoolName: schoolName,
            date: dateKey,
            totalMembers: 0,
            presentCount: 0,
            absentCount: 0,
            excusedCount: 0,
            lateCount: 0,
            attendanceRate: 0,
            status: 'closed'
          });
        }

        const session = sessionsMap.get(sessionKey);
        if (session) {
          session.totalMembers++;

          if (record.status === 'present') {
            session.presentCount++;
          } else if (record.status === 'absent') {
            session.absentCount++;
          } else if (record.status === 'excused') {
            session.excusedCount++;
          } else if (record.status === 'late') {
            session.lateCount++;
          }
        }
      }

      // Calculate attendance rates
      const sessions = Array.from(sessionsMap.values());
      sessions.forEach(session => {
        if (session.totalMembers > 0) {
          session.attendanceRate = Math.round((session.presentCount / session.totalMembers) * 100);
        }
      });

      return sessions;
    } catch (error) {
      console.error('Error fetching attendance sessions:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch attendance sessions: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  async getAttendanceSessionDetails(clubId: string, date: string, schoolId: string): Promise<any> {
    try {
      // Validate inputs
      if (!clubId || !Types.ObjectId.isValid(clubId)) {
        throw new BadRequestException('Invalid club ID format');
      }

      if (!date) {
        throw new BadRequestException('Date is required');
      }

      // Parse the date - Frontend sends YYYY-MM-DD format (e.g., "2024-01-15")
      let meetingDate: Date;
      const dateString = String(date).trim();

      console.log('getAttendanceSessionDetails - Received date:', dateString);

      // Frontend always sends YYYY-MM-DD format, so we expect that exact format
      if (!dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.error('Invalid date format received:', dateString, 'Expected: YYYY-MM-DD');
        throw new BadRequestException(`Invalid date format. Received: "${dateString}". Expected: YYYY-MM-DD format (e.g., 2024-01-15)`);
      }

      // Parse YYYY-MM-DD format
      const [year, month, day] = dateString.split('-').map(Number);

      // Validate date components
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
        throw new BadRequestException(`Invalid date values. Year: ${year}, Month: ${month}, Day: ${day}`);
      }

      // Create date in UTC to avoid timezone issues
      meetingDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

      if (isNaN(meetingDate.getTime())) {
        throw new BadRequestException(`Invalid date. Could not parse: "${dateString}"`);
      }

      console.log('Successfully parsed date:', dateString, '->', meetingDate.toISOString());

      // Create start and end of day without mutating the original date
      const startOfDay = new Date(meetingDate);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(meetingDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Get club details - convert schoolId to ObjectId if valid
      const clubSchoolId = Types.ObjectId.isValid(schoolId) ? new Types.ObjectId(schoolId) : schoolId;
      const club = await this.clubModel.findOne({ _id: clubId, schoolId: clubSchoolId, isActive: true })
        .populate('advisorId', 'firstName lastName email')
        .exec();

      if (!club) {
        throw new BadRequestException('Club not found');
      }

      // Get all attendance records for this club and date
      const attendanceRecords = await this.clubAttendanceModel
        .find({
          clubId: new Types.ObjectId(clubId),
          schoolId: clubSchoolId,
          meetingDate: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        })
        .populate('studentId', 'firstName lastName email gradeLevel class studentId')
        .populate('recordedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .exec();

      // Get all club members for reference - use same logic as getClubMembersForAttendance
      const allMembers = await this.clubMembershipModel
        .find({
          clubId: new Types.ObjectId(clubId),
          schoolId: clubSchoolId,
          status: { $nin: ['rejected', 'withdrawn'] }, // Exclude only rejected and withdrawn
          isActive: { $ne: false } // Include all except explicitly set to false
        })
        .populate('studentId', 'firstName lastName email gradeLevel class studentId')
        .exec();

      // Create a map of students who have attendance records
      const attendanceMap = new Map();
      attendanceRecords.forEach((record: any) => {
        const studentId = (record.studentId as any)?._id?.toString();
        if (studentId) {
          attendanceMap.set(studentId, {
            _id: record._id,
            studentId: record.studentId,
            status: record.status,
            notes: record.notes || '',
            recordedBy: record.recordedBy,
            createdAt: record.createdAt
          });
        }
      });

      // Build complete student list with attendance status
      const studentsWithAttendance = allMembers.map((member: any) => {
        const studentId = (member.studentId as any)?._id?.toString();
        const attendance = attendanceMap.get(studentId);

        return {
          student: member.studentId,
          role: member.role,
          attendance: attendance || null,
          status: attendance ? attendance.status : 'not_recorded'
        };
      });

      // Calculate summary
      const presentCount = attendanceRecords.filter((r: any) => r.status === 'present').length;
      const absentCount = attendanceRecords.filter((r: any) => r.status === 'absent').length;
      const excusedCount = attendanceRecords.filter((r: any) => r.status === 'excused').length;
      const lateCount = attendanceRecords.filter((r: any) => r.status === 'late').length;
      const totalMembers = allMembers.length;
      const attendanceRate = totalMembers > 0 ? Math.round((presentCount / totalMembers) * 100) : 0;

      return {
        club: {
          _id: club._id,
          name: club.name,
          type: club.type,
          advisor: club.advisorId
        },
        date: date,
        totalMembers,
        presentCount,
        absentCount,
        excusedCount,
        lateCount,
        attendanceRate,
        students: studentsWithAttendance,
        createdAt: attendanceRecords.length > 0 ? (attendanceRecords[0] as any).createdAt || null : null
      };
    } catch (error) {
      console.error('Error fetching attendance session details:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Failed to fetch attendance session details: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  async exportClubReport(schoolId: string, options: { format: string; type: string }): Promise<any> {
    try {
      const { format, type } = options;

      // Convert schoolId to ObjectId if it's a valid string
      const schoolIdObj = Types.ObjectId.isValid(schoolId)
        ? (typeof schoolId === 'string' ? new Types.ObjectId(schoolId) : schoolId)
        : schoolId;

      // Get clubs with membership data
      const clubs = await this.clubModel.find({ schoolId: schoolIdObj, isActive: true })
        .populate('advisorId', 'firstName lastName email')
        .exec();

      let reportData = [];
      let csvHeaders = [];
      let filename = '';

      // Generate different reports based on type
      if (type === 'activity') {
        // Activity Report: Club activities, events, and meeting schedules
        csvHeaders = ['Club Name', 'Type', 'Location', 'Frequency', 'Activities', 'Advisor', 'Status'];
        filename = `club-activity-report-${new Date().toISOString().split('T')[0]}.csv`;

        for (const club of clubs) {
          // Build meeting time from dayTimes if available, otherwise use schedule
          let meetingTime = 'Not Set';
          if (club.meetingSchedule?.dayTimes && Object.keys(club.meetingSchedule.dayTimes).length > 0) {
            const timeSlots = Object.entries(club.meetingSchedule.dayTimes).map(([day, times]: [string, any]) => {
              if (times?.startTime && times?.endTime) {
                return `${day}: ${times.startTime}-${times.endTime}`;
              }
              return null;
            }).filter(Boolean);
            meetingTime = timeSlots.length > 0 ? timeSlots.join('; ') : 'Not Set';
          } else if (club.meetingSchedule?.startTime && club.meetingSchedule?.endTime) {
            meetingTime = `${club.meetingSchedule.startTime}-${club.meetingSchedule.endTime}`;
          }

          reportData.push({
            clubName: club.name,
            clubType: club.type,
            location: club.location || 'Not Set',
            frequency: club.meetingSchedule?.frequency || 'Not Set',
            activities: club.activities?.join(', ') || 'None',
            advisor: club.advisorId ? `${(club.advisorId as any).firstName} ${(club.advisorId as any).lastName}` : 'No Advisor',
            status: club.isActive ? 'Active' : 'Inactive'
          });
        }
      } else if (type === 'membership') {
        csvHeaders = ['Club Name', 'Type', 'Student Name', 'Grade Level', 'Student ID', 'Role', 'Joined Date', 'Status', 'Advisor'];
        filename = `club-membership-report-${new Date().toISOString().split('T')[0]}.csv`;

        for (const club of clubs) {
          const members = await this.clubMembershipModel.find({
            clubId: club._id,
            schoolId: schoolIdObj,
            status: 'approved',
            isActive: true
          })
            .populate({
              path: 'studentId',
              select: 'firstName lastName studentId email gradeLevel class section',
              populate: { path: 'studentProfileId', select: 'firstName lastName gradeLevel', model: 'StudentProfile' }
            })
            .sort({ joinedDate: -1 })
            .exec();

          if (members.length === 0) {
            continue;
          }
          for (const member of members) {
            const student = member.studentId as any;
            const profile = student?.studentProfileId;
            const studentName = profile
              ? `${(profile as any).firstName || ''} ${(profile as any).lastName || ''}`.trim()
              : (student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown') || 'Unknown';
            const studentId = student?.studentId || student?._id?.toString() || 'N/A';
            const role = member.role || 'Member';
            const joinedDate = member.joinedDate
              ? new Date(member.joinedDate).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
              : 'N/A';
            const status = member.isActive ? 'Active' : (member.status === 'approved' ? 'Approved' : member.status || 'Inactive');
            const gradeLevel = (profile as any)?.gradeLevel ?? student?.gradeLevel ?? student?.class ?? student?.section ?? 'N/A';
            reportData.push({
              clubName: club.name || 'Unknown Club',
              clubType: club.type || 'N/A',
              studentName: studentName,
              gradeLevel: String(gradeLevel),
              studentId: studentId,
              role: role,
              joinedDate: joinedDate,
              status: status,
              advisor: club.advisorId ? `${(club.advisorId as any).firstName || ''} ${(club.advisorId as any).lastName || ''}`.trim() || 'No Advisor' : 'No Advisor'
            });
          }
        }
      } else if (type === 'performance') {
        // Performance Report: Attendance rates, participation, and performance metrics
        csvHeaders = ['Club Name', 'Type', 'Total Members', 'Max Members', 'Attendance Rate', 'Total Meetings (30 days)', 'Present Count', 'Absent Count', 'Participation Rate', 'Advisor'];
        filename = `club-performance-report-${new Date().toISOString().split('T')[0]}.csv`;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        for (const club of clubs) {
          const members = await this.clubMembershipModel.find({
            clubId: club._id,
            schoolId: schoolIdObj,
            status: 'approved',
            isActive: true
          });

          const attendance = await this.clubAttendanceModel.find({
            clubId: club._id,
            schoolId: schoolIdObj,
            meetingDate: { $gte: thirtyDaysAgo }
          });

          const presentCount = attendance.filter(a => a.status === 'present').length;
          const absentCount = attendance.filter(a => a.status === 'absent').length;
          const totalMeetings = [...new Set(attendance.map(a => a.meetingDate.toDateString()))].length;
          const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

          // Calculate participation rate (unique students who attended / total members)
          const uniqueAttendees = new Set(attendance.map(a => a.studentId.toString())).size;
          const participationRate = members.length > 0 ? Math.round((uniqueAttendees / members.length) * 100) : 0;

          reportData.push({
            clubName: club.name || 'Unknown Club',
            clubType: club.type || 'N/A',
            totalMembers: members.length,
            maxMembers: club.maxMembers || 'No Limit',
            attendanceRate: `${attendanceRate}%`,
            totalMeetings: totalMeetings,
            presentCount: presentCount,
            absentCount: absentCount,
            participationRate: `${participationRate}%`,
            advisor: club.advisorId ? `${(club.advisorId as any).firstName || ''} ${(club.advisorId as any).lastName || ''}`.trim() || 'No Advisor' : 'No Advisor'
          });
        }
      } else {
        // Default/Summary Report: General club overview
        csvHeaders = ['Club Name', 'Type', 'Advisor', 'Advisor Email', 'Members', 'Max Members', 'Attendance Rate', 'Location', 'Schedule', 'Status'];
        filename = `club-summary-report-${new Date().toISOString().split('T')[0]}.csv`;

        for (const club of clubs) {
          const members = await this.clubMembershipModel.find({
            clubId: club._id,
            status: 'approved',
            isActive: true
          });

          const attendance = await this.clubAttendanceModel.find({
            clubId: club._id,
            meetingDate: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          });

          const presentCount = attendance.filter(a => a.status === 'present').length;
          const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

          reportData.push({
            clubName: club.name,
            clubType: club.type,
            advisor: club.advisorId ? `${(club.advisorId as any).firstName} ${(club.advisorId as any).lastName}` : 'No Advisor',
            advisorEmail: club.advisorId ? (club.advisorId as any).email : '',
            memberCount: members.length,
            maxMembers: club.maxMembers || 'No Limit',
            attendanceRate: `${attendanceRate}%`,
            location: club.location || 'Not Set',
            schedule: club.meetingSchedule && club.meetingSchedule.days ?
              `${club.meetingSchedule.days.join(', ')} ${club.meetingSchedule.startTime || ''}-${club.meetingSchedule.endTime || ''}` :
              'Not Scheduled',
            status: club.isActive ? 'Active' : 'Inactive'
          });
        }
      }

      if (format === 'csv') {
        // Generate CSV format based on report type
        const csvRows = reportData.map(row => {
          return csvHeaders.map(header => {
            const key = header.toLowerCase()
              .replace(/\s+/g, '')
              .replace(/\(.*?\)/g, '')
              .replace(/30days/g, '')
              .replace(/days/g, '');

            // Map headers to data keys
            const keyMap: Record<string, string> = {
              'clubname': 'clubName',
              'type': 'clubType',
              'advisor': 'advisor',
              'advisoremail': 'advisorEmail',
              'members': 'memberCount',
              'totalmembers': 'totalMembers',
              'maxmembers': 'maxMembers',
              'attendancerate': 'attendanceRate',
              'participationrate': 'participationRate',
              'location': 'location',
              'meetingdays': 'meetingDays',
              'frequency': 'frequency',
              'activities': 'activities',
              'status': 'status',
              'studentname': 'studentName',
              'gradelevel': 'gradeLevel',
              'studentid': 'studentId',
              'role': 'role',
              'joineddate': 'joinedDate',
              'totalmeetings': 'totalMeetings',
              'presentcount': 'presentCount',
              'absentcount': 'absentCount'
            };

            const dataKey = keyMap[key] || key;
            const value = row[dataKey] || row[header] || '';
            return String(value);
          });
        });

        const csvContent = [csvHeaders, ...csvRows]
          .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
          .join('\n');

        return {
          success: true,
          data: csvContent,
          filename: filename,
          contentType: 'text/csv'
        };
      }

      // Default JSON response
      return {
        success: true,
        data: reportData,
        summary: {
          totalClubs: clubs.length,
          totalMembers: type === 'membership'
            ? reportData.filter(r => r.studentName !== 'No Members').length
            : reportData.reduce((sum, club) => sum + (club.memberCount || club.totalMembers || 0), 0),
          reportType: type
        }
      };
    } catch (error) {
      console.error('Export error:', error);
      throw new BadRequestException('Failed to export club report: ' + error.message);
    }
  }

  // ==================== CLUB TYPES MANAGEMENT ====================

  async getClubTypes(schoolId: string): Promise<ClubType[]> {
    return this.clubTypeModel.find({ schoolId, isActive: true }).sort({ name: 1 }).exec();
  }

  async createClubType(schoolId: string, name: string, description: string, createdBy: string): Promise<ClubType> {
    const existing = await this.clubTypeModel.findOne({ schoolId, name: name.trim() });
    if (existing) {
      throw new BadRequestException('Club type with this name already exists');
    }
    const clubType = new this.clubTypeModel({
      name: name.trim(),
      schoolId,
      description: description?.trim(),
      createdBy,
      isActive: true
    });
    return clubType.save();
  }

  async updateClubType(id: string, schoolId: string, updateData: { name?: string; description?: string; isActive?: boolean }): Promise<ClubType> {
    const clubType = await this.clubTypeModel.findOne({ _id: id, schoolId });
    if (!clubType) {
      throw new NotFoundException('Club type not found');
    }
    if (updateData.name) {
      const existing = await this.clubTypeModel.findOne({
        schoolId,
        name: updateData.name.trim(),
        _id: { $ne: id }
      });
      if (existing) {
        throw new BadRequestException('Club type with this name already exists');
      }
      clubType.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      clubType.description = updateData.description?.trim();
    }
    if (updateData.isActive !== undefined) {
      clubType.isActive = updateData.isActive;
    }
    return clubType.save();
  }

  async deleteClubType(id: string, schoolId: string): Promise<void> {
    const clubType = await this.clubTypeModel.findOne({ _id: id, schoolId });
    if (!clubType) {
      throw new NotFoundException('Club type not found');
    }
    // Check if any clubs are using this type
    const clubsUsingType = await this.clubModel.countDocuments({
      schoolId,
      type: clubType.name,
      isActive: true
    });
    if (clubsUsingType > 0) {
      throw new BadRequestException(`Cannot delete club type. ${clubsUsingType} active club(s) are using this type.`);
    }
    await this.clubTypeModel.findByIdAndDelete(id);
  }

  // ==================== STUDENT ROLES MANAGEMENT ====================

  async getStudentRoles(schoolId: string): Promise<StudentRole[]> {
    return this.studentRoleModel.find({ schoolId, isActive: true }).sort({ name: 1 }).exec();
  }

  async createStudentRole(schoolId: string, name: string, description: string, createdBy: string): Promise<StudentRole> {
    const existing = await this.studentRoleModel.findOne({ schoolId, name: name.trim() });
    if (existing) {
      throw new BadRequestException('Student role with this name already exists');
    }
    const studentRole = new this.studentRoleModel({
      name: name.trim(),
      schoolId,
      description: description?.trim(),
      createdBy,
      isActive: true
    });
    return studentRole.save();
  }

  async updateStudentRole(id: string, schoolId: string, updateData: { name?: string; description?: string; isActive?: boolean }): Promise<StudentRole> {
    const studentRole = await this.studentRoleModel.findOne({ _id: id, schoolId });
    if (!studentRole) {
      throw new NotFoundException('Student role not found');
    }
    if (updateData.name) {
      const existing = await this.studentRoleModel.findOne({
        schoolId,
        name: updateData.name.trim(),
        _id: { $ne: id }
      });
      if (existing) {
        throw new BadRequestException('Student role with this name already exists');
      }
      studentRole.name = updateData.name.trim();
    }
    if (updateData.description !== undefined) {
      studentRole.description = updateData.description?.trim();
    }
    if (updateData.isActive !== undefined) {
      studentRole.isActive = updateData.isActive;
    }
    return studentRole.save();
  }

  async deleteStudentRole(id: string, schoolId: string): Promise<void> {
    const studentRole = await this.studentRoleModel.findOne({ _id: id, schoolId });
    if (!studentRole) {
      throw new NotFoundException('Student role not found');
    }
    // Check if any memberships are using this role
    const membershipsUsingRole = await this.clubMembershipModel.countDocuments({
      schoolId,
      role: studentRole.name,
      isActive: true
    });
    if (membershipsUsingRole > 0) {
      throw new BadRequestException(`Cannot delete student role. ${membershipsUsingRole} active membership(s) are using this role.`);
    }
    await this.studentRoleModel.findByIdAndDelete(id);
  }

  // ==================== CALENDAR EVENTS FOR CLUB MEETINGS ====================

  async createClubMeetingEvents(club: ClubDocument, createdBy: string): Promise<void> {
    if (!club.meetingSchedule || !club.meetingSchedule.days || club.meetingSchedule.days.length === 0) {
      return;
    }

    const schedule = club.meetingSchedule;
    const startTime = schedule.startTime || '15:00';
    const endTime = schedule.endTime || '16:00';
    const frequency = schedule.frequency || 'Weekly';

    // Get current academic year (you may need to adjust this based on your system)
    const now = new Date();
    const academicYear = `${now.getFullYear()}-${now.getFullYear() + 1}`;

    // Generate events for the next 3 months
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);

    const dayMap: Record<string, number> = {
      'Monday': 1,
      'Tuesday': 2,
      'Wednesday': 3,
      'Thursday': 4,
      'Friday': 5,
      'Saturday': 6,
      'Sunday': 0
    };

    const events: any[] = [];
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    // Generate events for each meeting day
    for (const dayName of schedule.days) {
      const dayOfWeek = dayMap[dayName];
      if (dayOfWeek === undefined) continue;

      let eventDate = new Date(currentDate);
      // Find next occurrence of this day
      const daysUntil = (dayOfWeek - eventDate.getDay() + 7) % 7;
      if (daysUntil === 0 && eventDate.getDay() !== dayOfWeek) {
        eventDate.setDate(eventDate.getDate() + 7);
      } else {
        eventDate.setDate(eventDate.getDate() + daysUntil);
      }

      // Generate events based on frequency
      while (eventDate <= endDate) {
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const startDateTime = new Date(eventDate);
        startDateTime.setHours(startHour, startMin, 0, 0);

        const endDateTime = new Date(eventDate);
        endDateTime.setHours(endHour, endMin, 0, 0);

        events.push({
          title: `${club.name} Club Meeting`,
          description: `${club.description || 'Regular club meeting'}\n\nLocation: ${club.location || 'TBA'}\nAdvisor: ${club.advisorId ? 'Club Advisor' : 'TBA'}`,
          startDate: startDateTime,
          endDate: endDateTime,
          startTime: startTime,
          endTime: endTime,
          allDay: false,
          category: 'meeting',
          audience: 'school-wide',
          location: club.location || 'TBA',
          status: 'published',
          schoolId: club.schoolId,
          academicYear: academicYear,
          createdBy: createdBy,
          sendNotification: true,
          priority: 2,
          metadata: {
            clubId: club._id.toString(),
            clubName: club.name,
            type: 'club-meeting'
          }
        });

        // Move to next occurrence based on frequency
        if (frequency === 'Weekly') {
          eventDate.setDate(eventDate.getDate() + 7);
        } else if (frequency === 'Bi-weekly') {
          eventDate.setDate(eventDate.getDate() + 14);
        } else if (frequency === 'Monthly') {
          eventDate.setMonth(eventDate.getMonth() + 1);
        } else {
          eventDate.setDate(eventDate.getDate() + 7); // Default to weekly
        }
      }
    }

    // Create events in batches
    for (const eventData of events) {
      try {
        await this.calendarService.createEvent(eventData, createdBy);
      } catch (error) {
        console.error(`Failed to create calendar event for ${club.name}:`, error);
      }
    }
  }

  async updateClubMeetingEvents(club: ClubDocument, updatedBy: string): Promise<void> {
    // Delete existing club meeting events
    // Note: This is a simplified approach. In production, you might want to track event IDs
    // and update them instead of deleting and recreating

    // For now, we'll just create new events when club is updated
    // In a production system, you'd want to:
    // 1. Store event IDs in club metadata
    // 2. Update existing events or delete and recreate
    if (club.meetingSchedule && club.meetingSchedule.days && club.meetingSchedule.days.length > 0) {
      await this.createClubMeetingEvents(club, updatedBy);
    }
  }

  // ==================== CLUB EVENTS MANAGEMENT ====================

  async createEvent(eventData: any, role?: string, createdBy?: string): Promise<ClubEvent> {
    try {

      if (Types.ObjectId.isValid(eventData.schoolId)) {
        eventData.schoolId = new Types.ObjectId(eventData.schoolId);
      } else {
        throw new BadRequestException('Invalid school ID format');
      }

      if (Types.ObjectId.isValid(eventData.clubId)) {
        eventData.clubId = new Types.ObjectId(eventData.clubId);
      } else {
        throw new BadRequestException('Invalid club ID format');
      }

      // Validate required fields
      if (!eventData.clubId) {
        throw new BadRequestException('Club ID is required');
      }
      if (!eventData.name || !eventData.name.trim()) {
        throw new BadRequestException('Event name is required');
      }
      if (!eventData.startDate) {
        throw new BadRequestException('Start date is required');
      }
      if (!eventData.endDate) {
        throw new BadRequestException('End date is required');
      }

      // Validate ObjectId format
      if (!Types.ObjectId.isValid(eventData.clubId)) {
        throw new BadRequestException('Invalid club ID format');
      }

      // Validate club exists and belongs to school
      const club = await this.clubModel.findOne({
        _id: new Types.ObjectId(eventData.clubId),
        schoolId: new Types.ObjectId(eventData.schoolId),
        isActive: true
      });

      if (!club) {
        throw new NotFoundException('Club not found or inactive');
      }

      // Validate dates
      const startDate = new Date(eventData.startDate);
      const endDate = new Date(eventData.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid date format');
      }

      if (endDate < startDate) {
        throw new BadRequestException('End date cannot be before start date');
      }

      // Validate and normalize time slots
      if (eventData.timeSlots && Array.isArray(eventData.timeSlots)) {
        const normalizedSlots = [];
        for (const slot of eventData.timeSlots) {
          const slotDate = new Date(slot.date);
          if (slotDate < startDate || slotDate > endDate) {
            throw new BadRequestException(`Time slot date must be between start and end date`);
          }

          // Validate time format and check for overlaps
          const startTime = this.parseTime(slot.startTime);
          const endTime = this.parseTime(slot.endTime);

          if (!startTime || !endTime) {
            throw new BadRequestException('Invalid time format. Use HH:mm format (e.g., 10:00)');
          }

          if (endTime <= startTime) {
            throw new BadRequestException('End time must be after start time');
          }

          normalizedSlots.push({
            date: slotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            description: slot.description || ''
          });
        }

        // Check for overlapping time slots on the same date
        this.validateTimeSlotOverlaps(normalizedSlots);
        eventData.timeSlots = normalizedSlots;
      }

      // Check for conflicts with class schedules
      let conflictWarnings: string[] = [];
      if (eventData.timeSlots && eventData.timeSlots.length > 0) {
        const conflictCheck = await this.checkAcademicConflictsForClubEvent(eventData, eventData.schoolId);
        if (conflictCheck.hasConflicts && conflictCheck.reasons.length > 0) {
          conflictWarnings = conflictCheck.reasons;
          // Log warnings - clubs often run outside class hours, so we warn but don't block
          console.warn('Club event conflicts with class schedules:', conflictCheck.reasons);
        }
      }

      const event = new this.clubEventModel({
        ...eventData,
        startDate,
        endDate,
        createdBy: new Types.ObjectId(eventData.createdBy)
      });

      const savedEvent = await event.save();

      // create activity
      await this.activityModel.create({
        title: 'Event Created',
        subtitle: `Event ${savedEvent.name} was created`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy)
      });

      // Send email notifications to parents and students of club members
      try {
        await this.notifyMembersOfEvent(eventData.clubId.toString(), savedEvent._id.toString(), club);
      } catch (notificationError) {
        console.error('Error sending event notifications:', notificationError);
        // Don't fail event creation if notification fails
      }
      
      // Log conflict warnings if any (they don't block creation)
      if (conflictWarnings.length > 0) {
        console.warn('Club event created with class schedule conflicts:', conflictWarnings);
      }
      
      return savedEvent;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to create event: ' + error.message);
    }
  }

  async getSchoolEvents(schoolId: string | undefined, query: any): Promise<any> {
    try {
      const filter: any = {
        isActive: true
      };

      // Only filter by schoolId if provided and valid (for admin or super-admin with school filter)
      // Filter out empty strings, 'all', or invalid values
      if (schoolId && schoolId !== '' && schoolId !== 'all' && Types.ObjectId.isValid(schoolId)) {
        filter.schoolId = new Types.ObjectId(schoolId);
      } else {
        // If no specific schoolId filter, exclude events with invalid/empty schoolIds to prevent populate errors
        // Only include events where schoolId is a valid ObjectId type (excludes empty strings, null, etc.)
        filter.$and = filter.$and || [];
        filter.$and.push({
          schoolId: {
            $exists: true,
            $ne: null,
            $type: 'objectId'
          }
        });
      }

      // Apply filters
      if (query.clubId) {
        if (!Types.ObjectId.isValid(query.clubId)) {
          throw new BadRequestException('Invalid club ID format');
        }
        filter.clubId = new Types.ObjectId(query.clubId);
      }

      // Support filtering by multiple club IDs (comma-separated)
      if (query.clubIds) {
        const clubIdArray = query.clubIds.split(',').map((id: string) => id.trim()).filter((id: string) => Types.ObjectId.isValid(id));
        if (clubIdArray.length > 0) {
          filter.clubId = { $in: clubIdArray.map((id: string) => new Types.ObjectId(id)) };
        }
      }

      // Build search filter
      const searchOr: any[] = [];
      if (query.search) {
        searchOr.push(
          { name: { $regex: query.search, $options: 'i' } },
          { description: { $regex: query.search, $options: 'i' } }
        );
      }

      // Date range filter - events that overlap with the date range
      const dateConditions: any[] = [];
      if (query.startDate || query.endDate) {
        if (query.startDate && query.endDate) {
          // Find events that overlap with the date range
          // Event overlaps if: event.startDate <= query.endDate AND event.endDate >= query.startDate
          dateConditions.push({
            startDate: { $lte: new Date(query.endDate) },
            endDate: { $gte: new Date(query.startDate) }
          });
        } else if (query.startDate) {
          // Events that end on or after startDate
          dateConditions.push({
            endDate: { $gte: new Date(query.startDate) }
          });
        } else if (query.endDate) {
          // Events that start on or before endDate
          dateConditions.push({
            startDate: { $lte: new Date(query.endDate) }
          });
        }
      }

      // Combine filters properly
      if (searchOr.length > 0 && dateConditions.length > 0) {
        // Both search and date filters - use $and to combine
        filter.$and = [
          { $or: searchOr },
          ...dateConditions
        ];
      } else if (searchOr.length > 0) {
        // Only search filter
        filter.$or = searchOr;
      } else if (dateConditions.length > 0) {
        // Only date filter - merge into filter
        Object.assign(filter, ...dateConditions);
      }

      // Pagination
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      // Get total count
      const total = await this.clubEventModel.countDocuments(filter);

      // Get events - sort by createdAt (most recent first) instead of startDate
      // Also filter out events with invalid/empty schoolIds to avoid populate errors
      const events = await this.clubEventModel
        .find(filter)
        .populate({
          path: 'clubId',
          select: 'name type schoolId',
          populate: {
            path: 'schoolId',
            select: 'name'
          }
        })
        .populate('schoolId', 'name')
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 }) // Most recent events first
        .skip(skip)
        .limit(limit)
        .exec();

      return {
        events,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error fetching events:', error);
      throw new BadRequestException('Failed to fetch events');
    }
  }

  async getEventById(eventId: string, schoolId: string | undefined): Promise<ClubEvent> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(eventId)) {
        throw new BadRequestException('Invalid event ID format');
      }

      const filter: any = {
        _id: new Types.ObjectId(eventId),
        isActive: true
      };

      // Only filter by schoolId if provided (for admin or super-admin with school filter)
      if (schoolId) {
        if (Types.ObjectId.isValid(schoolId)) {
          filter.schoolId = new Types.ObjectId(schoolId);
        } else {
          filter.schoolId = schoolId;
        }
      }

      const event = await this.clubEventModel
        .findOne(filter)
        .populate('clubId', 'name type advisorId')
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName')
        .exec();

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      return event;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error fetching event by ID:', error);
      throw new BadRequestException('Failed to fetch event');
    }
  }

  async updateEvent(eventId: string, updateData: any, schoolId: string | undefined, updatedBy: string, role?: string): Promise<ClubEvent> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(eventId)) {
        throw new BadRequestException('Invalid event ID format');
      }

      const filter: any = {
        _id: new Types.ObjectId(eventId),
        isActive: true
      };

      // Only filter by schoolId if provided (for admin or super-admin with school filter)
      if (schoolId) {
        if (Types.ObjectId.isValid(schoolId)) {
          filter.schoolId = new Types.ObjectId(schoolId);
        } else {
          filter.schoolId = schoolId;
        }
      }

      const event = await this.clubEventModel.findOne(filter);

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      // Validate dates if provided
      if (updateData.startDate || updateData.endDate) {
        const startDate = updateData.startDate ? new Date(updateData.startDate) : new Date(event.startDate);
        const endDate = updateData.endDate ? new Date(updateData.endDate) : new Date(event.endDate);

        if (endDate < startDate) {
          throw new BadRequestException('End date cannot be before start date');
        }

        updateData.startDate = startDate;
        updateData.endDate = endDate;
      }

      // Validate time slots if provided
      if (updateData.timeSlots && Array.isArray(updateData.timeSlots)) {
        const startDate = updateData.startDate ? new Date(updateData.startDate) : new Date(event.startDate);
        const endDate = updateData.endDate ? new Date(updateData.endDate) : new Date(event.endDate);

        const normalizedSlots = [];
        for (const slot of updateData.timeSlots) {
          const slotDate = new Date(slot.date);
          if (slotDate < startDate || slotDate > endDate) {
            throw new BadRequestException(`Time slot date must be between start and end date`);
          }

          const startTime = this.parseTime(slot.startTime);
          const endTime = this.parseTime(slot.endTime);

          if (!startTime || !endTime) {
            throw new BadRequestException('Invalid time format. Use HH:mm format');
          }

          if (endTime <= startTime) {
            throw new BadRequestException('End time must be after start time');
          }

          normalizedSlots.push({
            date: slotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            description: slot.description || ''
          });
        }

        this.validateTimeSlotOverlaps(normalizedSlots);
        updateData.timeSlots = normalizedSlots;
      }

      // Check for conflicts with class schedules if time slots are being updated
      let conflictWarnings: string[] = [];
      if (updateData.timeSlots && updateData.timeSlots.length > 0) {
        const schoolId = event.schoolId || updateData.schoolId;
        const conflictCheck = await this.checkAcademicConflictsForClubEvent(
          { ...event.toObject(), ...updateData, timeSlots: updateData.timeSlots },
          schoolId
        );
        if (conflictCheck.hasConflicts && conflictCheck.reasons.length > 0) {
          conflictWarnings = conflictCheck.reasons;
          console.warn('Club event conflicts with class schedules:', conflictCheck.reasons);
        }
      }

      updateData.updatedBy = new Types.ObjectId(updatedBy);

      const updatedEvent = await this.clubEventModel.findByIdAndUpdate(
        new Types.ObjectId(eventId),
        updateData,
        { new: true }
      )
        .populate('clubId', 'name type')
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName')
        .exec();

      if (!updatedEvent) {
        throw new NotFoundException('Event not found');
      }

      // create activity
      await this.activityModel.create({
        title: 'Event Updated',
        subtitle: `Event ${event.name} was updated`,
        performBy: role,
        actorId: new Types.ObjectId(updatedBy),
        adminId: new Types.ObjectId(updatedBy)
      });
      
      // Log conflict warnings if any (they don't block update)
      if (conflictWarnings.length > 0) {
        console.warn('Club event updated with class schedule conflicts:', conflictWarnings);
      }
      
      return updatedEvent;
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating event:', error);
      throw new BadRequestException('Failed to update event');
    }
  }

  async deleteEvent(eventId: string, schoolId: string | undefined, role?: string): Promise<{ message: string }> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(eventId)) {
        throw new BadRequestException('Invalid event ID format');
      }

      const filter: any = {
        _id: new Types.ObjectId(eventId),
        isActive: true
      };

      // Only filter by schoolId if provided (for admin or super-admin with school filter)
      if (schoolId) {
        if (Types.ObjectId.isValid(schoolId)) {
          filter.schoolId = new Types.ObjectId(schoolId);
        } else {
          filter.schoolId = schoolId;
        }
      }

      const event = await this.clubEventModel.findOne(filter);

      if (!event) {
        throw new NotFoundException('Event not found');
      }

      await this.clubEventModel.findByIdAndUpdate(new Types.ObjectId(eventId), { isActive: false });

      // create activity
      await this.activityModel.create({
        title: 'Event Deleted',
        subtitle: `Event ${event.name} was deleted`,
        performBy: role,
        actorId: new Types.ObjectId(event.createdBy),
        adminId: new Types.ObjectId(event.createdBy)
      });
      
      return { message: 'Event deleted successfully' };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error deleting event:', error);
      throw new BadRequestException('Failed to delete event');
    }
  }

  async getClubEvents(clubId: string, schoolId: string): Promise<ClubEvent[]> {
    try {
      // Validate ObjectId format
      if (!Types.ObjectId.isValid(clubId)) {
        throw new BadRequestException('Invalid club ID format');
      }

      // Convert schoolId to ObjectId if it's a valid string
      const schoolIdObj = Types.ObjectId.isValid(schoolId)
        ? (typeof schoolId === 'string' ? new Types.ObjectId(schoolId) : schoolId)
        : schoolId;

      return await this.clubEventModel
        .find({
          clubId: new Types.ObjectId(clubId),
          schoolId: schoolIdObj,
          isActive: true
        })
        .populate('clubId', 'name type')
        .sort({ createdAt: -1 }) // Most recent events first
        .exec();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error fetching club events:', error);
      throw new BadRequestException('Failed to fetch club events');
    }
  }

  // Helper methods for time slot validation
  private parseTime(timeString: string): number | null {
    const match = timeString.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes; // Convert to minutes since midnight
  }

  private validateTimeSlotOverlaps(slots: Array<{ date: Date; startTime: string; endTime: string }>): void {
    // Group slots by date
    const slotsByDate = new Map<string, Array<{ startTime: number; endTime: number }>>();

    for (const slot of slots) {
      const dateKey = slot.date.toISOString().split('T')[0];
      if (!slotsByDate.has(dateKey)) {
        slotsByDate.set(dateKey, []);
      }

      const startTime = this.parseTime(slot.startTime);
      const endTime = this.parseTime(slot.endTime);

      if (!startTime || !endTime) {
        throw new BadRequestException(`Invalid time format in slot: ${slot.startTime} - ${slot.endTime}`);
      }

      slotsByDate.get(dateKey)!.push({ startTime, endTime });
    }

    // Check for overlaps within each date
    for (const [date, dateSlots] of slotsByDate.entries()) {
      // Sort by start time
      dateSlots.sort((a, b) => a.startTime - b.startTime);

      // Check for overlaps
      for (let i = 0; i < dateSlots.length - 1; i++) {
        if (dateSlots[i].endTime > dateSlots[i + 1].startTime) {
          throw new BadRequestException(
            `Time slot overlap detected on ${date}. Slots cannot overlap on the same day.`
          );
        }
      }
    }
  }

  // Check for conflicts between club events and academic class schedules
  private async checkAcademicConflictsForClubEvent(eventData: any, schoolId: Types.ObjectId): Promise<{ hasConflicts: boolean; reasons: string[] }> {
    const conflicts: string[] = [];
    let hasConflicts = false;

    if (!eventData.timeSlots || !Array.isArray(eventData.timeSlots) || eventData.timeSlots.length === 0) {
      return { hasConflicts: false, reasons: [] };
    }

    // Get all students who are members of this club
    const clubMemberships = await this.clubMembershipModel.find({
      clubId: eventData.clubId,
      status: 'approved',
      isActive: true,
    }).select('studentId').lean();

    const studentUserIds = clubMemberships.map(m => m.studentId);

    if (studentUserIds.length === 0) {
      return { hasConflicts: false, reasons: [] };
    }

    // For each time slot, check if any club member has a class at that time
    for (const eventTimeSlot of eventData.timeSlots) {
      const eventDate = new Date(eventTimeSlot.date);
      const eventDay = this.getDayOfWeek(eventDate);
      const eventStartTime = this.parseTime(eventTimeSlot.startTime);
      const eventEndTime = this.parseTime(eventTimeSlot.endTime);

      if (!eventStartTime || !eventEndTime) continue;

      // Get students and their class schedules
      for (const studentUserId of studentUserIds) {
        const student = await this.userModel.findById(studentUserId).select('class section firstName lastName').lean();
        if (!student || !student.class || !student.section) continue;

        const studentClass = student.class;
        const studentSection = student.section;

        // Check CourseAssignment (new system)
        const courseAssignments = await this.courseAssignmentModel.find({
          schoolId: schoolId,
          'grades.level': this.gradeToNumber(studentClass),
          'grades.section': studentSection,
        }).populate('courseId', 'courseName').lean();

        for (const assignment of courseAssignments) {
          for (const grade of assignment.grades) {
            if (this.gradeToNumber(studentClass) === grade.level && studentSection === grade.section) {
              for (const classTimeSlot of grade.timeSlots) {
                if (classTimeSlot.day === eventDay) {
                  const classStartTime = this.parseTime(classTimeSlot.startTime);
                  const classEndTime = this.parseTime(classTimeSlot.endTime);
                  
                  if (classStartTime && classEndTime && this.isTimeOverlap(
                    classStartTime,
                    classEndTime,
                    eventStartTime,
                    eventEndTime
                  )) {
                    const courseName = (assignment.courseId as any)?.courseName || 'Unknown Course';
                    conflicts.push(
                      `Student ${student.firstName} ${student.lastName} (${studentClass}-${studentSection}) has class conflict: ${courseName} on ${eventDay} from ${classTimeSlot.startTime} to ${classTimeSlot.endTime} overlaps with club event from ${eventTimeSlot.startTime} to ${eventTimeSlot.endTime}`
                    );
                    hasConflicts = true;
                  }
                }
              }
            }
          }
        }

        // Also check old Schedule model
        const oldSchedules = await this.scheduleModel.find({
          schoolId: schoolId,
          className: studentClass,
          section: studentSection,
        }).populate('courseId', 'courseName').lean();

        for (const oldSched of oldSchedules) {
          for (const oldDay of oldSched.dayOfWeek) {
            if (oldDay.date === eventDay) {
              const classStartTime = this.parseTime(oldDay.startTime);
              const classEndTime = this.parseTime(oldDay.endTime);
              
              if (classStartTime && classEndTime && this.isTimeOverlap(
                classStartTime,
                classEndTime,
                eventStartTime,
                eventEndTime
              )) {
                const courseName = (oldSched.courseId as any)?.courseName || 'Unknown Course';
                conflicts.push(
                  `Student ${student.firstName} ${student.lastName} (${studentClass}-${studentSection}) has class conflict: ${courseName} on ${eventDay} from ${oldDay.startTime} to ${oldDay.endTime} overlaps with club event from ${eventTimeSlot.startTime} to ${eventTimeSlot.endTime}`
                );
                hasConflicts = true;
              }
            }
          }
        }
      }
    }

    return { hasConflicts, reasons: conflicts };
  }

  // Helper: Convert grade string to number (e.g., "Grade 1" -> 1, "Kindergarten" -> 0)
  private gradeToNumber(gradeString: string): number {
    if (!gradeString) return -1;
    const normalized = gradeString.trim();
    if (normalized.toLowerCase() === 'kindergarten' || normalized === 'K') return 0;
    const match = normalized.match(/\d+/);
    return match ? parseInt(match[0], 10) : -1;
  }

  // Helper: Get day of week from date (Monday, Tuesday, etc.)
  private getDayOfWeek(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
  }

  // Helper: Check if two time ranges overlap
  private isTimeOverlap(start1: number, end1: number, start2: number, end2: number): boolean {
    return start1 < end2 && start2 < end1;
  }
}
