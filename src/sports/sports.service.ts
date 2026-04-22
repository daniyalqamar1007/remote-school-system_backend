import { Injectable, NotFoundException, BadRequestException, ForbiddenException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SportsProgram, SportsProgramDocument } from './schema/sports-program.schema';
import { StudentSports, StudentSportsDocument } from './schema/student-sports.schema';
import { SportsSchedule, SportsScheduleDocument } from './schema/sports-schedule.schema';
import { SportsAttendance, SportsAttendanceDocument } from './schema/sports-attendance.schema';
import { StudentProfile, StudentProfileDocument } from '../auth/schemas/student-profile.schema';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { Student, StudentDocument } from '../student/schema/student.schema';
import { Activity } from '../activity/schema/schema.activity';
import { ActivityService } from '../activity/activity.service';
import { NurseService } from '../nurse/nurse.service';
import { customResponse } from 'src/utils/responses';
import { GetSportsProgramsQueryDto } from './dto/get-sports-programs-query.dto';
import { getPaginationMeta } from 'utils/pagination';
import { normalizeGradeLevel, isGradeEligible } from 'utils/gradeLevel';

@Injectable()
export class SportsService {
  constructor(
    @InjectModel(SportsProgram.name) private sportsProgramModel: Model<SportsProgramDocument>,
    @InjectModel(StudentSports.name) private studentSportsModel: Model<StudentSportsDocument>,
    @InjectModel(SportsSchedule.name) private sportsScheduleModel: Model<SportsScheduleDocument>,
    @InjectModel(SportsAttendance.name) private sportsAttendanceModel: Model<SportsAttendanceDocument>,
    @InjectModel(StudentProfile.name) private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    private readonly activityService: ActivityService,
    private readonly nurseService: NurseService,
  ) { }

  // ==================== SPORTS PROGRAM MANAGEMENT ====================

  async createSportsProgram(programData: any, schoolId: string, createdBy: string, role: string): Promise<any> {
    try {
      const existingProgram = await this.sportsProgramModel.findOne({
        name: programData.name,
        schoolId: schoolId
      });

      if (existingProgram) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'A sports program with this name already exists in the school',
          data: null
        }
      }

      const program = new this.sportsProgramModel({
        name: programData.name || '',
        description: programData.description || '',
        allowedGradeLevels: programData.allowedGradeLevels || [],
        schoolId: schoolId,
        coaches: programData.coaches || [],
        assistantCoaches: programData.assistantCoaches || [],
        season: programData.season || '',
        type: programData.type || '',
        maxParticipants: programData.maxParticipants || 0,
        requiredEquipment: programData.requiredEquipment || [],
        venue: programData.venue || [],
        requiresPhysicalExam: programData.requiresPhysicalExam || false,
        requiresMedicalClearance: programData.requiresMedicalClearance || false,
        requiresConsentForm: programData.requiresConsentForm || false,
        eligibilityTrackingEnabled: programData.eligibilityTrackingEnabled || false,
        isActive: true, // Always true - static
        createdBy: new Types.ObjectId(createdBy),
      });

      const savedProgram = await program.save();

      // Log the activity
      await this.activityService.create({
        title: `Created sports program: ${savedProgram.name}`,
        subtitle: `New ${savedProgram.season} ${savedProgram.type} program created`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy)
      });

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Sports program created successfully',
        data: null
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to create sports program',
        data: null
      }
    }
  }

  async getSportsPrograms(schoolId: string | null, filters?: GetSportsProgramsQueryDto): Promise<any> {
    try {
      const query: any = {};

      // Only filter by schoolId if provided (for super-admin viewing all schools, schoolId can be null)
      if (schoolId) {
        query.schoolId = new Types.ObjectId(schoolId);
      }

      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      // Default to active programs only unless explicitly requesting inactive ones
      if (filters?.isActive !== undefined) {
        query.isActive = filters.isActive;
      } else {
        query.isActive = true;
      }

      if (filters?.season) {
        query.season = filters.season;
      }

      if (filters?.type) {
        query.type = filters.type;
      }

      if (filters?.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } }
        ];
      }

      // Get total count before pagination
      const totalCount = await this.sportsProgramModel.countDocuments(query);

      // Always sort by createdAt descending (newest first) - this ensures most recently created programs appear first
      // Populate school information for super-admin
      const programs = await this.sportsProgramModel
        .find(query)
        .select('_id name season type isActive maxParticipants schoolId createdAt updatedAt')
        .populate('schoolId', 'name _id')
        .sort({ createdAt: -1 }) // Always newest first (descending order)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      // Get participant counts for each program - optimized with single aggregation
      const programIds = programs.map(p => p._id);
      const participantCounts = await this.studentSportsModel.aggregate([
        {
          $match: {
            sportsProgramId: { $in: programIds },
            status: 'active'
          }
        },
        {
          $group: {
            _id: '$sportsProgramId',
            count: { $sum: 1 }
          }
        }
      ]);

      const countMap = new Map(participantCounts.map(p => [p._id.toString(), p.count]));

      // Return programs with counts and school information
      const programsWithCounts = programs.map((program: any) => {
        const participantCount = countMap.get(program._id.toString()) || 0;
        return {
          _id: program._id,
          name: program.name,
          season: program.season,
          type: program.type,
          isActive: program.isActive,
          participantCount: participantCount,
          maxParticipants: program.maxParticipants || 0,
          schoolId: program.schoolId || null, // Include schoolId (populated with school name)
          school: program.schoolId || null // Also include as 'school' for frontend compatibility
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports programs retrieved successfully',
        data: {
          programs: programsWithCounts,
          pagination: getPaginationMeta(page, limit, totalCount)
        },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve sports programs',
        data: null
      };
    }
  }

  async getSportsProgramById(id: string): Promise<any> {
    try {
      const program = await this.sportsProgramModel
        .findById(id)
        .populate('coaches', 'firstName lastName email role')
        .populate('assistantCoaches', 'firstName lastName email role')
        .populate('createdBy', 'firstName lastName')
        .lean()
        .exec();

      if (!program) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }

      // Get participant count
      const participantCount = await this.studentSportsModel.countDocuments({
        sportsProgramId: id,
        status: 'active'
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports program retrieved successfully',
        data: {
          ...program,
          participantCount,
          isAtCapacity: program.maxParticipants > 0 && participantCount >= program.maxParticipants
        }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve sports program',
        data: null
      };
    }
  }

  async updateSportsProgram(id: string, updateData: any, updatedBy: string, role: string): Promise<any> {
    try {
      const existingProgram = await this.sportsProgramModel.findById(id).lean();
      if (!existingProgram) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }

      // Convert ObjectIds if needed
      const updatePayload: any = { ...updateData };
      if (updateData.coaches && Array.isArray(updateData.coaches)) {
        updatePayload.coaches = updateData.coaches.map((c: any) => new Types.ObjectId(c));
      }
      if (updateData.assistantCoaches && Array.isArray(updateData.assistantCoaches)) {
        updatePayload.assistantCoaches = updateData.assistantCoaches.map((c: any) => new Types.ObjectId(c));
      }
      if (updateData.schoolId) {
        updatePayload.schoolId = new Types.ObjectId(updateData.schoolId);
      }

      // Always set isActive to true (static)
      updatePayload.isActive = true;

      const program = await this.sportsProgramModel.findByIdAndUpdate(
        id,
        { ...updatePayload, updatedBy: new Types.ObjectId(updatedBy) },
        { new: true, runValidators: true }
      ).lean();

      if (!program) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }

      const changeSummary = this.buildUpdateChangeSummary(existingProgram as any, program as any, updateData);
      this.activityService.create({
        title: `Updated sports program: ${program.name}`,
        subtitle: changeSummary || 'Program details modified',
        performBy: role,
        actorId: new Types.ObjectId(updatedBy)
      }).catch(err => console.error('Activity logging failed:', err));

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports program updated successfully',
        data: null
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to update sports program',
        data: null
      };
    }
  }

  private buildUpdateChangeSummary(oldDoc: any, newDoc: any, updateData: any): string {
    const parts: string[] = [];
    const fieldLabels: Record<string, string> = {
      name: 'Name',
      description: 'Description',
      season: 'Season',
      type: 'Type',
      maxParticipants: 'Max participants',
      isActive: 'Active',
      allowedGradeLevels: 'Grade levels',
      coaches: 'Coaches',
      assistantCoaches: 'Assistant coaches',
      requiredEquipment: 'Equipment',
      venue: 'Venue',
    };
    const simpleFields = ['name', 'description', 'season', 'type', 'maxParticipants', 'isActive'];
    for (const key of simpleFields) {
      if (updateData[key] === undefined) continue;
      const oldVal = oldDoc[key];
      const newVal = newDoc[key];
      if (oldVal === newVal) continue;
      const label = fieldLabels[key] || key;
      const oldStr = oldVal === undefined || oldVal === null ? '' : String(oldVal);
      const newStr = newVal === undefined || newVal === null ? '' : String(newVal);
      parts.push(`${label}: ${oldStr || '(empty)'} → ${newStr || '(empty)'}`);
    }
    const arrayFields = ['allowedGradeLevels', 'coaches', 'assistantCoaches', 'requiredEquipment', 'venue'];
    for (const key of arrayFields) {
      if (updateData[key] === undefined) continue;
      const oldArr = oldDoc[key];
      const newArr = newDoc[key];
      const oldLen = Array.isArray(oldArr) ? oldArr.length : 0;
      const newLen = Array.isArray(newArr) ? newArr.length : 0;
      if (oldLen === newLen && JSON.stringify(oldArr) === JSON.stringify(newArr)) continue;
      const label = fieldLabels[key] || key;
      parts.push(`${label}: modified`);
    }
    return parts.length ? parts.join('; ') : 'Program details modified';
  }

  async deleteSportsProgram(id: string, deletedBy: string, role: string): Promise<any> {
    try {
      const program = await this.sportsProgramModel.findByIdAndUpdate(id, { isActive: false }).lean();

      if (!program) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }

      // // Check if there are active participants
      // const activeParticipants = await this.studentSportsModel.countDocuments({
      //   sportsProgramId: id,
      //   status: 'active'
      // });

      // if (activeParticipants > 0) {
      //   return {
      //     success: false,
      //     statusCode: HttpStatus.BAD_REQUEST,
      //     message: 'Cannot deactivate sports program with active participants',
      //     data: null
      //   };
      // }

      // Soft delete
      await this.sportsProgramModel.findByIdAndUpdate(id, { isActive: false });

      // Log the activity (non-blocking)
      this.activityService.create({
        title: `Deleted sports program: ${program.name}`,
        subtitle: `Program marked as inactive`,
        performBy: role,
        actorId: new Types.ObjectId(deletedBy)
      }).catch(err => console.error('Activity logging failed:', err));

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports program deactivated successfully',
        data: null
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to deactivate sports program',
        data: null
      };
    }
  }

  // ==================== STUDENT SPORTS ASSIGNMENT ====================

  async assignStudentToSports(assignmentData: any, assignedBy: string, schoolId?: string, role?: string): Promise<any> {
    try {
      const { studentId, sportsProgramId, academicYear } = assignmentData;

      if (!studentId || !sportsProgramId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Student ID and Sports Program ID are required',
          data: null
        };
      }

      // Check if student exists and get their profile
      // Accept either a StudentProfile._id or a linked userId
      let student: any = null;
      let searchMethod = '';

      try {
        // First try to find by StudentProfile._id (most common case)
        student = await this.studentProfileModel.findById(studentId);
        if (student) searchMethod = 'StudentProfile._id';
      } catch (err) {
        // ignore invalid id cast errors and try fallback
      }

      if (!student) {
        // Fallback 1: try to find student profile by linked userId
        student = await this.studentProfileModel.findOne({ userId: studentId });
        if (student) searchMethod = 'StudentProfile.userId';
      }

      if (!student) {
        // Fallback 2: try to find by student.studentId field (the custom student ID)
        student = await this.studentProfileModel.findOne({ studentId: studentId });
        if (student) searchMethod = 'StudentProfile.studentId';
      }

      if (!student) {
        // Fallback 3: Check User model for student records and find associated profile
        const userRecord = await this.userModel.findById(studentId);
        if (userRecord && userRecord.role === 'STUDENT') {
          // First try to use the studentProfileId from the user record if it exists
          if (userRecord.studentProfileId) {
            student = await this.studentProfileModel.findById(userRecord.studentProfileId);
            if (student) searchMethod = 'User.studentProfileId -> StudentProfile._id';
          }

          // If that fails, try to find by userId
          if (!student) {
            student = await this.studentProfileModel.findOne({ userId: userRecord._id });
            if (student) searchMethod = 'User._id -> StudentProfile.userId';
          }
        }
      }

      // NEW: If still no student profile found, try Student collection directly
      if (!student) {
        const studentRecord = await this.studentModel.findById(studentId);
        if (studentRecord) {
          student = studentRecord;
          searchMethod = 'Student collection by _id';
        }
      }

      // If still no student, try finding in Student collection by userId  
      if (!student) {
        const studentRecord = await this.studentModel.findOne({ userId: studentId });
        if (studentRecord) {
          student = studentRecord;
          searchMethod = 'Student collection by userId';
        }
      }

      if (!student) {
        // FALLBACK: If User exists but no profiles, use User record directly
        const userExists = await this.userModel.findById(studentId);
        if (userExists && userExists.role === 'STUDENT') {
          student = userExists;
          searchMethod = 'User record (no profile)';
        } else {
          throw new NotFoundException(`Student not found with ID: ${studentId}. Tried multiple lookup methods.`);
        }
      }

      // Student found successfully

      // Check if sports program exists
      const sportsProgram = await this.sportsProgramModel.findById(sportsProgramId);
      if (!sportsProgram) {
        throw new NotFoundException('Sports program not found');
      }

      // Check schoolId validation
      // For ADMIN: Only validate if both schoolId and program.schoolId are present
      // Skip validation if schoolId is missing (frontend filtering should handle it)
      // For SUPER_ADMIN: Only validate if schoolId is explicitly provided
      if (role && (role === UserRole.ADMIN || role === UserRole.SECRETARY || role === UserRole.TEACHER)) {
        // For admin users, validate only if schoolId is explicitly provided
        // The frontend should filter programs by school, so this is a safety check
        if (schoolId && sportsProgram.schoolId) {
          // Normalize both IDs to strings for comparison (handle ObjectId and string types)
          const programSchoolId = sportsProgram.schoolId;
          const programSchoolIdStr = programSchoolId instanceof Types.ObjectId
            ? programSchoolId.toString()
            : String(programSchoolId || '');

          const userSchoolIdStr = String(schoolId || '');

          // Debug logging
          console.log('[Assign Student] School validation:', {
            role,
            programSchoolId: programSchoolIdStr,
            userSchoolId: userSchoolIdStr,
            match: programSchoolIdStr === userSchoolIdStr
          });

          // Only validate if both IDs are present and non-empty
          // Skip if program doesn't have schoolId (legacy data) or user doesn't have schoolId
          if (programSchoolIdStr && userSchoolIdStr) {
            // Compare program's schoolId with admin's schoolId
            if (programSchoolIdStr !== userSchoolIdStr) {
              console.error('[Assign Student] School mismatch:', {
                programSchoolId: programSchoolIdStr,
                userSchoolId: userSchoolIdStr
              });
              throw new BadRequestException('Sports program does not belong to your school');
            }
          }
        } else {
          // If schoolId not provided or program doesn't have schoolId, skip validation
          // Frontend filtering should ensure correct program selection
          console.log('[Assign Student] Skipping school validation:', {
            hasUserSchoolId: !!schoolId,
            hasProgramSchoolId: !!sportsProgram.schoolId
          });
        }
      } else if (role === UserRole.SUPER_ADMIN && schoolId) {
        // For super-admin, only validate if schoolId is explicitly provided
        if (sportsProgram.schoolId) {
          const programSchoolId = sportsProgram.schoolId;
          const programSchoolIdStr = programSchoolId instanceof Types.ObjectId
            ? programSchoolId.toString()
            : String(programSchoolId || '');
          const providedSchoolIdStr = String(schoolId || '');
          if (programSchoolIdStr && providedSchoolIdStr && programSchoolIdStr !== providedSchoolIdStr) {
            throw new BadRequestException('Sports program does not belong to the specified school');
          }
        }
      }

      // Check grade level eligibility - normalize grade levels for comparison
      // This handles variations like "Grade 1" vs "1", "Kindergarten" vs "K", etc.
      const studentGrade = student.gradeLevel || student.class || student.grade;

      if (!isGradeEligible(studentGrade, sportsProgram.allowedGradeLevels)) {
        const normalizedStudentGrade = normalizeGradeLevel(studentGrade);
        throw new BadRequestException(
          `Student's grade level (${studentGrade || 'Not set'}) is not eligible for this sports program. ` +
          `Student grade: ${normalizedStudentGrade || 'N/A'}, ` +
          `Allowed grades: ${sportsProgram.allowedGradeLevels.join(', ')}`
        );
      }

      // Check if student is already assigned to this program (active OR inactive)
      // A student cannot be assigned twice to the same program, regardless of status
      const existingAssignment = await this.studentSportsModel.findOne({
        studentId,
        sportsProgramId,
        academicYear
        // Removed status filter - check for ANY assignment (active or inactive)
      });

      if (existingAssignment) {
        throw new BadRequestException(`Student is already assigned to this sports program (status: ${existingAssignment.status}). Please reactivate the existing assignment or remove it first.`);
      }

      // Check program capacity
      if (sportsProgram.maxParticipants > 0) {
        const currentParticipants = await this.studentSportsModel.countDocuments({
          sportsProgramId,
          status: 'active'
        });

        if (currentParticipants >= sportsProgram.maxParticipants) {
          throw new BadRequestException('Sports program has reached maximum capacity');
        }
      }

      // Health record is no longer required for sports assignment.
      // Keep these fields populated for backward compatibility in response/reporting.
      const medicalClearanceStatus = 'pending';
      const healthWarnings: string[] = [];

      const assignment = new this.studentSportsModel({
        ...assignmentData,
        schoolId: sportsProgram.schoolId,
        enrollmentDate: new Date(),
        assignedBy,
        updatedBy: assignedBy,
        // Medical Integration: Add medical clearance information
        medicalClearanceStatus,
        healthWarnings,
        medicalCheckDate: new Date()
      });

      const savedAssignment = await assignment.save();

      const medicalStatusText = 'without mandatory health record check';

      await this.activityService.create({
        title: `Student assigned to sports program`,
        subtitle: `${student.firstName} ${student.lastName} assigned to ${sportsProgram.name} ${medicalStatusText}`,
        performBy: role || 'ADMIN',
        adminId: assignedBy,
        actorId: new Types.ObjectId(assignedBy)
      });

      // Transform assignment for response
      const assignmentObj = savedAssignment.toObject();
      const transformedAssignment = {
        ...assignmentObj,
        student: assignmentObj.studentId,
        program: assignmentObj.sportsProgramId
      };

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Student assigned to sports program successfully',
        data: transformedAssignment
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to assign student to sports',
        data: null
      };
    }
  }

  async getStudentSportsAssignments(filters: any): Promise<any> {
    try {
      const query: any = {};
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      if (filters.studentId) {
        query.studentId = filters.studentId;
      }

      if (filters.sportsProgramId) {
        query.sportsProgramId = filters.sportsProgramId;
      }

      // Handle multiple program IDs (for teachers filtering by their programs)
      if (filters.sportsProgramIds && Array.isArray(filters.sportsProgramIds) && filters.sportsProgramIds.length > 0) {
        try {
          query.sportsProgramId = {
            $in: filters.sportsProgramIds.map((id: string) => new Types.ObjectId(id))
          };
        } catch (error) {
          console.warn('Invalid sportsProgramIds:', filters.sportsProgramIds);
        }
      }

      if (filters.schoolId) {
        query.schoolId = new Types.ObjectId(filters.schoolId);
      }

      if (filters.academicYear) {
        query.academicYear = filters.academicYear;
      }

      if (filters.status) {
        query.status = filters.status;
      }

      // Handle search - search in student name, student ID, and program name
      let searchQuery = query;
      if (filters.search && filters.search.trim()) {
        const searchRegex = new RegExp(filters.search.trim(), 'i');
        
        // Find students matching the search term
        const matchingStudents = await this.userModel.find({
          $or: [
            { firstName: { $regex: searchRegex } },
            { lastName: { $regex: searchRegex } },
            { studentId: { $regex: searchRegex } }
          ],
          role: 'STUDENT'
        }).select('_id').lean();
        
        const matchingStudentIds = matchingStudents.map(s => s._id);
        
        // Find programs matching the search term
        const matchingPrograms = await this.sportsProgramModel.find({
          name: { $regex: searchRegex }
        }).select('_id').lean();
        
        const matchingProgramIds = matchingPrograms.map(p => p._id);
        
        // Build search query
        searchQuery = {
          ...query,
          $or: [
            ...(matchingStudentIds.length > 0 ? [{ studentId: { $in: matchingStudentIds } }] : []),
            ...(matchingProgramIds.length > 0 ? [{ sportsProgramId: { $in: matchingProgramIds } }] : [])
          ]
        };
        
        // If no matches found, return empty result
        if (matchingStudentIds.length === 0 && matchingProgramIds.length === 0) {
          return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'Student sports assignments retrieved successfully',
            data: {
              assignments: [],
              pagination: getPaginationMeta(page, limit, 0)
            }
          };
        }
      }

      // Get total count
      const totalCount = await this.studentSportsModel.countDocuments(searchQuery);

      const assignments = await this.studentSportsModel
        .find(searchQuery)
        .populate('studentId', 'firstName lastName studentId gradeLevel email')
        .populate({
          path: 'sportsProgramId',
          select: 'name season type schoolId',
          populate: {
            path: 'schoolId',
            select: 'name _id'
          }
        })
        .populate('assignedBy', 'firstName lastName')
        .sort({ enrollmentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      // Transform the data to match frontend expectations
      const transformedAssignments = assignments.map(assignment => {
        const program = assignment.sportsProgramId as any;
        return {
          ...assignment,
          student: assignment.studentId, // Map studentId to student for frontend compatibility
          program: program, // Map sportsProgramId to program for frontend compatibility
          assignedDate: assignment.enrollmentDate, // Map enrollmentDate to assignedDate for frontend compatibility
          medicalClearance: assignment.medicalClearanceObtained || false, // Map medical clearance field
          schoolId: program?.schoolId || null, // Include schoolId from program
          school: program?.schoolId || null // Also include as 'school' for frontend compatibility
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student sports assignments retrieved successfully',
        data: {
          assignments: transformedAssignments,
          pagination: getPaginationMeta(page, limit, totalCount)
        }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve student sports assignments',
        data: null
      };
    }
  }

  async getAssignmentsByProgram(programId: string, schoolId?: string): Promise<any> {
    try {
      if (!programId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Program ID is required',
          data: null
        };
      }

      // Check if program exists
      const program = await this.sportsProgramModel.findById(programId);
      if (!program) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }

      // Use program's schoolId if schoolId not provided
      const programSchoolId = schoolId || program.schoolId;

      const query: any = {
        sportsProgramId: programId,
        status: 'active' // Only get active assignments
      };

      if (programSchoolId) {
        query.schoolId = new Types.ObjectId(programSchoolId.toString());
      }

      const assignments = await this.studentSportsModel
        .find(query)
        .populate('studentId', 'firstName lastName studentId gradeLevel email phone')
        .populate('sportsProgramId', 'name season type')
        .sort({ enrollmentDate: -1 })
        .lean()
        .exec();

      // Transform the data to match frontend expectations
      const transformedAssignments = assignments.map(assignment => {
        return {
          ...assignment,
          student: assignment.studentId, // Map studentId to student for frontend compatibility
          program: assignment.sportsProgramId, // Map sportsProgramId to program for frontend compatibility
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Assignments retrieved successfully',
        data: {
          assignments: transformedAssignments,
          total: transformedAssignments.length
        }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve assignments by program',
        data: null
      };
    }
  }

  async getStudentSportsAssignmentById(id: string, user: any): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Assignment ID is required',
          data: null
        };
      }

      const assignment = await this.studentSportsModel
        .findById(id)
        .populate('studentId', 'firstName lastName studentId gradeLevel email phone address')
        .populate('sportsProgramId', 'name season sport type description')
        .populate('assignedBy', 'firstName lastName')
        .lean()
        .exec();

      if (!assignment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports assignment not found',
          data: null
        };
      }

      // Check permissions - parents can only see their children's assignments
      if (user.role === 'parent' || user.role === 'PARENT') {
        try {
          const parentUser = await this.userModel.findById(user.userId || user._id).populate('children').lean();
          const studentIds = (parentUser as any)?.children?.map((child: any) => child._id?.toString()) || [];
          const assignmentStudentId = (assignment.studentId as any)?._id?.toString();
          if (!studentIds.includes(assignmentStudentId)) {
            return {
              success: false,
              statusCode: HttpStatus.FORBIDDEN,
              message: 'You can only view your own children\'s assignments',
              data: null
            };
          }
        } catch (permError) {
          // If permission check fails, allow access (may need refinement)
        }
      }

      // Transform the data to match frontend expectations
      const transformedAssignment = {
        ...assignment,
        student: assignment.studentId, // Map studentId to student for frontend compatibility
        program: assignment.sportsProgramId, // Map sportsProgramId to program for frontend compatibility
        assignedDate: assignment.enrollmentDate, // Map enrollmentDate to assignedDate for frontend compatibility
        medicalClearance: assignment.medicalClearanceObtained || false, // Map medical clearance field
        medicalClearanceStatus: assignment.medicalClearanceStatus,
        healthWarnings: assignment.healthWarnings,
        medicalCheckDate: assignment.medicalCheckDate
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student sports assignment retrieved successfully',
        data: transformedAssignment
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve student sports assignment',
        data: null
      };
    }
  }

  async updateStudentSportsAssignment(id: string, updateData: any, updatedBy: string, role?: string): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Assignment ID is required',
          data: null
        };
      }

      const assignment = await this.studentSportsModel.findByIdAndUpdate(
        id,
        { ...updateData, updatedBy, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).lean();

      if (!assignment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student sports assignment not found',
          data: null
        };
      }

      // Log activity
      await this.activityService.create({
        title: 'Updated student sports assignment',
        subtitle: `Assignment updated for ${updateData.playerRole || 'student'}`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(updatedBy)
      });

      // Transform for response
      const transformedAssignment = {
        ...assignment,
        student: assignment.studentId,
        program: assignment.sportsProgramId
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student sports assignment updated successfully',
        data: transformedAssignment
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to update student sports assignment',
        data: null
      };
    }
  }

  async removeStudentFromSports(id: string, withdrawalData: any, updatedBy: string, role?: string): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Assignment ID is required',
          data: null
        };
      }

      // First get the assignment to log activity before deleting
      const assignment = await this.studentSportsModel.findById(id)
        .populate('studentId', 'firstName lastName')
        .populate('sportsProgramId', 'name')
        .lean();

      if (!assignment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student sports assignment not found',
          data: null
        };
      }

      // For teachers, verify they are a coach of this program
      if (role === 'TEACHER') {
        const programId = (assignment.sportsProgramId as any)?._id || assignment.sportsProgramId;
        const teacherId = new Types.ObjectId(updatedBy);
        
        // Query the program directly to check if teacher is a coach (same logic as getCoachingPrograms)
        const program = await this.sportsProgramModel.findOne({
          _id: programId,
          $or: [
            { coaches: teacherId },
            { assistantCoaches: teacherId }
          ]
        }).lean();

        if (!program) {
          return {
            success: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You can only remove students from programs where you are a coach',
            data: null
          };
        }
      }

      // Log activity before deletion
      const studentName = (assignment.studentId as any)?.firstName && (assignment.studentId as any)?.lastName
        ? `${(assignment.studentId as any).firstName} ${(assignment.studentId as any).lastName}`
        : 'Student';
      const programName = (assignment.sportsProgramId as any)?.name || 'sports program';

      await this.activityService.create({
        title: 'Removed student from sports program',
        subtitle: `${studentName} removed from ${programName}`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(updatedBy)
      });

      // Actually delete the assignment from database (not just set inactive)
      await this.studentSportsModel.findByIdAndDelete(id);

      // Transform for response (using the assignment we fetched before deletion)
      const transformedAssignment = {
        ...assignment,
        student: assignment.studentId,
        program: assignment.sportsProgramId
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student removed from sports program successfully',
        data: transformedAssignment
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to remove student from sports',
        data: null
      };
    }
  }

  // ==================== ELIGIBILITY TRACKING ====================

  async checkStudentEligibility(studentId: string, sportsProgramId: string): Promise<any> {
    try {
      if (!studentId || !sportsProgramId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Student ID and Sports Program ID are required',
          data: null
        };
      }

      const assignment = await this.studentSportsModel.findOne({
        studentId,
        sportsProgramId,
        status: 'active'
      }).populate('sportsProgramId').lean();

      if (!assignment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student is not assigned to this sports program',
          data: null
        };
      }

      const sportsProgram = assignment.sportsProgramId as any;
      let overallEligible = false;
      const issues = [];
      let healthStatus = 'No Record';

      // SIMPLIFIED ELIGIBILITY: Base eligibility on health status from nurse module
      // If student is healthy, they are eligible. Otherwise, not eligible.
      try {
        // Get health record to determine health status
        const healthRecord = await this.nurseService.getHealthRecord(studentId, assignment.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`);

        if (healthRecord) {
          // Get health status using the same logic as nurse module
          const activeAlerts = healthRecord.healthAlerts?.filter(alert => alert.isActive) || [];
          const highPriorityAlerts = activeAlerts.filter(alert =>
            alert.severity === 'high' || alert.severity === 'critical'
          );

          if (highPriorityAlerts.length > 0) {
            healthStatus = 'High Risk';
            overallEligible = false;
            issues.push('Student has high or critical health alerts');
          } else if (activeAlerts.length > 0) {
            healthStatus = 'Has Alerts';
            overallEligible = false;
            issues.push('Student has active health alerts');
          } else {
            const activeMeds = healthRecord.medicationLog?.filter(med => med.isActive) || [];
            if (activeMeds.length > 0) {
              healthStatus = 'On Medication';
              // Still eligible if on medication but no alerts
              overallEligible = true;
            } else {
              healthStatus = 'Healthy';
              overallEligible = true;
            }
          }
        } else {
          healthStatus = 'No Record';
          overallEligible = false;
          issues.push('No health record found');
        }
      } catch (error) {
        healthStatus = 'No Record';
        overallEligible = false;
        issues.push('Unable to check health status');
      }

      // Update assignment eligibility
      const latestAssignment = await this.studentSportsModel.findById(assignment._id).lean();
      await this.studentSportsModel.findByIdAndUpdate(assignment._id, {
        isEligible: overallEligible,
        eligibilityNotes: issues.join('; '),
        lastEligibilityCheck: new Date()
      });

      const eligibilityData = {
        studentId,
        sportsProgramId,
        isEligible: overallEligible,
        healthStatus,
        issues,
        lastChecked: new Date()
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student eligibility checked successfully',
        data: eligibilityData
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to check student eligibility',
        data: null
      };
    }
  }

  async updateStudentMedicalInfo(assignmentId: string, medicalData: any, updatedBy: string, role?: string): Promise<any> {
    try {
      if (!assignmentId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Assignment ID is required',
          data: null
        };
      }

      const updateFields: any = { updatedBy, updatedAt: new Date() };

      // Get current assignment to check existing values
      const currentAssignment = await this.studentSportsModel.findById(assignmentId).lean();

      if (medicalData.physicalExamCompleted !== undefined) {
        updateFields.physicalExamCompleted = medicalData.physicalExamCompleted;
        updateFields.physicalExamDate = medicalData.physicalExamDate;
        updateFields.physicalExamExpiryDate = medicalData.physicalExamExpiryDate;
        updateFields.physicalExamDocumentId = medicalData.physicalExamDocumentId;
      }

      if (medicalData.medicalClearanceObtained !== undefined) {
        updateFields.medicalClearanceObtained = medicalData.medicalClearanceObtained;
        updateFields.medicalClearanceDate = medicalData.medicalClearanceDate;
        updateFields.medicalClearanceDocumentId = medicalData.medicalClearanceDocumentId;
      }

      // Update medical clearance status based on both physical exam and medical clearance
      const physicalExamCompleted = updateFields.physicalExamCompleted !== undefined
        ? updateFields.physicalExamCompleted
        : currentAssignment?.physicalExamCompleted;
      const physicalExamDate = updateFields.physicalExamDate || currentAssignment?.physicalExamDate;
      const medicalClearanceObtained = updateFields.medicalClearanceObtained !== undefined
        ? updateFields.medicalClearanceObtained
        : currentAssignment?.medicalClearanceObtained;
      const medicalClearanceDate = updateFields.medicalClearanceDate || currentAssignment?.medicalClearanceDate;

      if (physicalExamCompleted && physicalExamDate && medicalClearanceObtained && medicalClearanceDate) {
        updateFields.medicalClearanceStatus = 'cleared';
      } else if (physicalExamCompleted || medicalClearanceObtained) {
        updateFields.medicalClearanceStatus = 'pending';
      } else {
        updateFields.medicalClearanceStatus = 'no_record';
      }

      if (medicalData.consentFormSigned !== undefined) {
        updateFields.consentFormSigned = medicalData.consentFormSigned;
        updateFields.consentFormDate = medicalData.consentFormDate;
        updateFields.consentFormDocumentId = medicalData.consentFormDocumentId;
      }


      const assignment = await this.studentSportsModel.findByIdAndUpdate(
        assignmentId,
        updateFields,
        { new: true, runValidators: true }
      ).populate('studentId', 'firstName lastName').populate('sportsProgramId', 'name').lean();

      if (!assignment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student sports assignment not found',
          data: null
        };
      }

      // Log activity
      await this.activityService.create({
        title: 'Updated student medical info for sports',
        subtitle: 'Medical information updated',
        performBy: role || 'NURSE',
        actorId: new Types.ObjectId(updatedBy)
      });

      // Transform for response
      const transformedAssignment = {
        ...assignment,
        student: assignment.studentId,
        program: assignment.sportsProgramId
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student medical info updated successfully',
        data: transformedAssignment
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to update student medical info',
        data: null
      };
    }
  }

  // ==================== SCHEDULE MANAGEMENT ====================

  async createSportsSchedule(scheduleData: any, createdBy: string, role?: string): Promise<any> {
    try {
      if (!scheduleData.programId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Program ID is required',
          data: null
        };
      }

      // Validate start and end dates
      const startDate = new Date(scheduleData.startDate || scheduleData.date);
      const endDate = new Date(scheduleData.endDate || scheduleData.startDate || scheduleData.date);
      
      if (isNaN(startDate.getTime())) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid start date',
          data: null
        };
      }
      
      if (isNaN(endDate.getTime())) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid end date',
          data: null
        };
      }
      
      if (endDate < startDate) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'End date cannot be before start date',
          data: null
        };
      }

      // Validate and process time slots
      let timeSlots: any[] = [];
      if (scheduleData.timeSlots && Array.isArray(scheduleData.timeSlots) && scheduleData.timeSlots.length > 0) {
        // Validate time slots
        for (const slot of scheduleData.timeSlots) {
          if (!slot.date || !slot.startTime || !slot.endTime) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'All time slots must have date, start time, and end time',
              data: null
            };
          }
          
          const slotDate = new Date(slot.date);
          if (slotDate < startDate || slotDate > endDate) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Time slot date must be between start and end date',
              data: null
            };
          }
          
          // Validate time format (HH:mm)
          const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Time slots must be in HH:mm format',
              data: null
            };
          }
          
          if (slot.startTime >= slot.endTime) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Time slot start time must be before end time',
              data: null
            };
          }
        }
        
        // Check for overlapping time slots on the same day
        const slotsByDate: Record<string, any[]> = {};
        for (const slot of scheduleData.timeSlots) {
          const dateKey = new Date(slot.date).toISOString().split('T')[0];
          if (!slotsByDate[dateKey]) {
            slotsByDate[dateKey] = [];
          }
          slotsByDate[dateKey].push(slot);
        }
        
        for (const dateKey in slotsByDate) {
          const daySlots = slotsByDate[dateKey].sort((a, b) => a.startTime.localeCompare(b.startTime));
          for (let i = 0; i < daySlots.length - 1; i++) {
            const current = daySlots[i];
            const next = daySlots[i + 1];
            if (current.endTime > next.startTime) {
              return {
                success: false,
                statusCode: HttpStatus.BAD_REQUEST,
                message: `Time slots overlap on ${dateKey}: ${current.startTime}-${current.endTime} and ${next.startTime}-${next.endTime}`,
                data: null
              };
            }
          }
        }
        
        // Transform time slots
        timeSlots = scheduleData.timeSlots.map((slot: any) => ({
          date: new Date(slot.date),
          startTime: slot.startTime,
          endTime: slot.endTime,
          description: slot.description || ''
        }));
      }

      // Transform frontend data to match backend schema
      const transformedData: any = {
        sportsProgramId: scheduleData.programId,
        title: scheduleData.title || `${scheduleData.eventType}`,
        eventType: scheduleData.eventType?.toLowerCase(),
        startDate: startDate,
        endDate: endDate,
        startTime: scheduleData.time || scheduleData.startTime || (timeSlots.length > 0 ? timeSlots[0].startTime : '00:00'),
        endTime: scheduleData.endTime || scheduleData.time || (timeSlots.length > 0 ? timeSlots[timeSlots.length - 1].endTime : '23:59'),
        location: scheduleData.location || scheduleData.venue || 'TBD',
        description: scheduleData.description,
        opponent: scheduleData.opponent,
        isRecurring: scheduleData.isRecurring || false,
        recurringPattern: scheduleData.recurringPattern,
        recurringEndDate: scheduleData.recurringEndDate ? new Date(scheduleData.recurringEndDate) : undefined,
        maxAttendees: scheduleData.maxParticipants ? parseInt(scheduleData.maxParticipants) : undefined,
        specialInstructions: scheduleData.notes || scheduleData.specialInstructions,
        requiresTransportation: scheduleData.requiresTransportation || false,
        timeSlots: timeSlots
      };

      // Get school ID from sports program
      const sportsProgram = await this.sportsProgramModel.findById(transformedData.sportsProgramId);
      if (!sportsProgram) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }
      transformedData.schoolId = sportsProgram.schoolId;

      // Check for academic conflicts
      const academicConflictCheck = await this.checkAcademicConflicts(transformedData);
      
      // Check for schedule conflicts (only warn, don't block)
      const scheduleConflictCheck = await this.checkScheduleConflicts({
        ...transformedData,
        excludeId: undefined // No excludeId for new schedules
      });

      const schedule = new this.sportsScheduleModel({
        ...transformedData,
        conflictDetected: academicConflictCheck.hasConflicts || scheduleConflictCheck.hasConflicts,
        conflictReasons: [
          ...(academicConflictCheck.reasons || []),
          ...(scheduleConflictCheck.conflicts || [])
        ],
        createdBy,
        updatedBy: createdBy
      });

      const savedSchedule = await schedule.save();

      // Log activity
      await this.activityService.create({
        title: `Created sports schedule: ${savedSchedule.title}`,
        subtitle: `New ${savedSchedule.eventType} scheduled for ${savedSchedule.startDate.toDateString()}`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(createdBy)
      });

      // Transform for response
      const scheduleObj = savedSchedule.toObject();
      const transformedSchedule = {
        ...scheduleObj,
        program: scheduleObj.sportsProgramId,
        date: scheduleObj.startDate,
        type: scheduleObj.eventType,
        venue: scheduleObj.location,
        location: scheduleObj.location // Ensure location is included
      };

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Sports schedule created successfully',
        data: transformedSchedule
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to create sports schedule',
        data: null
      };
    }
  }

  async getSportsSchedules(filters: any): Promise<any> {
    try {
      const query: any = {};
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      if (filters.sportsProgramId) {
        query.sportsProgramId = new Types.ObjectId(filters.sportsProgramId);
      }

      if (filters.schoolId) {
        query.schoolId = new Types.ObjectId(filters.schoolId);
      }

      if (filters.eventType) {
        query.eventType = filters.eventType;
      }

      if (filters.startDate && filters.endDate) {
        query.startDate = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate)
        };
      }

      if (filters.isActive !== undefined) {
        query.isActive = filters.isActive;
      } else {
        query.isActive = true; // Default to active schedules
      }

      // If search is provided, use aggregation to search program names
      if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');
        
        // First, find programs matching the search term
        const matchingPrograms = await this.sportsProgramModel.find({
          name: { $regex: searchRegex }
        }).select('_id').lean();
        
        const matchingProgramIds = matchingPrograms.map(p => p._id);
        
        // Build search query including program IDs
        const searchQuery = {
          ...query,
          $or: [
            { title: { $regex: searchRegex } },
            { description: { $regex: searchRegex } },
            { location: { $regex: searchRegex } },
            { opponent: { $regex: searchRegex } },
            ...(matchingProgramIds.length > 0 ? [{ sportsProgramId: { $in: matchingProgramIds } }] : [])
          ]
        };
        
        // Get total count with search
        const totalCount = await this.sportsScheduleModel.countDocuments(searchQuery);
        
        const schedules = await this.sportsScheduleModel
          .find(searchQuery)
          .populate({
            path: 'sportsProgramId',
            select: 'name type season schoolId',
            populate: {
              path: 'schoolId',
              select: 'name _id'
            }
          })
          .populate('createdBy', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec();
        
        // Transform data for frontend compatibility
        const transformedSchedules = schedules.map((schedule: any) => {
          const program = schedule.sportsProgramId as any;
          return {
            ...schedule,
            program: program,
            date: schedule.startDate,
            type: schedule.eventType,
            venue: schedule.location,
            location: schedule.location, // Ensure location is included
            schoolId: program?.schoolId || schedule.schoolId || null,
            school: program?.schoolId || schedule.schoolId || null
          };
        });
        
        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Sports schedules fetched successfully',
          data: {
            schedules: transformedSchedules,
            pagination: getPaginationMeta(page, limit, totalCount)
          }
        };
      } else {
        // No search - use regular query
        const totalCount = await this.sportsScheduleModel.countDocuments(query);

        const schedules = await this.sportsScheduleModel
          .find(query)
          .populate({
            path: 'sportsProgramId',
            select: 'name type season schoolId',
            populate: {
              path: 'schoolId',
              select: 'name _id'
            }
          })
          .populate('createdBy', 'firstName lastName')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec();

        // Transform data for frontend compatibility
        const transformedSchedules = schedules.map((schedule: any) => {
          const program = schedule.sportsProgramId as any;
          return {
            ...schedule,
            program: program,
            date: schedule.startDate,
            type: schedule.eventType,
            venue: schedule.location,
            location: schedule.location, // Ensure location is included
            schoolId: program?.schoolId || schedule.schoolId || null,
            school: program?.schoolId || schedule.schoolId || null
          };
        });
        
        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Sports schedules fetched successfully',
          data: {
            schedules: transformedSchedules,
            pagination: getPaginationMeta(page, limit, totalCount)
          }
        };
      }
      
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to fetch sports schedules',
        data: null
      };
    }
  }

  private async checkAcademicConflicts(scheduleData: any): Promise<{ hasConflicts: boolean; reasons: string[] }> {
    // This would integrate with the existing schedule/course system
    // For now, returning a basic implementation
    const conflicts = [];
    let hasConflicts = false;

    // Check if the time conflicts with regular school hours
    const startHour = parseInt(scheduleData.startTime.split(':')[0]);
    if (startHour >= 8 && startHour < 15) { // Assuming school hours 8 AM - 3 PM
      conflicts.push('Conflicts with regular school hours');
      hasConflicts = true;
    }

    return { hasConflicts, reasons: conflicts };
  }

  // ==================== ATTENDANCE MANAGEMENT ====================

  async recordSportsAttendance(attendanceData: any, recordedBy: string, role?: string, schoolId?: string): Promise<any> {
    try {
      if (!attendanceData.scheduleId || !attendanceData.studentId || !attendanceData.attendanceDate) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Schedule ID, Student ID, and Attendance Date are required',
          data: null
        };
      }

      const existingRecord = await this.sportsAttendanceModel.findOne({
        scheduleId: attendanceData.scheduleId,
        studentId: attendanceData.studentId,
        attendanceDate: attendanceData.attendanceDate
      });

      let savedAttendance;

      if (existingRecord) {
        // Update existing record
        savedAttendance = await this.sportsAttendanceModel.findByIdAndUpdate(
          existingRecord._id,
          { ...attendanceData, recordedBy, recordedAt: new Date(), updatedBy: recordedBy, updatedAt: new Date() },
          { new: true, runValidators: true }
        ).populate(['studentId', 'scheduleId', 'sportsProgramId']).lean();
      } else {
        // Get schoolId from schedule if not provided
        if (!schoolId) {
          const schedule = await this.sportsScheduleModel.findById(attendanceData.scheduleId);
          if (schedule) {
            schoolId = schedule.schoolId.toString();
          }
        }

        const attendance = new this.sportsAttendanceModel({
          ...attendanceData,
          schoolId: schoolId || attendanceData.schoolId,
          recordedBy,
          recordedAt: new Date()
        });

        savedAttendance = await attendance.save();
        savedAttendance = await this.sportsAttendanceModel
          .findById(savedAttendance._id)
          .populate(['studentId', 'scheduleId', 'sportsProgramId'])
          .lean();
      }

      // Transform for response
      const transformedAttendance = {
        ...savedAttendance,
        student: savedAttendance.studentId,
        schedule: savedAttendance.scheduleId,
        markedAt: savedAttendance.recordedAt || savedAttendance.attendanceDate,
        markedBy: savedAttendance.recordedBy
      };

      return {
        success: true,
        statusCode: existingRecord ? HttpStatus.OK : HttpStatus.CREATED,
        message: existingRecord ? 'Attendance updated successfully' : 'Attendance recorded successfully',
        data: transformedAttendance
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to record sports attendance',
        data: null
      };
    }
  }

  async getSportsAttendance(filters: any): Promise<any> {
    try {
      const query: any = {};
      const page = Math.max(Number(filters?.page) || 1, 1);
      const limit = Math.min(Math.max(Number(filters?.limit) || 10, 1), 100);
      const skip = (page - 1) * limit;

      if (filters.scheduleId) {
        try {
          query.scheduleId = new Types.ObjectId(filters.scheduleId);
        } catch (error) {
          // Invalid ObjectId, skip this filter
          console.warn('Invalid scheduleId:', filters.scheduleId);
        }
      }

      if (filters.sportsProgramId) {
        try {
          query.sportsProgramId = new Types.ObjectId(filters.sportsProgramId);
        } catch (error) {
          // Invalid ObjectId, skip this filter
          console.warn('Invalid sportsProgramId:', filters.sportsProgramId);
        }
      }

      // Handle multiple program IDs (for teachers filtering by their programs)
      if (filters.sportsProgramIds && Array.isArray(filters.sportsProgramIds) && filters.sportsProgramIds.length > 0) {
        try {
          query.sportsProgramId = {
            $in: filters.sportsProgramIds.map((id: string) => new Types.ObjectId(id))
          };
        } catch (error) {
          console.warn('Invalid sportsProgramIds:', filters.sportsProgramIds);
        }
      }

      if (filters.studentId) {
        try {
          // Check if it's a valid ObjectId format
          if (Types.ObjectId.isValid(filters.studentId)) {
            query.studentId = new Types.ObjectId(filters.studentId);
          } else {
            query.studentId = filters.studentId;
          }
        } catch (error) {
          query.studentId = filters.studentId;
        }
      }

      if (filters.schoolId) {
        try {
          if (Types.ObjectId.isValid(filters.schoolId)) {
            query.schoolId = new Types.ObjectId(filters.schoolId);
          }
        } catch (error) {
          // Invalid ObjectId, skip this filter
          console.warn('Invalid schoolId:', filters.schoolId);
        }
      }

      if (filters.parentId) {
        try {
          // Find students by parent
          const parentUser = await this.userModel.findById(filters.parentId).populate('children').lean();
          if (!parentUser) {
            // No parent found, return empty
            return {
              success: true,
              statusCode: HttpStatus.OK,
              message: 'Sports attendance retrieved successfully',
              data: {
                attendance: [],
                pagination: getPaginationMeta(page, limit, 0)
              }
            };
          }
          const studentIds = (parentUser as any)?.children?.map((child: any) => child._id?.toString()) || [];
          if (studentIds.length > 0) {
            query.studentId = { $in: studentIds.map((id: string) => Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id) };
          } else {
            // No children found, return empty
            return {
              success: true,
              statusCode: HttpStatus.OK,
              message: 'Sports attendance retrieved successfully',
              data: {
                attendance: [],
                pagination: getPaginationMeta(page, limit, 0)
              }
            };
          }
        } catch (error) {
          // Error finding parent, return empty
          console.error('Error finding parent:', error);
          return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'Sports attendance retrieved successfully',
            data: {
              attendance: [],
              pagination: getPaginationMeta(page, limit, 0)
            }
          };
        }
      }

      if (filters.startDate && filters.endDate) {
        try {
          query.attendanceDate = {
            $gte: new Date(filters.startDate),
            $lte: new Date(filters.endDate)
          };
        } catch (error) {
          // Invalid date, skip this filter
          console.warn('Invalid date range:', filters.startDate, filters.endDate);
        }
      }

      if (filters.status) {
        query.status = filters.status;
      }

      // Handle search - search in student name, student ID, and program name
      let searchQuery = query;
      if (filters.search && filters.search.trim()) {
        const searchRegex = new RegExp(filters.search.trim(), 'i');
        
        // Find students matching the search term
        const matchingStudents = await this.userModel.find({
          $or: [
            { firstName: { $regex: searchRegex } },
            { lastName: { $regex: searchRegex } },
            { studentId: { $regex: searchRegex } }
          ],
          role: 'STUDENT'
        }).select('_id').lean();
        
        const matchingStudentIds = matchingStudents.map(s => s._id);
        
        // Find programs matching the search term
        const matchingPrograms = await this.sportsProgramModel.find({
          name: { $regex: searchRegex }
        }).select('_id').lean();
        
        const matchingProgramIds = matchingPrograms.map(p => p._id);
        
        // Build search query
        searchQuery = {
          ...query,
          $or: [
            ...(matchingStudentIds.length > 0 ? [{ studentId: { $in: matchingStudentIds } }] : []),
            ...(matchingProgramIds.length > 0 ? [{ sportsProgramId: { $in: matchingProgramIds } }] : [])
          ]
        };
        
        // If no matches found, return empty result
        if (matchingStudentIds.length === 0 && matchingProgramIds.length === 0) {
          return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'Sports attendance retrieved successfully',
            data: {
              attendance: [],
              pagination: getPaginationMeta(page, limit, 0)
            }
          };
        }
      }

      // Log query for debugging
      console.log('Attendance query:', JSON.stringify(searchQuery, null, 2));
      console.log('Filters received:', JSON.stringify(filters, null, 2));

      // Get total count
      let totalCount = 0;
      try {
        totalCount = await this.sportsAttendanceModel.countDocuments(searchQuery).exec();
      } catch (countError) {
        console.error('Error counting attendance documents:', countError);
        console.error('Query used for count:', JSON.stringify(searchQuery, null, 2));
        // If count fails, try to continue with 0
        totalCount = 0;
      }

      // Fetch attendance records with populate
      let attendance = [];
      try {
        attendance = await this.sportsAttendanceModel
          .find(searchQuery)
          .populate({
            path: 'studentId',
            select: 'firstName lastName studentId email gradeLevel'
          })
          .populate({
            path: 'sportsProgramId',
            select: 'name season type schoolId',
            populate: {
              path: 'schoolId',
              select: 'name _id'
            }
          })
          .populate({
            path: 'scheduleId',
            select: 'title eventType startDate startTime schoolId',
            populate: {
              path: 'schoolId',
              select: 'name _id'
            }
          })
          .populate('recordedBy', 'firstName lastName')
          .sort({ attendanceDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec();
      } catch (findError) {
        console.error('Error fetching attendance records:', findError);
        console.error('Query used for find:', JSON.stringify(query, null, 2));
        console.error('Error details:', {
          message: findError?.message,
          stack: findError?.stack,
          name: findError?.name
        });

        // If find fails, try without populate
        try {
          attendance = await this.sportsAttendanceModel
            .find(query)
            .sort({ attendanceDate: -1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec();
        } catch (simpleFindError) {
          console.error('Error fetching attendance without populate:', simpleFindError);
          console.error('Simple find error details:', {
            message: simpleFindError?.message,
            stack: simpleFindError?.stack,
            name: simpleFindError?.name
          });
          // Return empty result if even simple find fails
          attendance = [];
        }
      }

      // Transform data for frontend compatibility
      const transformedAttendance = (attendance || []).map((record: any) => {
        // Handle student data - it should be populated, but handle null case
        const student = record.studentId || null;

        return {
          ...record,
          student: student || null, // Map studentId to student for frontend (should be populated)
          studentId: student?._id || record.studentId || null, // Keep original studentId reference
          schedule: record.scheduleId || null, // Map scheduleId to schedule for frontend
          program: record.sportsProgramId || null,
          markedAt: record.recordedAt || record.attendanceDate,
          markedBy: record.recordedBy || null
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports attendance retrieved successfully',
        data: {
          attendance: transformedAttendance,
          pagination: getPaginationMeta(page, limit, totalCount)
        }
      };
    } catch (error) {
      console.error('Error in getSportsAttendance service:', error);
      console.error('Error stack:', error?.stack);
      console.error('Error name:', error?.name);
      console.error('Filters received:', JSON.stringify(filters, null, 2));

      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to retrieve sports attendance',
        data: null
      };
    }
  }

  // ==================== REPORTING ====================

  async getSportsParticipationReport(schoolId: string, filters?: any): Promise<any> {
    try {
      if (!schoolId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null
        };
      }

      const matchStage: any = { schoolId: new Types.ObjectId(schoolId) };

      if (filters?.academicYear) {
        matchStage.academicYear = filters.academicYear;
      }

      if (filters?.sportsProgramId) {
        matchStage.sportsProgramId = new Types.ObjectId(filters.sportsProgramId);
      }

      const participationStats = await this.studentSportsModel.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'sportsprograms',
            localField: 'sportsProgramId',
            foreignField: '_id',
            as: 'sportsProgram'
          }
        },
        { $unwind: '$sportsProgram' },
        {
          $lookup: {
            from: 'studentprofiles',
            localField: 'studentId',
            foreignField: '_id',
            as: 'student'
          }
        },
        { $unwind: '$student' },
        {
          $group: {
            _id: {
              sportsProgramId: '$sportsProgramId',
              programName: '$sportsProgram.name',
              gradeLevel: '$student.gradeLevel'
            },
            totalParticipants: { $sum: 1 },
            activeParticipants: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            eligibleParticipants: {
              $sum: { $cond: ['$isEligible', 1, 0] }
            }
          }
        },
        {
          $group: {
            _id: {
              sportsProgramId: '$_id.sportsProgramId',
              programName: '$_id.programName'
            },
            totalParticipants: { $sum: '$totalParticipants' },
            activeParticipants: { $sum: '$activeParticipants' },
            eligibleParticipants: { $sum: '$eligibleParticipants' },
            gradeBreakdown: {
              $push: {
                grade: '$_id.gradeLevel',
                count: '$totalParticipants'
              }
            }
          }
        }
      ]);

      const reportData = {
        participationStats,
        reportGeneratedAt: new Date(),
        filters
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Participation report generated successfully',
        data: reportData
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to generate participation report',
        data: null
      };
    }
  }

  async getSportsAttendanceReport(schoolId: string, filters?: any): Promise<any> {
    try {
      if (!schoolId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null
        };
      }

      const matchStage: any = { schoolId: new Types.ObjectId(schoolId) };

      if (filters?.sportsProgramId) {
        matchStage.sportsProgramId = new Types.ObjectId(filters.sportsProgramId);
      }

      // Removed date filtering - get ALL attendance records regardless of date
      // Only apply date filter if explicitly requested via query params
      if (filters?.includeDateFilter === true && filters?.startDate && filters?.endDate) {
        matchStage.attendanceDate = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate)
        };
      }

      const attendanceStats = await this.sportsAttendanceModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              studentId: '$studentId',
              sportsProgramId: '$sportsProgramId'
            },
            totalSessions: { $sum: 1 },
            presentCount: {
              $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
            },
            absentCount: {
              $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] }
            },
            excusedAbsences: {
              $sum: { $cond: [{ $eq: ['$absenceType', 'excused'] }, 1, 0] }
            },
            unexcusedAbsences: {
              $sum: { $cond: [{ $eq: ['$absenceType', 'unexcused'] }, 1, 0] }
            }
          }
        },
        {
          $addFields: {
            attendanceRate: {
              $cond: [
                { $gt: ['$totalSessions', 0] },
                { $multiply: [{ $divide: ['$presentCount', '$totalSessions'] }, 100] },
                0
              ]
            }
          }
        },
        {
          $lookup: {
            from: 'studentprofiles',
            localField: '_id.studentId',
            foreignField: '_id',
            as: 'student'
          }
        },
        { $unwind: '$student' },
        {
          $lookup: {
            from: 'sportsprograms',
            localField: '_id.sportsProgramId',
            foreignField: '_id',
            as: 'sportsProgram'
          }
        },
        { $unwind: '$sportsProgram' }
      ]);

      const reportData = {
        attendanceStats,
        reportGeneratedAt: new Date(),
        filters
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Attendance report generated successfully',
        data: reportData
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to generate attendance report',
        data: null
      };
    }
  }

  async getSportsOverviewReport(schoolId: string, filters?: any): Promise<any> {
    try {
      if (!schoolId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null
        };
      }

      // Validate and convert schoolId to ObjectId
      let schoolObjectId: Types.ObjectId;
      try {
        if (!Types.ObjectId.isValid(schoolId)) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid school ID format',
            data: null
          };
        }
        schoolObjectId = new Types.ObjectId(schoolId);
      } catch (error) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid school ID format',
          data: null
        };
      }

      const query: any = { schoolId: schoolObjectId };

      // Apply program filter if provided and valid
      if (filters?.program && filters.program !== 'undefined' && filters.program !== 'all') {
        try {
          if (Types.ObjectId.isValid(filters.program)) {
            query._id = new Types.ObjectId(filters.program);
          }
        } catch (error) {
          // Ignore invalid program filter
        }
      }

      // Get sports programs - filter by isActive: true (not false)
      query.isActive = { $ne: false }; // Include active and undefined (default active)
      const programs = await this.sportsProgramModel.find(query).lean();

      // Count only truly active programs (isActive === true)
      const activePrograms = programs.filter(p => p.isActive === true || p.isActive === undefined);
      const activeProgramsCount = activePrograms.length;

      // Get student assignments
      const assignments = await this.studentSportsModel.find({
        schoolId: schoolObjectId,
        status: 'active'
      }).populate('sportsProgramId').lean();

      // Get ALL attendance records (no date filtering)
      const now = new Date(); // Declare once at the top
      const attendanceQuery: any = { schoolId: schoolObjectId };

      // Remove date filtering - get ALL attendance records regardless of date
      // This ensures all records are included in reports and exports
      const attendance = await this.sportsAttendanceModel.find(attendanceQuery).lean();

      // Get events this month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const eventsThisMonth = await this.sportsScheduleModel.countDocuments({
        schoolId: schoolObjectId,
        startDate: { $gte: monthStart, $lte: monthEnd },
        isActive: { $ne: false }
      });

      // Get ALL attendance records for trends and performance calculations (no date filtering)
      const allAttendanceForAnalysis = await this.sportsAttendanceModel.find({
        schoolId: schoolObjectId
      }).populate('sportsProgramId').sort({ attendanceDate: -1 }).lean();

      // Calculate trends using all data (last 4 weeks for comparison, but use all data)
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      // Use all attendance for calculations, but compare last 2 weeks vs previous 2 weeks for trends
      const recentAttendance = allAttendanceForAnalysis;

      // Calculate attendance trends by program
      const attendanceTrends = activePrograms.slice(0, 5).map((program: any) => {
        const programAttendance = recentAttendance.filter((a: any) =>
          (a.sportsProgramId as any)?._id?.toString() === program._id.toString()
        );
        const lastTwoWeeks = programAttendance.filter((a: any) =>
          new Date(a.attendanceDate) >= twoWeeksAgo
        );
        const previousTwoWeeks = programAttendance.filter((a: any) => {
          const date = new Date(a.attendanceDate);
          return date >= fourWeeksAgo && date < twoWeeksAgo;
        });

        const currentRate = lastTwoWeeks.length > 0
          ? Math.round((lastTwoWeeks.filter((a: any) => a.status === 'present').length / lastTwoWeeks.length) * 100)
          : 0;
        const previousRate = previousTwoWeeks.length > 0
          ? Math.round((previousTwoWeeks.filter((a: any) => a.status === 'present').length / previousTwoWeeks.length) * 100)
          : 0;

        return {
          program: program.name,
          period: 'Last 2 weeks',
          rate: currentRate,
          change: currentRate - previousRate
        };
      });

      // Get schedules count per program
      const schedulesByProgram = await this.sportsScheduleModel.aggregate([
        {
          $match: {
            schoolId: schoolObjectId,
            isActive: { $ne: false }
          }
        },
        {
          $group: {
            _id: '$sportsProgramId',
            eventCount: { $sum: 1 }
          }
        }
      ]);

      // Calculate program performance with attendance rates
      const programPerformance = activePrograms.map((program: any) => {
        const programAttendance = recentAttendance.filter((a: any) =>
          (a.sportsProgramId as any)?._id?.toString() === program._id.toString()
        );
        const attendanceRate = programAttendance.length > 0
          ? Math.round((programAttendance.filter((a: any) => a.status === 'present').length / programAttendance.length) * 100)
          : 0;

        const scheduleCount = schedulesByProgram.find((s: any) =>
          s._id.toString() === program._id.toString()
        )?.eventCount || 0;

        return {
          id: program._id,
          name: program.name,
          season: program.season || 'N/A',
          studentCount: assignments.filter(a => (a.sportsProgramId as any)?._id?.toString() === program._id.toString()).length,
          attendanceRate: attendanceRate,
          eventCount: scheduleCount
        };
      });

      // Get top student performers (by attendance rate) - use ALL attendance records
      const studentAttendanceStats = await this.sportsAttendanceModel.aggregate([
        {
          $match: {
            schoolId: schoolObjectId
            // Removed date filter - get ALL attendance records
          }
        },
        {
          $group: {
            _id: '$studentId',
            totalEvents: { $sum: 1 },
            presentCount: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
            programIds: { $addToSet: '$sportsProgramId' }
          }
        },
        {
          $addFields: {
            attendanceRate: {
              $cond: [
                { $gt: ['$totalEvents', 0] },
                { $multiply: [{ $divide: ['$presentCount', '$totalEvents'] }, 100] },
                0
              ]
            }
          }
        },
        { $sort: { attendanceRate: -1, totalEvents: -1 } },
        { $limit: 10 }
      ]);

      // Populate student names - stat._id is studentId which references StudentProfile
      const topPerformers = await Promise.all(
        studentAttendanceStats.map(async (stat: any) => {
          // studentId in attendance references StudentProfile, not User
          const student = await this.userModel.findById(stat._id).lean();
          const program = stat.programIds && stat.programIds.length > 0
            ? await this.sportsProgramModel.findById(stat.programIds[0]).lean()
            : null;

          return {
            name: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : 'Unknown Student',
            program: program ? (program as any).name : 'N/A',
            attendanceRate: Math.round(stat.attendanceRate || 0),
            eventsAttended: stat.presentCount || 0,
            totalEvents: stat.totalEvents || 0
          };
        })
      );

      // Calculate key insights using ALL attendance records (no date filtering)
      const allAttendance = await this.sportsAttendanceModel.find({
        schoolId: schoolObjectId
        // Removed date filter - get ALL attendance records for insights
      }).lean();

      // Best attendance day
      const dayCounts: any = {};
      allAttendance.forEach((a: any) => {
        const date = new Date(a.attendanceDate);
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        if (a.status === 'present') {
          dayCounts[day] = (dayCounts[day] || 0) + 1;
        }
      });
      const bestAttendanceDay = Object.keys(dayCounts).reduce((a, b) =>
        dayCounts[a] > dayCounts[b] ? a : b, 'N/A'
      );

      // Peak attendance time
      const timeCounts: any = {};
      allAttendance.forEach((a: any) => {
        if (a.status === 'present' && a.scheduleId) {
          const schedule = schedulesByProgram.find((s: any) => s._id.toString() === (a.scheduleId as any).toString());
          if (schedule) {
            const hour = new Date(a.attendanceDate).getHours();
            const timeSlot = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
            timeCounts[timeSlot] = (timeCounts[timeSlot] || 0) + 1;
          }
        }
      });
      const peakTime = Object.keys(timeCounts).reduce((a, b) =>
        timeCounts[a] > timeCounts[b] ? a : b, 'Afternoon'
      );

      // Most active program
      const programActivity: any = {};
      programPerformance.forEach((p: any) => {
        programActivity[p.name] = p.eventCount * p.attendanceRate / 100;
      });
      const mostActiveProgram = Object.keys(programActivity).reduce((a, b) =>
        programActivity[a] > programActivity[b] ? a : b, activePrograms[0]?.name || 'N/A'
      );

      // New registrations - count ALL active assignments (no date filter)
      const newRegistrations = await this.studentSportsModel.countDocuments({
        schoolId: schoolObjectId,
        status: 'active'
        // Removed enrollmentDate filter - count ALL active assignments
      });

      // Retention rate - calculate based on ALL active assignments
      const activeAssignments = await this.studentSportsModel.find({
        schoolId: schoolObjectId,
        status: 'active'
      }).lean();
      const retentionRate = activeAssignments.length > 0 ? 100 : 0; // All active assignments are retained

      const reportData = {
        totalPrograms: programs.length,
        activePrograms: activeProgramsCount, // Count only active programs
        totalStudents: assignments.length,
        eventsThisMonth: eventsThisMonth,
        programs: programs.map(program => ({
          id: program._id,
          name: program.name,
          sport: program.name, // Using program name as sport name
          studentCount: assignments.filter(a => (a.sportsProgramId as any)?._id?.toString() === program._id.toString()).length,
          isActive: program.isActive === true || program.isActive === undefined
        })),
        attendanceSummary: {
          totalSessions: attendance.length,
          averageAttendance: attendance.length > 0 ?
            Math.round((attendance.filter(a => (a as any).status === 'present').length / attendance.length) * 100)
            : 0
        },
        // Add new report sections
        attendance: {
          trends: attendanceTrends
        },
        participation: {
          programs: programPerformance
        },
        students: topPerformers,
        insights: {
          bestAttendanceDay: bestAttendanceDay,
          peakTime: peakTime,
          mostActiveProgram: mostActiveProgram,
          newRegistrations: newRegistrations,
          retentionRate: retentionRate,
          completionRate: Math.round((activeProgramsCount / Math.max(programs.length, 1)) * 100)
        },
        reportGeneratedAt: new Date(),
        filters
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Overview report generated successfully',
        data: reportData
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to generate overview report',
        data: null
      };
    }
  }

  // ==================== SCHEDULE MANAGEMENT ====================

  async getSportsScheduleById(id: string): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Schedule ID is required',
          data: null
        };
      }

      const schedule = await this.sportsScheduleModel
        .findById(id)
        .populate('sportsProgramId', 'name type season')
        .populate('createdBy', 'firstName lastName')
        .populate('updatedBy', 'firstName lastName')
        .populate('schoolId', 'name')
        .lean();

      if (!schedule) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports schedule not found',
          data: null
        };
      }

      // Transform for response
      const transformedSchedule = {
        ...schedule,
        program: schedule.sportsProgramId,
        date: schedule.startDate,
        type: schedule.eventType,
        venue: schedule.location,
        time: schedule.startTime,
        endTime: schedule.endTime,
        location: schedule.location,
        requiresTransportation: schedule.requiresTransportation || false
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports schedule retrieved successfully',
        data: transformedSchedule
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to retrieve sports schedule',
        data: null
      };
    }
  }

  async updateSportsSchedule(id: string, updateData: any, updatedBy: string, role?: string): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Schedule ID is required',
          data: null
        };
      }

      const schedule = await this.sportsScheduleModel.findById(id);
      if (!schedule) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: `Sports schedule with ID ${id} not found`,
          data: null
        };
      }

      // Check for conflicts if date/time is being updated
      if (updateData.startDate || updateData.endDate || updateData.startTime || updateData.endTime) {
        const conflictCheck = await this.checkScheduleConflicts({
          ...updateData,
          sportsProgramId: schedule.sportsProgramId,
          excludeId: id
        });

        if (conflictCheck.hasConflicts) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: `Schedule conflicts detected: ${conflictCheck.conflicts.join(', ')}`,
            data: null
          };
        }
      }

      // Validate and process time slots if provided
      if (updateData.timeSlots && Array.isArray(updateData.timeSlots)) {
        const startDate = updateData.startDate ? new Date(updateData.startDate) : schedule.startDate;
        const endDate = updateData.endDate ? new Date(updateData.endDate) : schedule.endDate;
        
        // Validate time slots
        for (const slot of updateData.timeSlots) {
          if (!slot.date || !slot.startTime || !slot.endTime) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'All time slots must have date, start time, and end time',
              data: null
            };
          }
          
          const slotDate = new Date(slot.date);
          if (slotDate < startDate || slotDate > endDate) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Time slot date must be between start and end date',
              data: null
            };
          }
          
          const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(slot.startTime) || !timeRegex.test(slot.endTime)) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Time slots must be in HH:mm format',
              data: null
            };
          }
          
          if (slot.startTime >= slot.endTime) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: 'Time slot start time must be before end time',
              data: null
            };
          }
        }
        
        // Check for overlapping time slots on the same day
        const slotsByDate: Record<string, any[]> = {};
        for (const slot of updateData.timeSlots) {
          const dateKey = new Date(slot.date).toISOString().split('T')[0];
          if (!slotsByDate[dateKey]) {
            slotsByDate[dateKey] = [];
          }
          slotsByDate[dateKey].push(slot);
        }
        
        for (const dateKey in slotsByDate) {
          const daySlots = slotsByDate[dateKey].sort((a, b) => a.startTime.localeCompare(b.startTime));
          for (let i = 0; i < daySlots.length - 1; i++) {
            const current = daySlots[i];
            const next = daySlots[i + 1];
            if (current.endTime > next.startTime) {
              return {
                success: false,
                statusCode: HttpStatus.BAD_REQUEST,
                message: `Time slots overlap on ${dateKey}: ${current.startTime}-${current.endTime} and ${next.startTime}-${next.endTime}`,
                data: null
              };
            }
          }
        }
        
        // Transform time slots
        updateData.timeSlots = updateData.timeSlots.map((slot: any) => ({
          date: new Date(slot.date),
          startTime: slot.startTime,
          endTime: slot.endTime,
          description: slot.description || ''
        }));
      }

      // Validate dates if provided
      if (updateData.startDate || updateData.endDate) {
        const startDate = updateData.startDate ? new Date(updateData.startDate) : schedule.startDate;
        const endDate = updateData.endDate ? new Date(updateData.endDate) : schedule.endDate;
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid date format',
            data: null
          };
        }
        
        if (endDate < startDate) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'End date cannot be before start date',
            data: null
          };
        }
      }

      // Transform frontend data to match backend schema
      const transformedUpdateData: any = {
        ...updateData,
        updatedBy,
        updatedAt: new Date()
      };

      // Map frontend field names to backend schema fields
      if (updateData.programId) {
        transformedUpdateData.sportsProgramId = updateData.programId;
        delete transformedUpdateData.programId;
      }
      
      // Transform date fields
      if (updateData.startDate) {
        transformedUpdateData.startDate = new Date(updateData.startDate);
      }
      if (updateData.endDate) {
        transformedUpdateData.endDate = new Date(updateData.endDate);
      }
      if (updateData.date) {
        transformedUpdateData.startDate = new Date(updateData.date);
        if (!updateData.endDate) {
          transformedUpdateData.endDate = new Date(updateData.date);
        }
        delete transformedUpdateData.date;
      }
      if (updateData.eventType) {
        transformedUpdateData.eventType = updateData.eventType.toLowerCase();
      }
      if (updateData.date) {
        transformedUpdateData.startDate = new Date(updateData.date);
        if (!updateData.endDate) {
          transformedUpdateData.endDate = new Date(updateData.date);
        }
      }
      if (updateData.time) {
        transformedUpdateData.startTime = updateData.time;
        if (!updateData.endTime) {
          transformedUpdateData.endTime = updateData.time;
        }
      }
      if (updateData.location || updateData.venue) {
        transformedUpdateData.location = updateData.location || updateData.venue;
      }
      if (updateData.notes !== undefined) {
        transformedUpdateData.specialInstructions = updateData.notes || updateData.specialInstructions;
      }
      if (updateData.maxParticipants !== undefined) {
        transformedUpdateData.maxAttendees = updateData.maxParticipants ? parseInt(updateData.maxParticipants) : undefined;
      }
      if (updateData.requiresTransportation !== undefined) {
        transformedUpdateData.requiresTransportation = updateData.requiresTransportation || false;
      }

      const updatedSchedule = await this.sportsScheduleModel.findByIdAndUpdate(
        id,
        transformedUpdateData,
        { new: true }
      ).populate(['sportsProgramId', 'createdBy', 'updatedBy']).lean();

      // Log activity
      await this.activityService.create({
        title: 'Updated sports schedule',
        subtitle: `Schedule ${updatedSchedule.title} updated`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(updatedBy)
      });

      // Transform for response
      const transformedSchedule = {
        ...updatedSchedule,
        program: updatedSchedule.sportsProgramId,
        date: updatedSchedule.startDate,
        type: updatedSchedule.eventType,
        venue: updatedSchedule.location,
        time: updatedSchedule.startTime,
        endTime: updatedSchedule.endTime,
        location: updatedSchedule.location,
        requiresTransportation: updatedSchedule.requiresTransportation || false
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports schedule updated successfully',
        data: transformedSchedule
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to update sports schedule',
        data: null
      };
    }
  }

  async deleteSportsSchedule(id: string, deletedBy: string, role?: string): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Schedule ID is required',
          data: null
        };
      }

      const schedule = await this.sportsScheduleModel.findById(id).lean();
      if (!schedule) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: `Sports schedule with ID ${id} not found`,
          data: null
        };
      }

      // Check if there's attendance recorded for this schedule
      const hasAttendance = await this.sportsAttendanceModel.findOne({ scheduleId: id });
      if (hasAttendance) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Cannot delete schedule with recorded attendance',
          data: null
        };
      }

      await this.sportsScheduleModel.findByIdAndDelete(id);

      // Log activity
      await this.activityService.create({
        title: 'Deleted sports schedule',
        subtitle: `Schedule ${(schedule as any).title} deleted`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(deletedBy)
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports schedule deleted successfully',
        data: null
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to delete sports schedule',
        data: null
      };
    }
  }

  // ==================== ATTENDANCE MANAGEMENT ====================

  async updateSportsAttendance(id: string, updateData: any, updatedBy: string, role?: string): Promise<any> {
    try {
      if (!id) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Attendance ID is required',
          data: null
        };
      }

      const attendance = await this.sportsAttendanceModel.findById(id).lean();
      if (!attendance) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: `Sports attendance with ID ${id} not found`,
          data: null
        };
      }

      const updatedAttendance = await this.sportsAttendanceModel.findByIdAndUpdate(
        id,
        {
          ...updateData,
          updatedBy,
          updatedAt: new Date()
        },
        { new: true }
      ).populate(['scheduleId', 'sportsProgramId', 'studentId', 'recordedBy', 'updatedBy']).lean();

      // Transform for response
      const transformedAttendance = {
        ...updatedAttendance,
        student: updatedAttendance.studentId,
        schedule: updatedAttendance.scheduleId,
        markedAt: updatedAttendance.recordedAt || updatedAttendance.attendanceDate,
        markedBy: updatedAttendance.recordedBy
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Sports attendance updated successfully',
        data: transformedAttendance
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to update sports attendance',
        data: null
      };
    }
  }

  // ==================== COACH SPECIFIC METHODS ====================

  async getCoachingPrograms(coachId: string): Promise<SportsProgram[]> {
    try {
      const programs = await this.sportsProgramModel.find({
        $or: [
          { coaches: { $in: [coachId] } },
          { assistantCoaches: { $in: [coachId] } }
        ],
        isActive: true
      }).populate(['coaches', 'assistantCoaches', 'schoolId']);

      return programs;
    } catch (error) {
      console.error('Error fetching coaching programs:', error);
      return [];
    }
  }

  async getCoachTeamStudents(coachId: string, filters: any = {}): Promise<any> {
    try {
      // First get programs coached by this user
      const programs = await this.getCoachingPrograms(coachId);
      const programIds = programs.map(p => (p as any)._id.toString());

      const matchQuery: any = {
        sportsProgramId: { $in: programIds },
        status: 'Active'
      };

      if (filters.sportsProgramId) {
        matchQuery.sportsProgramId = filters.sportsProgramId;
      }

      const students = await this.studentSportsModel.find(matchQuery)
        .populate(['studentId', 'sportsProgramId'])
        .sort({ joinDate: -1 });

      return students;
    } catch (error) {
      console.error('Error fetching coach team students:', error);
      return [];
    }
  }

  async notifyParentsOfAbsence(notificationData: any, notifiedBy: string): Promise<any> {
    try {
      const { studentIds, scheduleId, message } = notificationData;

      // Get student and schedule information
      const schedule = await this.sportsScheduleModel.findById(scheduleId).populate('sportsProgramId');
      if (!schedule) {
        throw new NotFoundException('Schedule not found');
      }

      const students = await this.studentSportsModel.find({
        studentId: { $in: studentIds },
        sportsProgramId: schedule.sportsProgramId
      }).populate('studentId');

      // Here you would integrate with your email service
      // For now, just return success
      return {
        success: true,
        message: 'Parent notifications sent successfully',
        notifiedStudents: students.length,
        scheduleInfo: schedule
      };
    } catch (error) {
      console.error('Error notifying parents:', error);
      throw error;
    }
  }

  // ==================== STUDENT PORTAL METHODS ====================

  async getStudentActiveSports(studentId: string): Promise<StudentSports[]> {
    try {
      // Convert ObjectId to string if needed for compatibility
      const studentIdStr = studentId.toString();

      const activeSports = await this.studentSportsModel.find({
        $or: [
          { studentId: studentId },
          { studentId: studentIdStr }
        ],
        status: 'active'
      }).populate('sportsProgramId', 'name description season type startDate endDate location maxParticipants')
        .populate('studentId', 'firstName lastName studentId');

      return activeSports;
    } catch (error) {
      console.error('Error fetching student active sports:', error);
      return [];
    }
  }

  async getStudentSportsSchedule(studentId: string, filters: any = {}): Promise<any> {
    try {
      // Get student's active sports programs
      const studentSports = await this.studentSportsModel.find({
        $or: [
          { studentId: studentId },
          { studentId: studentId.toString() }
        ],
        status: 'active'
      });

      const programIds = studentSports.map(s => s.sportsProgramId);

      const matchQuery: any = {
        sportsProgramId: { $in: programIds }
      };

      if (filters.startDate) {
        matchQuery.startDate = { $gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        matchQuery.endDate = { $lte: new Date(filters.endDate) };
      }

      const schedule = await this.sportsScheduleModel.find(matchQuery)
        .populate('sportsProgramId')
        .sort({ startDate: 1, startTime: 1 });

      return schedule;
    } catch (error) {
      console.error('Error fetching student sports schedule:', error);
      return [];
    }
  }

  async getStudentSportsAttendance(studentId: string, filters: any = {}): Promise<any> {
    try {
      const matchQuery: any = { studentId };

      if (filters.sportsProgramId) {
        matchQuery.sportsProgramId = filters.sportsProgramId;
      }
      if (filters.startDate) {
        matchQuery.date = { $gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        matchQuery.date = { ...matchQuery.date, $lte: new Date(filters.endDate) };
      }

      const attendance = await this.sportsAttendanceModel.find(matchQuery)
        .populate(['scheduleId', 'sportsProgramId'])
        .sort({ date: -1 });

      return attendance;
    } catch (error) {
      console.error('Error fetching student sports attendance:', error);
      return [];
    }
  }

  async getStudentSportsStats(studentId: string): Promise<any> {
    try {
      const studentIdStr = studentId.toString();
      
      // Get active sports programs
      const activePrograms = await this.studentSportsModel.find({
        $or: [
          { studentId: studentId },
          { studentId: studentIdStr }
        ],
        status: 'active'
      }).populate('sportsProgramId', 'name season type').lean();

      // Get upcoming schedules
      const studentSports = await this.studentSportsModel.find({
        $or: [
          { studentId: studentId },
          { studentId: studentIdStr }
        ],
        status: 'active'
      }).lean();

      const programIds = studentSports.map(s => (s.sportsProgramId as any)?._id || s.sportsProgramId).filter(Boolean);
      
      const now = new Date();
      const upcomingSchedules = await this.sportsScheduleModel.find({
        sportsProgramId: { $in: programIds },
        startDate: { $gte: now }
      }).sort({ startDate: 1 }).limit(10).lean();

      // Count programs by status
      const allPrograms = await this.studentSportsModel.find({
        $or: [
          { studentId: studentId },
          { studentId: studentIdStr }
        ]
      }).lean();

      const stats = {
        activePrograms: activePrograms.length,
        upcomingEvents: upcomingSchedules.length,
        totalPrograms: allPrograms.length,
        eligiblePrograms: allPrograms.filter((p: any) => p.isEligible !== false).length,
        programsBySeason: this.groupBySeason(activePrograms)
      };

      return stats;
    } catch (error) {
      console.error('Error fetching student sports stats:', error);
      return {
        activePrograms: 0,
        upcomingEvents: 0,
        totalPrograms: 0,
        eligiblePrograms: 0,
        programsBySeason: {}
      };
    }
  }

  private groupBySeason(programs: any[]): any {
    const grouped: any = {};
    programs.forEach((program: any) => {
      const season = (program.sportsProgramId as any)?.season || 'Other';
      grouped[season] = (grouped[season] || 0) + 1;
    });
    return grouped;
  }

  // ==================== PARENT PORTAL METHODS ====================

  async getChildrenSports(parentId: string): Promise<any> {
    try {
      // Get parent user to find children
      const parentUser = await this.userModel.findById(parentId).exec();
      if (!parentUser || parentUser.role !== UserRole.PARENT) {
        return { success: false, message: 'Parent not found', data: [] };
      }

      if (!parentUser.children || parentUser.children.length === 0) {
        return { success: true, message: 'No children found', data: [] };
      }

      // Get student sports for all children
      const childrenIds = parentUser.children.map((id: any) => 
        typeof id === 'string' ? new Types.ObjectId(id) : id
      );

      const studentSports = await this.studentSportsModel
        .find({ studentId: { $in: childrenIds }, status: { $ne: 'inactive' } })
        .populate('sportsProgramId', 'name description season type location maxParticipants')
        .populate('studentId', 'firstName lastName studentId class section')
        .lean()
        .exec();

      // Group by child and format response
      const result = studentSports.map((assignment: any) => ({
        _id: assignment._id,
        studentId: assignment.studentId?._id || assignment.studentId,
        studentName: assignment.studentId 
          ? `${assignment.studentId.firstName || ''} ${assignment.studentId.lastName || ''}`.trim()
          : 'Unknown',
        studentInfo: {
          studentId: assignment.studentId?.studentId,
          class: assignment.studentId?.class,
          section: assignment.studentId?.section,
        },
        sportsProgramId: assignment.sportsProgramId?._id || assignment.sportsProgramId,
        program: assignment.sportsProgramId || {},
        status: assignment.status || 'active',
        playerRole: assignment.playerRole || 'Player',
        enrollmentDate: assignment.enrollmentDate || assignment.createdAt,
        isEligible: assignment.isEligible !== false,
      }));

      return { success: true, data: result };
    } catch (error) {
      console.error('Error fetching children sports:', error);
      return { success: false, message: error.message, data: [] };
    }
  }

  async getChildrenSportsSchedule(parentId: string, filters: any = {}): Promise<any> {
    try {
      // Get parent user to find children
      const parentUser = await this.userModel.findById(parentId).exec();
      if (!parentUser || parentUser.role !== UserRole.PARENT) {
        return { success: false, message: 'Parent not found', data: [] };
      }

      if (!parentUser.children || parentUser.children.length === 0) {
        return { success: true, message: 'No children found', data: [] };
      }

      const childrenIds = parentUser.children.map((id: any) => 
        typeof id === 'string' ? new Types.ObjectId(id) : id
      );

      // Get student sports to find program IDs
      const studentSports = await this.studentSportsModel
        .find({ studentId: { $in: childrenIds }, status: { $ne: 'inactive' } })
        .select('sportsProgramId studentId')
        .lean()
        .exec();

      const programIds = [...new Set(studentSports.map((s: any) => 
        s.sportsProgramId?._id || s.sportsProgramId
      ).filter(Boolean))];

      if (programIds.length === 0) {
        return { success: true, data: [] };
      }

      // Build query for schedule
      const query: any = {
        sportsProgramId: { $in: programIds },
      };

      // Apply filters
      if (filters.startDate) {
        query.startDate = { $gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        query.endDate = { $lte: new Date(filters.endDate) };
      }
      if (filters.eventType) {
        query.eventType = filters.eventType;
      }

      const schedules = await this.sportsScheduleModel
        .find(query)
        .populate('sportsProgramId', 'name season type')
        .sort({ startDate: 1, startTime: 1 })
        .lean()
        .exec();

      // Format response with student info
      const result = schedules.map((schedule: any) => {
        const relatedStudents = studentSports
          .filter((s: any) => 
            (s.sportsProgramId?._id || s.sportsProgramId)?.toString() === 
            (schedule.sportsProgramId?._id || schedule.sportsProgramId)?.toString()
          )
          .map((s: any) => ({
            studentId: s.studentId?._id || s.studentId,
            studentName: s.studentId?.firstName && s.studentId?.lastName
              ? `${s.studentId.firstName} ${s.studentId.lastName}`
              : 'Unknown',
          }));

        return {
          _id: schedule._id,
          title: schedule.title || schedule.eventType || 'Sports Event',
          eventType: schedule.eventType,
          sportsProgramId: schedule.sportsProgramId?._id || schedule.sportsProgramId,
          program: schedule.sportsProgramId || {},
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          location: schedule.location || schedule.venue,
          description: schedule.description,
          status: schedule.status,
          students: relatedStudents,
        };
      });

      return { success: true, data: result };
    } catch (error) {
      console.error('Error fetching children sports schedule:', error);
      return { success: false, message: error.message, data: [] };
    }
  }

  async getChildrenSportsAttendance(parentId: string, filters: any = {}): Promise<any> {
    try {
      // Get parent user to find children
      const parentUser = await this.userModel.findById(parentId).exec();
      if (!parentUser || parentUser.role !== UserRole.PARENT) {
        return { success: false, message: 'Parent not found', data: [] };
      }

      if (!parentUser.children || parentUser.children.length === 0) {
        return { success: true, message: 'No children found', data: [] };
      }

      const childrenIds = parentUser.children.map((id: any) => 
        typeof id === 'string' ? new Types.ObjectId(id) : id
      );

      // Build query
      const query: any = {
        studentId: { $in: childrenIds },
      };

      // Apply filters
      if (filters.startDate) {
        query.attendanceDate = { ...query.attendanceDate, $gte: new Date(filters.startDate) };
      }
      if (filters.endDate) {
        query.attendanceDate = { ...query.attendanceDate, $lte: new Date(filters.endDate) };
      }
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.programId) {
        query.sportsProgramId = new Types.ObjectId(filters.programId);
      }

      const attendance = await this.sportsAttendanceModel
        .find(query)
        .populate('studentId', 'firstName lastName studentId class section')
        .populate('sportsProgramId', 'name season type')
        .populate('scheduleId', 'title eventType startTime endTime location')
        .sort({ attendanceDate: -1 })
        .lean()
        .exec();

      // Format response
      const result = attendance.map((record: any) => ({
        _id: record._id,
        studentId: record.studentId?._id || record.studentId,
        studentName: record.studentId
          ? `${record.studentId.firstName || ''} ${record.studentId.lastName || ''}`.trim()
          : 'Unknown',
        studentInfo: {
          studentId: record.studentId?.studentId,
          class: record.studentId?.class,
          section: record.studentId?.section,
        },
        sportsProgramId: record.sportsProgramId?._id || record.sportsProgramId,
        program: record.sportsProgramId || {},
        scheduleId: record.scheduleId?._id || record.scheduleId,
        schedule: record.scheduleId || {},
        attendanceDate: record.attendanceDate,
        status: record.status,
        notes: record.notes,
        parentNotified: record.parentNotified || false,
      }));

      return { success: true, data: result };
    } catch (error) {
      console.error('Error fetching children sports attendance:', error);
      return { success: false, message: error.message, data: [] };
    }
  }

  // ==================== HELPER METHODS ====================

  private async checkScheduleConflicts(scheduleData: any): Promise<any> {
    try {
      const { sportsProgramId, startDate, endDate, startTime, endTime, excludeId, timeSlots } = scheduleData;

      // If timeSlots are provided, check conflicts for each time slot
      if (timeSlots && Array.isArray(timeSlots) && timeSlots.length > 0) {
        const conflicts = [];
        for (const slot of timeSlots) {
          const slotDate = new Date(slot.date);
          const conflictQuery: any = {
            sportsProgramId,
            $or: [
              {
                startDate: { $lte: slotDate },
                endDate: { $gte: slotDate }
              },
              {
                'timeSlots.date': {
                  $gte: new Date(slotDate.setHours(0, 0, 0, 0)),
                  $lte: new Date(slotDate.setHours(23, 59, 59, 999))
                }
              }
            ]
          };

          if (excludeId) {
            conflictQuery._id = { $ne: excludeId };
          }

          const conflictingSchedules = await this.sportsScheduleModel.find(conflictQuery);

          for (const existing of conflictingSchedules) {
            // Check if this slot conflicts with existing schedule's main time
            if (this.isSameDay(existing.startDate, slotDate) || this.isSameDay(existing.endDate, slotDate)) {
              if (this.timesOverlap(slot.startTime, slot.endTime, existing.startTime, existing.endTime)) {
                conflicts.push(`${existing.eventType} on ${slotDate.toDateString()}`);
              }
            }
            
            // Check if this slot conflicts with existing schedule's time slots
            if (existing.timeSlots && Array.isArray(existing.timeSlots)) {
              for (const existingSlot of existing.timeSlots) {
                if (this.isSameDay(existingSlot.date, slotDate)) {
                  if (this.timesOverlap(slot.startTime, slot.endTime, existingSlot.startTime, existingSlot.endTime)) {
                    conflicts.push(`${existing.eventType} on ${slotDate.toDateString()}`);
                  }
                }
              }
            }
          }
        }

        return {
          hasConflicts: conflicts.length > 0,
          conflicts: [...new Set(conflicts)] // Remove duplicates
        };
      }

      // Fallback to checking main start/end date and time
      const conflictQuery: any = {
        sportsProgramId,
        $or: [
          {
            startDate: { $lte: new Date(endDate) },
            endDate: { $gte: new Date(startDate) }
          }
        ]
      };

      if (excludeId) {
        conflictQuery._id = { $ne: excludeId };
      }

      const conflictingSchedules = await this.sportsScheduleModel.find(conflictQuery);

      const conflicts = [];
      for (const existing of conflictingSchedules) {
        // Only flag as conflict if dates overlap AND times overlap
        const datesOverlap = this.datesOverlap(
          new Date(startDate),
          new Date(endDate),
          existing.startDate,
          existing.endDate
        );
        
        if (datesOverlap && this.timesOverlap(startTime, endTime, existing.startTime, existing.endTime)) {
          conflicts.push(`${existing.eventType} on ${existing.startDate.toDateString()}`);
        }
      }

      return {
        hasConflicts: conflicts.length > 0,
        conflicts: [...new Set(conflicts)] // Remove duplicates
      };
    } catch (error) {
      console.error('Error checking schedule conflicts:', error);
      return { hasConflicts: false, conflicts: [] };
    }
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  private datesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 <= end2 && start2 <= end1;
  }

  private timesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const s1 = this.timeToMinutes(start1);
    const e1 = this.timeToMinutes(end1);
    const s2 = this.timeToMinutes(start2);
    const e2 = this.timeToMinutes(end2);

    return s1 < e2 && s2 < e1;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  // ==================== ADDITIONAL TEACHER METHODS ====================

  async getCoachPrograms(coachId: string): Promise<any> {
    try {
      // Convert string to ObjectId for proper comparison
      const mongoose = require('mongoose');
      const coachObjectId = new mongoose.Types.ObjectId(coachId);

      const programs = await this.sportsProgramModel.find({
        $or: [
          { coaches: { $in: [coachObjectId] } },
          { assistantCoaches: { $in: [coachObjectId] } }
        ],
        isActive: true
      }).populate([
        { path: 'coaches', select: 'firstName lastName email' },
        { path: 'assistantCoaches', select: 'firstName lastName email' },
        { path: 'schoolId', select: 'name schoolCode' }
      ]);



      return {
        success: true,
        data: programs
      };
    } catch (error) {
      console.error('Error fetching coach programs:', error);
      throw new BadRequestException('Failed to fetch coach programs');
    }
  }

  async getScheduleByDate(filters: any): Promise<any> {
    try {
      const query: any = {
        isActive: true
      };

      if (filters.date) {
        const targetDate = new Date(filters.date);
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);

        query.startDate = {
          $gte: startOfDay,
          $lte: endOfDay
        };
      }

      if (filters.coachId) {
        // Find programs where user is coach
        const coachPrograms = await this.sportsProgramModel.find({
          $or: [
            { coaches: { $in: [filters.coachId] } },
            { assistantCoaches: { $in: [filters.coachId] } }
          ],
          isActive: true
        }).select('_id').lean();

        query.sportsProgramId = {
          $in: coachPrograms.map(p => p._id)
        };
      }

      if (filters.schoolId) {
        query.schoolId = new Types.ObjectId(filters.schoolId);
      }

      const schedules = await this.sportsScheduleModel.find(query)
        .populate('sportsProgramId', 'name season type')
        .populate('createdBy', 'firstName lastName')
        .sort({ startDate: 1, startTime: 1 })
        .lean();

      // Transform for response
      const transformedSchedules = schedules.map(schedule => {
        return {
          ...schedule,
          program: schedule.sportsProgramId,
          date: schedule.startDate,
          type: schedule.eventType,
          venue: schedule.location
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Schedules retrieved successfully',
        data: {
          schedules: transformedSchedules,
          total: transformedSchedules.length
        }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to fetch schedule by date',
        data: null
      };
    }
  }

  async getPendingAttendance(filters: any): Promise<any> {
    try {
      const query: any = {
        status: 'pending'
      };

      if (filters.coachId) {
        // Find programs where user is coach
        const coachPrograms = await this.sportsProgramModel.find({
          $or: [
            { coaches: { $in: [filters.coachId] } },
            { assistantCoaches: { $in: [filters.coachId] } }
          ],
          isActive: true
        }).select('_id').lean();

        query.sportsProgramId = {
          $in: coachPrograms.map(p => p._id)
        };
      }

      if (filters.schoolId) {
        query.schoolId = new Types.ObjectId(filters.schoolId);
      }

      const pendingAttendance = await this.sportsAttendanceModel.find(query)
        .populate('studentId', 'firstName lastName studentId email')
        .populate('sportsProgramId', 'name season type')
        .populate('scheduleId', 'title eventType startDate startTime location')
        .populate('recordedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .lean();

      // Transform for response
      const transformedAttendance = pendingAttendance.map(record => {
        return {
          ...record,
          student: record.studentId,
          schedule: record.scheduleId,
          program: record.sportsProgramId,
          markedAt: record.recordedAt || record.attendanceDate,
          markedBy: record.recordedBy
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Pending attendance retrieved successfully',
        data: {
          attendance: transformedAttendance,
          total: transformedAttendance.length
        }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to fetch pending attendance',
        data: null
      };
    }
  }

  async createBulkAttendance(bulkData: any, recordedBy: string, role?: string): Promise<any> {
    try {
      const { programId, scheduleId, date, attendanceRecords } = bulkData;

      if (!programId || !scheduleId || !date || !attendanceRecords || !Array.isArray(attendanceRecords)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid bulk attendance data - missing required fields (programId, scheduleId, date, attendanceRecords)',
          data: null
        };
      }

      if (!recordedBy) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'RecordedBy user ID is required',
          data: null
        };
      }

      // Get the sports program to get schoolId
      const sportsProgram = await this.sportsProgramModel.findById(programId).lean();
      if (!sportsProgram) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports program not found',
          data: null
        };
      }

      // Check if schedule exists
      const schedule = await this.sportsScheduleModel.findById(scheduleId).lean();
      if (!schedule) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Schedule not found',
          data: null
        };
      }

      const attendanceItems = [];
      const attendanceDate = new Date(date);

      for (const record of attendanceRecords) {
        if (!record.studentId) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Student ID is required for each attendance record',
            data: null
          };
        }

        // Convert studentId to ObjectId and validate it exists
        let studentObjectId: Types.ObjectId;
        try {
          if (!Types.ObjectId.isValid(record.studentId)) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: `Invalid student ID format: ${record.studentId}`,
              data: null
            };
          }
          studentObjectId = new Types.ObjectId(record.studentId);

          // Verify student exists in StudentProfile
          const studentExists = await this.userModel.findById(studentObjectId).lean();
          if (!studentExists) {
            return {
              success: false,
              statusCode: HttpStatus.NOT_FOUND,
              message: `Student not found with ID: ${record.studentId}`,
              data: null
            };
          }
        } catch (error) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: `Error processing student ID: ${error.message}`,
            data: null
          };
        }

        // Check if attendance already exists for this student/schedule/date
        const existing = await this.sportsAttendanceModel.findOne({
          studentId: studentObjectId,
          scheduleId: new Types.ObjectId(scheduleId),
          attendanceDate: attendanceDate
        });

        if (existing) {
          // Update existing record
          await this.sportsAttendanceModel.findByIdAndUpdate(existing._id, {
            status: record.status || 'present',
            notes: record.notes || '',
            updatedBy: new Types.ObjectId(recordedBy),
            updatedAt: new Date()
          });
          continue;
        }

        const attendanceItem = {
          studentId: studentObjectId, // Use validated ObjectId
          sportsProgramId: new Types.ObjectId(programId),
          scheduleId: new Types.ObjectId(scheduleId),
          schoolId: sportsProgram.schoolId,
          attendanceDate: attendanceDate,
          status: record.status || 'present',
          absenceType: record.absenceType || 'unexcused',
          notes: record.notes || '',
          recordedBy: new Types.ObjectId(recordedBy),
          recordedAt: new Date()
        };

        attendanceItems.push(attendanceItem);
      }

      let savedAttendance = [];
      if (attendanceItems.length > 0) {
        savedAttendance = await this.sportsAttendanceModel.insertMany(attendanceItems);
      }

      // Log activity
      await this.activityService.create({
        title: 'Recorded bulk sports attendance',
        subtitle: `Bulk attendance recorded for ${savedAttendance.length} students`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(recordedBy)
      });

      // Populate saved records
      const populatedAttendance = await this.sportsAttendanceModel
        .find({ _id: { $in: savedAttendance.map(a => a._id) } })
        .populate({
          path: 'studentId',
          select: 'firstName lastName studentId email gradeLevel'
        })
        .populate('sportsProgramId', 'name season type')
        .populate('scheduleId', 'title eventType startDate startTime')
        .populate('recordedBy', 'firstName lastName')
        .lean();

      // Transform for response
      const transformedAttendance = populatedAttendance.map(record => {
        return {
          ...record,
          student: record.studentId,
          schedule: record.scheduleId,
          program: record.sportsProgramId
        };
      });

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: `Bulk attendance recorded successfully for ${savedAttendance.length} students`,
        data: {
          attendance: transformedAttendance,
          total: transformedAttendance.length
        }
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to create bulk attendance',
        data: null
      };
    }
  }

  // ==================== ACTIVITY LOGGING ====================

  async getSportsActivities(page: number = 1, limit: number = 10, filters: any = {}) {
    try {
      // Filter activities that are sports-related by title keywords
      const sportsKeywords = [
        'sports program', 'program', 'student assigned', 'Sports', 'athletics',
        'team', 'coach', 'tournament', 'practice', 'game', 'match'
      ];

      // Build the filter query
      const activityFilters: any = {};

      if (filters.performBy) {
        activityFilters.performBy = filters.performBy;
      }

      if (filters.actorId && filters.role) {
        switch (filters.role) {
          case 'ADMIN':
            activityFilters.$or = [
              { adminId: filters.actorId },
              { actorId: filters.actorId }
            ];
            break;
          default:
            activityFilters.actorId = filters.actorId;
            break;
        }
      }

      // Add sports-related title filtering
      if (filters.title) {
        activityFilters.title = { $regex: filters.title, $options: 'i' };
      } else {
        // Filter for sports-related activities
        activityFilters.title = {
          $regex: sportsKeywords.join('|'),
          $options: 'i'
        };
      }

      const result = await this.activityService.findAll(
        page,
        limit,
        undefined, // title - we handle this in activityFilters
        activityFilters.performBy,
        undefined, // className
        undefined, // section
        undefined, // type
        activityFilters.actorId || activityFilters.$or?.[0]?.actorId,
        filters.role
      );

      return result;
    } catch (error) {
      console.error('Error fetching sports activities:', error);
      return {
        totalRecords: 0,
        totalPages: 0,
        currentPage: page,
        currentLimit: limit,
        data: []
      };
    }
  }

  // ==================== MEDICAL INTEGRATION ====================

  async getStudentsWithMedicalData(sportsProgramId: string, academicYear?: string): Promise<any[]> {
    try {
      // Get all students assigned to the sports program
      const assignments = await this.studentSportsModel
        .find({
          sportsProgramId,
          status: 'active',
          ...(academicYear && { academicYear })
        })
        .populate('studentId', 'firstName lastName email gradeLevel')
        .populate('sportsProgramId', 'name type')
        .lean();

      // Enhanced results with medical data from nurse portal
      const studentsWithMedical = await Promise.all(
        assignments.map(async (assignment) => {
          let medicalInfo = {
            clearanceStatus: assignment.medicalClearanceStatus || 'no_record',
            healthWarnings: assignment.healthWarnings || [],
            lastMedicalCheck: assignment.medicalCheckDate,
            hasValidPhysical: false,
            hasSportsClearance: false,
            criticalAlerts: 0,
            medicalConditions: [],
            allergies: []
          };

          try {
            // Fetch detailed medical information from nurse service  
            const studentIdStr = assignment.studentId?.toString() || String(assignment.studentId);
            const healthRecord = await this.nurseService.getHealthRecord(
              studentIdStr,
              academicYear || assignment.academicYear
            );

            // Check for valid sports physical exams
            const validPhysicals = healthRecord.physicalExams?.filter(exam =>
              exam.cleared === true &&
              exam.examType === 'sports' &&
              new Date(exam.expiryDate) > new Date()
            ) || [];

            // Check for sports activity clearances
            const sportsClearances = healthRecord.activityClearances?.filter(clearance =>
              clearance.activityType === 'sports' &&
              clearance.cleared === true &&
              new Date(clearance.expiryDate) > new Date()
            ) || [];

            // Count critical health alerts
            const criticalAlerts = healthRecord.healthAlerts?.filter(alert =>
              alert.isActive === true &&
              (alert.severity === 'high' || alert.severity === 'critical') &&
              (!alert.expiryDate || new Date(alert.expiryDate) > new Date())
            ) || [];

            medicalInfo = {
              clearanceStatus: (validPhysicals.length > 0 || sportsClearances.length > 0) ? 'cleared' : 'pending',
              healthWarnings: assignment.healthWarnings || [],
              lastMedicalCheck: assignment.medicalCheckDate,
              hasValidPhysical: validPhysicals.length > 0,
              hasSportsClearance: sportsClearances.length > 0,
              criticalAlerts: criticalAlerts.length,
              medicalConditions: healthRecord.medicalConditions || [],
              allergies: healthRecord.allergies || []
            };

          } catch (error) {
            // If medical record not found, keep default values
            const studentIdStr = assignment.studentId?.toString() || assignment.studentId;
            console.log(`No medical record found for student ${studentIdStr}`);
          }

          // Transform for frontend compatibility
          const assignmentObj = typeof assignment.toObject === 'function' ? assignment.toObject() : assignment;
          return {
            ...assignmentObj,
            student: assignmentObj.studentId, // Map studentId to student for frontend compatibility
            program: assignmentObj.sportsProgramId, // Map sportsProgramId to program for frontend compatibility  
            assignedDate: assignmentObj.enrollmentDate, // Map enrollmentDate to assignedDate for frontend compatibility
            medicalClearance: assignmentObj.medicalClearanceObtained || false, // Map medical clearance field
            medicalInfo
          };
        })
      );

      return studentsWithMedical;

    } catch (error) {
      console.error('Error fetching students with medical data:', error);
      throw new BadRequestException('Failed to fetch students with medical information');
    }
  }

  async refreshStudentMedicalClearance(assignmentId: string, refreshedBy: string, role?: string): Promise<any> {
    try {
      if (!assignmentId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Assignment ID is required',
          data: null
        };
      }

      const assignment = await this.studentSportsModel.findById(assignmentId).lean();
      if (!assignment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Sports assignment not found',
          data: null
        };
      }

      // Re-check medical clearance using nurse service
      let medicalClearanceStatus = 'no_record';
      let healthWarnings = [];

      try {
        const healthRecord = await this.nurseService.getHealthRecord(
          assignment.studentId?.toString() || (assignment.studentId as any),
          assignment.academicYear
        );

        // Check for active sports clearances
        const sportsCleanances = healthRecord.activityClearances?.filter(clearance =>
          clearance.activityType === 'sports' &&
          clearance.cleared === true &&
          new Date(clearance.expiryDate) > new Date()
        ) || [];

        // Check for current physical exam clearances
        const validPhysicals = healthRecord.physicalExams?.filter(exam =>
          exam.cleared === true &&
          exam.examType === 'sports' &&
          new Date(exam.expiryDate) > new Date()
        ) || [];

        if (sportsCleanances.length > 0 || validPhysicals.length > 0) {
          medicalClearanceStatus = 'cleared';
        } else {
          medicalClearanceStatus = 'pending';
          healthWarnings.push('No valid sports physical or clearance on file');
        }

        // Health Warnings: Show active health alerts from nurse module
        const activeAlerts = healthRecord.healthAlerts?.filter(alert =>
          alert.isActive === true &&
          (!alert.expiryDate || new Date(alert.expiryDate) > new Date())
        ) || [];

        // Add health alerts as warnings
        activeAlerts.forEach(alert => {
          if (alert.title) {
            healthWarnings.push(alert.title);
          } else if (alert.description) {
            healthWarnings.push(alert.description);
          } else {
            healthWarnings.push(`${alert.type} alert (${alert.severity} severity)`);
          }
        });

      } catch (error) {
        medicalClearanceStatus = 'no_record';
        healthWarnings.push('No health record found');
      }

      // Update the assignment with new medical information
      await this.studentSportsModel.findByIdAndUpdate(assignmentId, {
        medicalClearanceStatus,
        healthWarnings,
        medicalCheckDate: new Date(),
        updatedBy: refreshedBy,
        updatedAt: new Date()
      });

      // Log activity
      await this.activityService.create({
        title: 'Refreshed student medical clearance',
        subtitle: `Medical clearance refreshed for assignment`,
        performBy: role || 'NURSE',
        actorId: new Types.ObjectId(refreshedBy)
      });

      const result = {
        assignmentId,
        medicalClearanceStatus,
        healthWarnings,
        lastChecked: new Date()
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Medical clearance refreshed successfully',
        data: result
      };

    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to refresh medical clearance',
        data: null
      };
    }
  }
}
