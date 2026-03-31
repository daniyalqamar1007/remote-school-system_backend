import { Injectable, NotFoundException, ConflictException, BadRequestException, HttpStatus, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection } from 'mongoose';
import * as XLSX from 'xlsx';
import * as bcrypt from 'bcryptjs';
import * as NodeCache from 'node-cache';
import { User, UserDocument, UserStatus } from '../auth/schemas/user.schema';
import { Student } from '../student/schema/student.schema';
import { Teacher } from '../teacher/schema/schema.teacher';
import { Nurse } from '../nurse/schema/nurse.schema';
import { Parent } from '../parent/schema/parent.schema';
import { Course } from '../course/schema/course.schema';
import { School, SchoolDocument } from '../auth/schemas/school.schema';
import { Activity } from '../activity/schema/schema.activity';
import { ParentProfile, ParentProfileDocument } from '../auth/schemas/parent-profile.schema';
import { TeacherProfile, TeacherProfileDocument } from '../auth/schemas/teacher-profile.schema';
import { CourseAssignment } from '../course/schema/course-assignment.schema';
import { Department } from '../auth/schemas/department.schema';
import { Schedule, ScheduleDocument } from '../schedule/schema/schedule.schema';
import { TeacherService } from '../teacher/teacher.service';
import { LessonPlanService } from '../lesson-plan/lesson-plan.service';
import { UploadedFileType } from '../../utils/multer.config';
import { HonorRollService } from '../honor-roll/honor-roll.service';
import { generateStudentId } from '../utils/generate-student-id';
import { AwsService } from '../aws/aws.service';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { getPaginationMeta } from 'utils/pagination';
import { uploadBufferToS3, deleteFromS3, extractS3KeyFromUrl, buildS3KeyPath } from '../../utils/s3Helpers';
import { UserRole } from 'utils/enum';
import { CreateTeacherDto } from 'src/teacher/dto/create-teacher.dto';
import { UpdateTeacherDto } from 'src/teacher/dto/update-teaacher.dto';
import { timeSlotsOverlap, validateTimeSlot, timeToMinutes } from '../utils/courseHelpers';
import { PasswordGenerator } from 'src/utils/password-generator';
import { CreateNurseDto } from './dto/create-nurse.dto';
import { UserStatus as UserStatusEnum } from 'src/types/enums/user.enum';
import { linkStudentToParents, linkStudentToParent, unlinkStudentFromParent } from '../utils/parent-student-relations';
import { withOptionalTransaction } from '../utils/transaction-helper';
import { EmailService } from '../email/email.service';
import { DisciplinaryAction, DisciplinaryActionDocument } from '../behavior/schema/disciplinary-action.schema';
import { Club, ClubDocument } from '../club/schema/club.schema';
import { ClubMembership, ClubMembershipDocument } from '../club/schema/club-membership.schema';
import { SportsProgram, SportsProgramDocument } from '../sports/schema/sports-program.schema';
import { StudentSports, StudentSportsDocument } from '../sports/schema/student-sports.schema';
import { AcademicTerm, AcademicTermDocument } from '../super-admin/schemas/academic-term.schema';
import { AttendanceService } from '../attendance/attendance.service';

@Injectable()
export class AdminService {
  private cache: NodeCache;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Student.name) private studentModel: Model<Student>,
    @InjectModel(Teacher.name) private teacherModel: Model<Teacher>,
    @InjectModel(Nurse.name) private nurseModel: Model<Nurse>,
    @InjectModel(ParentProfile.name) private parentProfileModel: Model<ParentProfileDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(CourseAssignment.name) private courseAssignmentModel: Model<CourseAssignment>,
    @InjectModel(Parent.name) private parentModel: Model<Parent>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(DisciplinaryAction.name) private actionModel: Model<DisciplinaryActionDocument>,
    @InjectModel(Club.name) private clubModel: Model<ClubDocument>,
    @InjectModel(ClubMembership.name) private clubMembershipModel: Model<ClubMembershipDocument>,
    @InjectModel(SportsProgram.name) private sportsProgramModel: Model<SportsProgramDocument>,
    @InjectModel(StudentSports.name) private studentSportsModel: Model<StudentSportsDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(Department.name) private departmentModel: Model<Department>,
    @InjectModel(Schedule.name) private scheduleModel: Model<ScheduleDocument>,
    @InjectModel(AcademicTerm.name) private academicTermModel: Model<AcademicTermDocument>,
    @InjectConnection() private readonly connection: Connection,
    private teacherService: TeacherService,
    private lessonPlanService: LessonPlanService,
    private honorRollService: HonorRollService,
    private awsService: AwsService,
    private configService: ConfigService,
    private emailService: EmailService,
    private attendanceService: AttendanceService,
  ) {
    // Initialize cache with 30 minutes TTL (1800 seconds)
    this.cache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });
  }

  // ==================== DASHBOARD ====================

  async getDashboardOverview(schoolId: string, adminId: string) {
    try {
      // // Generate cache key
      // const cacheKey = `admin_dashboard_${schoolId}_${adminId}`;

      // // Check cache first
      // const cachedData = this.cache.get(cacheKey);
      // if (cachedData) {
      //   console.log('✅ Cache hit for admin dashboard overview');
      //   return cachedData;
      // }

      console.log('🔄 Cache miss - fetching fresh data for admin dashboard overview');

      const schoolObjectId = new Types.ObjectId(schoolId);

      // --------------------
      // 🧩 PARALLEL AGGREGATES FOR PERFORMANCE
      // --------------------
      const [
        userAggregates,
        studentAggregates,
        departmentStats,
        courseStats,
        school,
        recentActivity,
        totalParentsCount,
      ] = await Promise.all([
        // 1. User statistics by role in one aggregate (excluding parents - they're counted separately)
        this.userModel.aggregate([
          { $match: { schoolId: schoolObjectId, isActive: true } },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    totalTeachers: {
                      $sum: { $cond: [{ $eq: ['$role', 'TEACHER'] }, 1, 0] },
                    },
                    totalNurses: {
                      $sum: { $cond: [{ $eq: ['$role', 'NURSE'] }, 1, 0] },
                    },
                    totalAdmins: {
                      $sum: { $cond: [{ $eq: ['$role', 'ADMIN'] }, 1, 0] },
                    },
                    totalUsers: { $sum: 1 },
                  },
                },
              ],
              byRole: [
                {
                  $group: {
                    _id: '$role',
                    count: { $sum: 1 },
                  },
                },
                { $sort: { count: -1 } },
              ],
              recentUsers: [
                { $sort: { createdAt: -1 } },
                { $limit: 5 },
                {
                  $project: {
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    role: 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
        ]),
        // 2. Student statistics with grade breakdown
        this.userModel.aggregate([
          { $match: { schoolId: schoolObjectId, isActive: true, role: UserRole.STUDENT } },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    totalStudents: { $sum: 1 },
                    maleStudents: {
                      $sum: {
                        $cond: [
                          {
                            $or: [
                              { $eq: ['$gender', 'Male'] },
                              { $eq: ['$gender', 'MALE'] },
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                    femaleStudents: {
                      $sum: {
                        $cond: [
                          {
                            $or: [
                              { $eq: ['$gender', 'Female'] },
                              { $eq: ['$gender', 'FEMALE'] },
                            ],
                          },
                          1,
                          0,
                        ],
                      },
                    },
                  },
                },
              ],
              byGrade: [
                {
                  $group: {
                    _id: '$gradeLevel',
                    count: { $sum: 1 },
                  },
                },
                { $sort: { _id: 1 } },
              ],
              byClass: [
                {
                  $group: {
                    _id: '$class',
                    count: { $sum: 1 },
                  },
                },
                { $sort: { count: -1 } },
                { $limit: 10 },
              ],
              recentStudents: [
                { $sort: { createdAt: -1 } },
                { $limit: 5 },
                {
                  $project: {
                    firstName: 1,
                    lastName: 1,
                    email: 1,
                    studentId: 1,
                    class: 1,
                    gradeLevel: 1,
                    createdAt: 1,
                  },
                },
              ],
            },
          },
        ]),
        // 3. Department statistics
        this.departmentModel.aggregate([
          { $match: { schoolId: schoolObjectId, isActive: true } },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    totalDepartments: { $sum: 1 },
                  },
                },
              ],
              recentDepartments: [
                { $sort: { createdAt: -1 } },
                { $limit: 5 },
                {
                  $project: {
                    _id: 1,
                    name: '$departmentName',
                    code: '$code',
                  },
                },
              ],
            },
          },
        ]),
        // 4. Course statistics
        this.courseModel.aggregate([
          { $match: { schoolId: schoolObjectId, isActive: true } },
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    totalCourses: { $sum: 1 },
                  },
                },
              ],
              recentCourses: [
                { $sort: { createdAt: -1 } },
                { $limit: 5 },
                {
                  $project: {
                    _id: 1,
                    courseName: 1,
                    courseCode: 1,
                  },
                },
              ],
            },
          },
        ]),
        // 5. School info
        this.schoolModel.findById(schoolId).select('name code type address').lean(),
        // 6. Recent activity
        this.activityModel
          .find({
            $or: [
              { schoolId: schoolId },
              { actorId: new Types.ObjectId(adminId) },
            ],
          })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('title subtitle performBy createdAt')
          .lean(),
        // 7. Count parents properly from Parent model
        this.parentModel.countDocuments({
          'belongToSchools': {
            $elemMatch: {
              schoolId: schoolObjectId,
              isActive: true
            }
          }
        }),
      ]);

      // --------------------
      // 🧩 FORMAT RESPONSE
      // --------------------
      const userTotals = userAggregates[0]?.totals?.[0] || {
        totalTeachers: 0,
        totalNurses: 0,
        totalAdmins: 0,
        totalUsers: 0,
      };

      const studentTotals = studentAggregates[0]?.totals?.[0] || {
        totalStudents: 0,
        maleStudents: 0,
        femaleStudents: 0,
      };

      const departmentTotals = departmentStats[0]?.totals?.[0] || { totalDepartments: 0 };
      const recentDepartments = departmentStats[0]?.recentDepartments || [];

      const courseTotals = courseStats[0]?.totals?.[0] || { totalCourses: 0 };
      const recentCourses = courseStats[0]?.recentCourses || [];

      // Add PARENT role to usersByRole distribution
      const usersByRole = (userAggregates[0]?.byRole || []).map((item: any) => ({
        role: item._id || 'Unknown',
        count: item.count,
      }));

      // Add PARENT count to usersByRole
      if (totalParentsCount > 0) {
        usersByRole.push({
          role: 'PARENT',
          count: totalParentsCount
        });
      }

      const response = {
        overview: {
          totalActiveStudents: studentTotals.totalStudents,
          totalMaleStudents: studentTotals.maleStudents,
          totalFemaleStudents: studentTotals.femaleStudents,
          totalActiveTeachers: userTotals.totalTeachers,
          totalActiveParents: totalParentsCount,
          totalActiveNurses: userTotals.totalNurses,
          totalActiveCourses: courseTotals.totalCourses,
          totalActiveDepartments: departmentTotals.totalDepartments,
        },
        distributions: {
          usersByRole: usersByRole,
        },
        school: {
          _id: school?._id,
          name: school?.name,
          code: school?.code,
          type: school?.type,
          address: school?.address,
        },
        recentDepartments: recentDepartments || [],
        recentCourses: recentCourses || [],
        recentStudents: studentAggregates[0]?.recentStudents || [],
        recentUsers: userAggregates[0]?.recentUsers || [],
        recentActivities: recentActivity.map((activity: any) => ({
          _id: activity._id,
          title: activity.title,
          subtitle: activity.subtitle,
          performBy: activity.performBy,
          createdAt: activity.createdAt,
        })),
        generatedAt: new Date().toISOString(),
      };

      const finalResponse = {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Admin dashboard overview generated successfully',
        data: response,
      };

      // Store in cache
      // this.cache.set(cacheKey, finalResponse);
      console.log('💾 Admin dashboard data cached for 30 minutes');

      return finalResponse;
    } catch (error) {
      console.error('Error fetching dashboard overview:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch dashboard overview',
        data: null,
      };
    }
  }
  async getRecentActivity(schoolId: string, adminId: string) {
    try {
      // Get recent activities from the activity collection for this school
      // Include activities performed by admins in this school
      const activities = await this.activityModel
        .find({
          $or: [
            { schoolId: schoolId }, // Activities for this school
            { actorId: new Types.ObjectId(adminId) }, // Activities by this specific admin
            { 'metadata.schoolId': schoolId } // Alternative schoolId field
          ]
        })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      // Populate actor information for activities
      const activityIds = activities.map(a => a._id);
      const activitiesWithActors = await this.activityModel
        .find({ _id: { $in: activityIds } })
        .populate('actorId', 'firstName lastName email role')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      // Transform the activities to match the expected format with actual actor names
      const transformedActivities = activitiesWithActors.map((activity: any) => {
        const actor = activity.actorId;
        return {
          _id: activity._id,
          action: activity.action || activity.title || 'Unknown Action',
          description: activity.description || activity.subtitle || 'No description',
          entityType: activity.entityType || 'UNKNOWN',
          entityId: activity.entityId,
          user: actor ? {
            firstName: actor.firstName || 'Unknown',
            lastName: actor.lastName || 'User',
            email: actor.email || '',
            role: actor.role || activity.performBy || 'ADMIN'
          } : {
            firstName: 'Unknown',
            lastName: 'User',
            role: activity.performBy || 'ADMIN'
          },
          performBy: activity.performBy || 'ADMIN',
          timestamp: activity.createdAt || new Date(),
          status: 'success',
          metadata: activity.metadata || {}
        };
      });

      return transformedActivities;
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      throw new BadRequestException('Failed to fetch recent activity');
    }
  }

  // ==================== STUDENTS ====================

  private formatAddress(address: any): string {
    if (!address) return '';

    if (typeof address === 'string') return address;

    if (typeof address === 'object') {
      const parts = [
        address.street,
        address.city,
        address.state,
        address.zipCode,
        address.country
      ].filter(Boolean);
      return parts.join(', ');
    }

    return '';
  }

  async getStudents(role: string, schoolId: string, adminId: string, query: any) {
    try {
      const filter: any = {
        role: 'STUDENT',
        isActive: true
      };

      // Role-based school filtering
      if (role === 'ADMIN' || role === 'SECRETARY' || role === 'TEACHER') {
        // admin, secretary, and teacher — always filter by their own schoolId
        filter.schoolId = new Types.ObjectId(schoolId);
      } else if (role === 'SUPER_ADMIN') {
        // super admin — may receive schoolId in query, or none (to get all)
        if (query.schoolId) {
          filter.schoolId = new Types.ObjectId(query.schoolId);
        }
      }

      // For TEACHER role, filter students by assigned courses (grade/section combinations)
      if (role === 'TEACHER' && adminId) {
        try {
          const teacherObjectId = new Types.ObjectId(adminId);
          // Get teacher's course assignments
          const courseAssignments = await this.courseAssignmentModel.find({
            teacherId: teacherObjectId,
            schoolId: new Types.ObjectId(schoolId)
          }).lean();

          if (courseAssignments.length > 0) {
            // Extract all grade/section combinations from assignments
            const gradeSectionCombos: Array<{ grade: string; section: string }> = [];
            courseAssignments.forEach(assignment => {
              if (assignment.grades && Array.isArray(assignment.grades)) {
                assignment.grades.forEach((grade: any) => {
                  if (grade.level !== undefined && grade.section) {
                    // Normalize grade level - handle both "Grade X" format and numeric
                    const gradeLevel = grade.level === 0 ? 'Kindergarten' : `Grade ${grade.level}`;
                    gradeSectionCombos.push({
                      grade: gradeLevel,
                      section: grade.section
                    });
                  }
                });
              }
            });

            if (gradeSectionCombos.length > 0) {
              // Build filter for students matching any of these grade/section combinations
              const studentFilters = gradeSectionCombos.map(combo => ({
                $and: [
                  {
                    $or: [
                      { class: combo.grade },
                      { gradeLevel: combo.grade }
                    ]
                  },
                  { section: combo.section }
                ]
              }));

              // Add to existing filter
              if (filter.$and) {
                filter.$and.push({ $or: studentFilters });
              } else {
                filter.$and = [{ $or: studentFilters }];
              }
            } else {
              // If teacher has no grade/section assignments, return empty result
              return {
                success: true,
                statusCode: HttpStatus.OK,
                message: 'Students fetched successfully',
                data: {
                  students: [],
                  pagination: getPaginationMeta(1, parseInt(query.limit) || 10, 0)
                }
              };
            }
          } else {
            // If teacher has no course assignments, return empty result
            return {
              success: true,
              statusCode: HttpStatus.OK,
              message: 'Students fetched successfully',
              data: {
                students: [],
                pagination: getPaginationMeta(1, parseInt(query.limit) || 10, 0)
              }
            };
          }
        } catch (error) {
          console.error('Error filtering students by teacher assignments:', error);
          // On error, fall back to school-level filtering only
        }
      }

      console.log("role:", role);
      console.log("schoolId:", schoolId);
      console.log("adminId:", adminId);
      console.log("query:", query);
      console.log("filter:", filter);

      // Search conditions
      const searchConditions = [];
      const gradeConditions = [];

      if (query.search) {
        searchConditions.push(
          { firstName: { $regex: query.search, $options: 'i' } },
          { lastName: { $regex: query.search, $options: 'i' } },
          { email: { $regex: query.search, $options: 'i' } },
          { studentId: { $regex: query.search, $options: 'i' } }
        );
      }

      if (query.grade && query.grade !== 'all') {
        gradeConditions.push(
          { class: query.grade },
          { gradeLevel: query.grade }
        );
      }

      if (searchConditions.length > 0 || gradeConditions.length > 0) {
        const andConditions = [];

        if (searchConditions.length > 0) {
          andConditions.push({ $or: searchConditions });
        }

        if (gradeConditions.length > 0) {
          andConditions.push({ $or: gradeConditions });
        }

        filter.$and = andConditions;
      }

      // Pagination
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      // Total count
      const totalStudents = await this.userModel.countDocuments(filter);

      // Fetch data
      const students = await this.userModel
        .find(filter)
        .select('firstName lastName email studentId class gradeLevel athletics isActive emergencyContact parentIds schoolId')
        .populate('parentIds', 'firstName lastName email phone')
        .populate('schoolId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Students fetched successfully',
        data: {
          students,
          pagination: getPaginationMeta(page, limit, totalStudents)
        }
      };
    } catch (error) {
      console.error('Error fetching students:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch students',
        data: null
      };
    }
  }

  async getStudentById(schoolId: string, id: string) {
    try {
      const filter: any = {
        _id: id,
        role: 'STUDENT',
        isActive: true
      };

      filter.schoolId = new Types.ObjectId(schoolId);

      const student = await this.userModel
        .findOne(filter)
        .populate('parentIds', 'firstName lastName email phone address')
        .populate('schoolId', 'name')
        .lean();

      if (!student) {
        return {
          success: false,
          statusCode: 404,
          message: 'Student not found',
          data: null
        };
      }

      return {
        success: true,
        statusCode: 200,
        message: 'Student details fetched successfully',
        data: student
      };
    } catch (error) {
      console.error('Error fetching student by ID:', error);
      return {
        success: false,
        statusCode: 400,
        message: 'Failed to fetch student details',
        data: null
      };
    }
  }

  // Find parent by email (for API lookup)
  async findParentByEmail(email: string): Promise<any | null> {
    if (!email || typeof email !== 'string') {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid email',
        data: null
      }
    }
    
    // Normalize email: lowercase and trim (emails are stored in lowercase)
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find parent user by email
    const parentUser = await this.userModel.findOne({
      email: normalizedEmail,
      role: UserRole.PARENT
    }).lean();
    
    if (!parentUser) {
      return {
        success: false,
        statusCode: 404,
        message: 'Parent not found',
        data: null
      }
    }
    
    // Find parent profile to get additional info
    const parentProfile = await this.parentModel.findOne({
      userId: parentUser._id
    }).lean();
    
    return {
      success: true,
      statusCode: 200,
      message: 'Parent found',
      data: {
        _id: parentUser._id
      }
    };
  }

  async createStudent(
    schoolId: string,
    createdBy: string,
    studentData: any,
    role: string,
    files?: UploadedFileType[]
  ) {
    return await withOptionalTransaction(async (session) => {
      try {
      // Debug: Log received data
      console.log('CreateStudent received data:', JSON.stringify(studentData, null, 2));
      console.log('CreateStudent received files:', files?.length || 0);

      // Parse arrays from multipart/form-data
      if (typeof studentData.parents === 'string') {
        studentData.parents = JSON.parse(studentData.parents);
      }
      if (typeof studentData.allergies === 'string' && studentData.allergies.trim() !== '') {
        try {
          studentData.allergies = JSON.parse(studentData.allergies);
        } catch {
          studentData.allergies = [studentData.allergies];
        }
      }
      if (typeof studentData.medicalConditions === 'string' && studentData.medicalConditions.trim() !== '') {
        try {
          studentData.medicalConditions = JSON.parse(studentData.medicalConditions);
        } catch {
          studentData.medicalConditions = [studentData.medicalConditions];
        }
      }
      // Parse boolean fields
      studentData.iipFlag = studentData.iipFlag === 'true' || studentData.iipFlag === true;
      studentData.honorRolls = studentData.honorRolls === 'true' || studentData.honorRolls === true;
      studentData.athletics = studentData.athletics === 'true' || studentData.athletics === true;

      // All validation is handled by DTO decorators - no manual validation needed

      // Normalize clubs into an array (accept JSON string, comma-separated, or array)
      let clubsArray: string[] = [];
      if (Array.isArray((studentData as any).clubs)) {
        clubsArray = ((studentData as any).clubs as string[]).filter(Boolean).map((c) => String(c).trim()).filter(Boolean);
      } else if (typeof (studentData as any).clubs === 'string') {
        const raw = ((studentData as any).clubs as string).trim();
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              clubsArray = parsed.filter(Boolean).map((c) => String(c).trim()).filter(Boolean);
            } else {
              clubsArray = raw.split(',').map((c) => c.trim()).filter(Boolean);
            }
          } catch {
            clubsArray = raw.split(',').map((c) => c.trim()).filter(Boolean);
          }
        }
      }

      // Generate student ID if not provided
      let finalStudentId = studentData.studentId;
      if (!studentData.studentId) {
        let generatedId;
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 10) {
          generatedId = generateStudentId(studentData.firstName, studentData.lastName, studentData.enrollDate);
          const existingStudent = await this.userModel.findOne({
            studentId: generatedId,
            schoolId,
            role: 'STUDENT'
          });
          if (!existingStudent) {
            isUnique = true;
          }
          attempts++;
        }

        if (!isUnique) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Could not generate unique student ID',
            data: null
          };
        }

        finalStudentId = generatedId;
      } else {
        // Check if provided student ID is unique within the school
        const existingStudent = await this.userModel.findOne({
          studentId: studentData.studentId,
          schoolId,
          role: 'STUDENT',
          isActive: true
        });

        if (existingStudent) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Student ID already exists in this school',
            data: null
          };
        }
      }

      // Check if email already exists for a student in this school
      const existingStudentByEmail = await this.userModel.findOne({
        email: studentData.email.toLowerCase().trim(),
        schoolId,
        role: 'STUDENT',
        isActive: true
      }).session(session || undefined).lean();

      if (existingStudentByEmail) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: `Email "${studentData.email}" already exists in the system`,
          data: null
        };
      }

      // Hash password before storing
      const newPassword = studentData.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      console.log("parent IDs:", studentData.parents);

      // Store all student data directly in User table
      const studentUser = new this.userModel({
        email: studentData.email,
        password: newPassword,
        firstName: studentData.firstName,
        lastName: studentData.lastName,
        role: UserRole.STUDENT,
        schoolId: new Types.ObjectId(schoolId),
        isActive: true,
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        createdBy: new Types.ObjectId(createdBy),

        // Student-specific fields from frontend
        class: studentData.class,
        gradeLevel: studentData.gradeLevel ?? studentData.class ?? undefined,
        section: studentData.section,
        gender: studentData.gender,
        dob: studentData.dob ? new Date(studentData.dob) : null,
        enrollDate: studentData.enrollDate ? new Date(studentData.enrollDate) : null,
        expectedGraduation: studentData.expectedGraduation ? String(studentData.expectedGraduation) : undefined,
        studentId: finalStudentId,
        address: typeof studentData.address === 'object' ?
          JSON.stringify(studentData.address) :
          studentData.address || "",
        emergencyContact: (() => {
          if (!studentData.emergencyContact) return null;

          console.log('🔍 Processing emergencyContact:', typeof studentData.emergencyContact, studentData.emergencyContact);

          // If it's already an object, use it as-is
          if (typeof studentData.emergencyContact === 'object' && studentData.emergencyContact !== null) {
            console.log('Using emergencyContact as object:', studentData.emergencyContact);
            return studentData.emergencyContact;
          }

          // If it's a string, try to parse it as JSON first
          if (typeof studentData.emergencyContact === 'string') {
            try {
              const parsed = JSON.parse(studentData.emergencyContact);
              if (typeof parsed === 'object' && parsed !== null) {
                console.log('Parsed emergencyContact JSON:', parsed);
                return parsed;
              }
            } catch (error) {
              console.log('JSON parsing failed, treating as phone number:', studentData.emergencyContact);
              // If JSON parsing fails, treat it as a phone number
              return {
                firstName: 'Emergency',
                lastName: 'Contact',
                phone: studentData.emergencyContact.trim(),
                relationship: 'Emergency Contact'
              };
            }
          }

          return null;
        })(),

        bloodGroup: studentData.bloodGroup,
        medicalConditions: studentData.medicalConditions,
        allergies: studentData.allergies,
        previousSchool: studentData.previousSchool,
        previousGrade: studentData.previousGrade,
        transportMode: studentData.transportMode,
        busRoute: studentData.busRoute,
        nationality: studentData.nationality,
        religion: studentData.religion,
        clubs: clubsArray,
        lunch: studentData.lunch,
        iipFlag: studentData.iipFlag || false,
        honorRolls: studentData.honorRolls || false,
        athletics: studentData.athletics || false,
        profilePicture: studentData.profilePhoto || studentData.profilePicture || '',
        transcripts: studentData.transcripts || [], // Array of AWS URLs
        parentIds: (() => {
          if (!studentData.parents || !Array.isArray(studentData.parents)) {
            return [];
          }
          // Filter and validate parent IDs - only include valid 24-character hex strings
          const validParentIds = studentData.parents
            .map((parentId: any) => {
              // Handle both object with _id and direct string
              const id = typeof parentId === 'object' && parentId !== null ? parentId._id : parentId;
              return id;
            })
            .filter((id: any) => {
              // Validate: must be a non-empty string and valid ObjectId format (24 hex chars)
              if (!id || typeof id !== 'string' || id.trim() === '') {
                return false;
              }
              // Check if it's a valid 24-character hex string
              return /^[0-9a-fA-F]{24}$/.test(id.trim());
            })
            .map((id: string) => new Types.ObjectId(id.trim()));
          return validParentIds;
        })(),
      });

      // Upload files to AWS - separate handling for profile photo and transcripts
      let profilePhotoUrl = studentData.profilePhoto || '';
      const transcriptUrls: string[] = [];

      if (files && files.length > 0) {
        console.log(`📤 Uploading ${files.length} file(s) to AWS S3...`);

        // Fetch school information for organized folder structure
        const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
        const schoolName = school?.name || null;
        const schoolIdStr = school?._id?.toString() || schoolId;

        for (const file of files) {
          try {
            const fileExtension = file.originalname.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

            // Get file content - handle both memory and disk storage
            const fileContent = file.buffer || fs.readFileSync(file.path || '');

            // Build S3 key path with organized folder structure
            let s3Key: string;

            if (file.fieldname === 'profilePhoto') {
              // Profile photo must be an image
              const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtension?.toLowerCase() || '');
              if (!isImage) {
                console.warn(`⚠️ Profile photo should be an image. Skipping file: ${file.originalname}`);
                // Clean up if it was saved to disk
                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
                continue;
              }
              // Build path: schools/{school-name}/students/profile-images/{filename}
              s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'students', 'profile-images', fileName);
            } else if (file.fieldname === 'transcripts') {
              // Build path: schools/{school-name}/students/transcripts/{filename}
              s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'students', 'transcripts', fileName);
            } else {
              // Unknown field, skip
              console.warn(`⚠️ Unknown field name: ${file.fieldname}. Skipping file: ${file.originalname}`);
              // Clean up if it was saved to disk
              if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
              continue;
            }

            // Upload file using AWS service
            const awsUrl = await uploadBufferToS3(this.awsService.getS3Client(), this.awsService.getBucketName(), s3Key, fileContent, file.mimetype);

            console.log(`✅ File uploaded successfully to ${s3Key}: ${awsUrl}`);

            // Clean up if it was saved to disk
            if (file.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }

            // Save URLs based on field name
            if (file.fieldname === 'profilePhoto') {
              profilePhotoUrl = awsUrl;
              console.log(`📷 Profile photo saved: ${awsUrl}`);
            } else if (file.fieldname === 'transcripts') {
              transcriptUrls.push(awsUrl);
              console.log(`📄 Transcript saved: ${awsUrl}`);
            }

          } catch (uploadError) {
            console.error(`❌ Error uploading file ${file.originalname}:`, uploadError);
            // Continue with student creation even if file upload fails
          }
        }
      }

      console.log(`📊 Final URLs - Profile Photo: ${profilePhotoUrl}, Transcripts: ${transcriptUrls.length}`);

      // Update student record with uploaded file URLs
      studentUser.profilePicture = profilePhotoUrl;
      (studentUser as any).transcripts = transcriptUrls.length > 0 ? transcriptUrls : (studentData.transcripts || []);

      const saveOptions = session ? { session } : {};
      await studentUser.save(saveOptions);

      // If parents are provided, update the parent profiles to include this student
      if (studentData.parents && studentData.parents.length > 0) {
        try {
          console.log(`🔗 Linking student ${studentUser._id} to ${studentData.parents.length} parent(s):`, studentData.parents);
          
          // Verify parents exist before linking
          const parentIds = studentData.parents
            .map((parentId: any) => {
              const id = typeof parentId === 'object' && parentId !== null ? parentId._id : parentId;
              return id && typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id.trim()) ? id.trim() : null;
            })
            .filter((id: string | null): id is string => id !== null);

          if (parentIds.length === 0) {
            console.warn('⚠️ No valid parent IDs found to link');
          } else {
            // Verify each parent exists and is a PARENT role
            for (const parentId of parentIds) {
              const parentCheck = await this.userModel.findById(parentId).select('role').session(session || undefined).lean();
              if (!parentCheck) {
                console.error(`❌ Parent ${parentId} not found in database`);
                continue;
              }
              if (parentCheck.role !== 'PARENT') {
                console.error(`❌ User ${parentId} is not a PARENT (role: ${parentCheck.role})`);
                continue;
              }
              console.log(`✅ Verified parent ${parentId} exists and has PARENT role`);
            }

            // Use utility function to maintain bidirectional relationship
            // Link each parent individually to pass relationship info (isPrimaryContact, hasPickupPermission)
            for (const parentId of parentIds) {
              try {
                // Fetch parent's Parent model to get isPrimaryContact and hasPickupPermission
                // IMPORTANT: Don't use .lean() in transaction - use .exec() instead
                const parentDocQuery = this.parentModel.findOne({ userId: parentId });
                if (session) {
                  parentDocQuery.session(session);
                }
                const parentDoc = await parentDocQuery.exec();
                
                // Get relationship info from parent document
                const isPrimaryContact = parentDoc?.isPrimaryContact ?? false;
                const hasPickupPermission = parentDoc?.hasPickupPermission ?? false;
                
                console.log(`🔗 Linking student ${studentUser._id} to parent ${parentId} with isPrimaryContact: ${isPrimaryContact}, hasPickupPermission: ${hasPickupPermission}`);
                
                // Use linkStudentToParent (singular) for individual linking with relationship info
                await linkStudentToParent(
                  studentUser._id.toString(),
                  parentId,
                  {
                    userModel: this.userModel,
                    parentProfileModel: this.parentProfileModel,
                    isPrimaryContact: isPrimaryContact,
                    hasPickupPermission: hasPickupPermission,
                    relationship: 'Parent', // Default relationship
                    session
                  }
                );
                
                console.log(`✅ Successfully linked student ${studentUser._id} to parent ${parentId} with relationship info`);
              } catch (error: any) {
                console.error(`❌ Error linking student ${studentUser._id} to parent ${parentId}:`, error);
                // Continue with other parents even if one fails
              }
            }

            // Verify the update was successful
            for (const parentId of parentIds) {
              const parentAfterUpdate = await this.userModel.findById(parentId).select('children').session(session || undefined).lean();
              if (parentAfterUpdate) {
                const hasStudent = (parentAfterUpdate.children || []).some(
                  (childId: any) => childId.toString() === studentUser._id.toString()
                );
                if (hasStudent) {
                  console.log(`✅ Verified: Student ${studentUser._id} is now in parent ${parentId}'s children array`);
                } else {
                  console.error(`❌ ERROR: Student ${studentUser._id} is NOT in parent ${parentId}'s children array after linking!`);
                }
              }
            }
          }
        } catch (error: any) {
          console.error(`❌ Error linking parents to student ${studentUser._id}:`, error);
          console.error(`❌ Error details:`, error?.message, error?.stack);
          // Don't throw - student is already created, but log the error for debugging
        }
      }

      // Log the activity
      const activityData = {
        title: 'Student Created',
        subtitle: `Student ${studentData.firstName} ${studentData.lastName} was created`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy)
      };

      const createOptions = session ? { session } : {};
      await this.activityModel.create([activityData], createOptions);

      // Send welcome email (outside transaction to avoid blocking)
      try {
        await this.emailService.sendWelcomeEmail(
          studentUser.email,
          studentUser.firstName,
          studentUser.lastName,
          studentUser.role,
          newPassword,
        );
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${studentUser.email}:`, emailError);
        // Don't fail the creation if email fails
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student created successfully',
        data: null
      };
      } catch (error) {
        console.error('Error in createStudent:', error);
        if (error instanceof ConflictException || error instanceof BadRequestException) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: error.message,
            data: null
          };
        }
        // Log the specific validation error if it's a mongoose validation error
        if (error.name === 'ValidationError') {
          console.error('Validation errors:', error.errors);
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: `Validation failed: ${Object.keys(error.errors).join(', ')}`,
            data: null
          };
        }
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Failed to create student',
          data: null
        };
      }
    }, this.userModel.db);
  }

  async updateStudent(schoolId: string, id: string, updateData: any, role: string, files: UploadedFileType[] = []) {
    return await withOptionalTransaction(async (session) => {
      try {
        console.log('UpdateStudent received data:', JSON.stringify(updateData, null, 2));
        console.log('UpdateStudent received files:', files?.length || 0);

      // Parse arrays/booleans similar to create
      if (typeof updateData.parents === 'string') {
        try { updateData.parents = JSON.parse(updateData.parents); } catch { /* ignore */ }
      }
      if (typeof updateData.allergies === 'string' && updateData.allergies.trim() !== '') {
        try { updateData.allergies = JSON.parse(updateData.allergies); } catch { updateData.allergies = [updateData.allergies]; }
      }
      if (typeof updateData.medicalConditions === 'string' && updateData.medicalConditions.trim() !== '') {
        try { updateData.medicalConditions = JSON.parse(updateData.medicalConditions); } catch { updateData.medicalConditions = [updateData.medicalConditions]; }
      }
      updateData.iipFlag = updateData.iipFlag === 'true' || updateData.iipFlag === true;
      updateData.honorRolls = updateData.honorRolls === 'true' || updateData.honorRolls === true;
      updateData.athletics = updateData.athletics === 'true' || updateData.athletics === true;

      // Normalize clubs into an array
      if ((updateData as any).clubs !== undefined) {
        if (Array.isArray((updateData as any).clubs)) {
          (updateData as any).clubs = ((updateData as any).clubs as string[]).filter(Boolean).map((c) => String(c).trim()).filter(Boolean);
        } else if (typeof (updateData as any).clubs === 'string') {
          const raw = ((updateData as any).clubs as string).trim();
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              (updateData as any).clubs = Array.isArray(parsed) ? parsed.filter(Boolean).map((c) => String(c).trim()).filter(Boolean) : raw.split(',').map((c) => c.trim()).filter(Boolean);
            } catch {
              (updateData as any).clubs = raw.split(',').map((c) => c.trim()).filter(Boolean);
            }
          } else {
            (updateData as any).clubs = [];
          }
        }
      }

      // CRITICAL FIX: Hash password if it's being updated
      if (updateData.password && updateData.password.trim() !== '') {
        const salt = await bcrypt.genSalt(10);
        updateData.password = await bcrypt.hash(updateData.password, salt);
      } else {
        // Remove password field if it's empty to avoid overwriting with empty string
        delete updateData.password;
      }

      // Convert parent IDs to ObjectIds if they're provided
      // Always sync parent relationships when parentIds changes to ensure bidirectional consistency
      let shouldUpdateParents = false;
      let newParentIds: Types.ObjectId[] = [];
      
      if (updateData.parents !== undefined && updateData.parents !== null) {
        if (Array.isArray(updateData.parents)) {
          // Filter and validate parent IDs - only include valid 24-character hex strings
          const validParentIds = updateData.parents
            .map((parentId: any) => {
              // Handle both object with _id and direct string
              const id = typeof parentId === 'object' && parentId !== null ? parentId._id : parentId;
              return id;
            })
            .filter((id: any) => {
              // Validate: must be a non-empty string and valid ObjectId format (24 hex chars)
              if (!id || typeof id !== 'string' || id.trim() === '') {
                return false;
              }
              // Check if it's a valid 24-character hex string
              return /^[0-9a-fA-F]{24}$/.test(id.trim());
            })
            .map((id: string) => new Types.ObjectId(id.trim()));
          updateData.parentIds = validParentIds;
          newParentIds = validParentIds;
          shouldUpdateParents = true;
        } else if (updateData.parents === '') {
          // Empty string means remove all parents
          updateData.parentIds = [];
          newParentIds = [];
          shouldUpdateParents = true;
        }
        delete updateData.parents; // Remove the old field
      } else if (updateData.parentIds !== undefined && updateData.parentIds !== null) {
        // Handle parentIds if set directly (for backward compatibility)
        if (Array.isArray(updateData.parentIds)) {
          newParentIds = updateData.parentIds
            .map((pid: any) => {
              if (pid instanceof Types.ObjectId) return pid;
              if (typeof pid === 'string' && /^[0-9a-fA-F]{24}$/.test(pid.trim())) {
                return new Types.ObjectId(pid.trim());
              }
              return null;
            })
            .filter((pid: Types.ObjectId | null): pid is Types.ObjectId => pid !== null);
          updateData.parentIds = newParentIds;
          shouldUpdateParents = true;
        } else if (updateData.parentIds === '') {
          updateData.parentIds = [];
          newParentIds = [];
          shouldUpdateParents = true;
        }
      }

      // Clean up data before update - remove guardian and phone fields
      const cleanUpdateData = { ...updateData };
      delete cleanUpdateData.guardianName;
      delete cleanUpdateData.guardianPhone;
      delete cleanUpdateData.guardianEmail;
      delete cleanUpdateData.guardianRelationship;
      delete cleanUpdateData.phone;

      // Handle emergency contact properly
      if (cleanUpdateData.emergencyContact !== undefined) {
        if (!cleanUpdateData.emergencyContact) {
          cleanUpdateData.emergencyContact = null;
        } else if (typeof cleanUpdateData.emergencyContact === 'object') {
          // Keep as object if it's already structured
          cleanUpdateData.emergencyContact = cleanUpdateData.emergencyContact;
        } else if (typeof cleanUpdateData.emergencyContact === 'string') {
          try {
            const parsed = JSON.parse(cleanUpdateData.emergencyContact as any);
            if (typeof parsed === 'object' && parsed !== null) {
              cleanUpdateData.emergencyContact = parsed;
            } else {
              cleanUpdateData.emergencyContact = {
                firstName: 'Emergency',
                lastName: 'Contact',
                phone: String(cleanUpdateData.emergencyContact).trim(),
                relationship: 'Emergency Contact'
              };
            }
          } catch {
            cleanUpdateData.emergencyContact = {
              firstName: 'Emergency',
              lastName: 'Contact',
              phone: String(cleanUpdateData.emergencyContact).trim(),
              relationship: 'Emergency Contact'
            };
          }
        }
      }

      // Ensure arrays stay arrays per schema
      if (cleanUpdateData.medicalConditions && !Array.isArray(cleanUpdateData.medicalConditions)) {
        cleanUpdateData.medicalConditions = [cleanUpdateData.medicalConditions].filter(Boolean);
      }
      if (cleanUpdateData.allergies && !Array.isArray(cleanUpdateData.allergies)) {
        cleanUpdateData.allergies = [cleanUpdateData.allergies].filter(Boolean);
      }
      if (cleanUpdateData.class !== undefined || cleanUpdateData.gradeLevel !== undefined) {
        cleanUpdateData.gradeLevel = cleanUpdateData.gradeLevel ?? cleanUpdateData.class;
      }

      // Fetch current student for existing URLs and OLD parentIds
      const currentStudent = await this.userModel.findOne({ _id: id, schoolId, role: 'STUDENT' }).lean();
      if (!currentStudent) {
        throw new NotFoundException('Student not found');
      }

      // Get old parentIds before update for relationship cleanup
      const oldParentIds: Types.ObjectId[] = Array.isArray((currentStudent as any).parentIds) 
        ? (currentStudent as any).parentIds.map((pid: any) => 
            pid instanceof Types.ObjectId ? pid : new Types.ObjectId(pid.toString())
          )
        : [];

      // Uniqueness checks: keep studentId unique, but email duplicates are allowed for students
      if (cleanUpdateData.studentId && cleanUpdateData.studentId !== (currentStudent as any).studentId) {
        const sidExists = await this.userModel.findOne({
          _id: { $ne: new Types.ObjectId(id) },
          schoolId,
          role: 'STUDENT',
          studentId: cleanUpdateData.studentId
        }).lean();
        if (sidExists) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Student ID already exists for another student in this school',
            data: null
          };
        }
      }

      // Handle files: profilePhoto replacement and transcripts append (parallel uploads)
      let newProfilePhotoUrl: string | null = null;
      const transcriptUploads: Promise<string>[] = [];

      // Fetch school information for organized folder structure
      const schoolIdFromStudent = currentStudent.schoolId?.toString() || schoolId;
      const school = await this.schoolModel.findById(schoolIdFromStudent).select('name _id').lean();
      const schoolName = school?.name || null;
      const schoolIdStr = school?._id?.toString() || schoolIdFromStudent;

      for (const file of files || []) {
        const ext = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const content = file.buffer || fs.readFileSync(file.path || '');

        if (file.fieldname === 'profilePhoto') {
          const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext?.toLowerCase() || '');
          if (!isImage) {
            console.warn(`Profile photo must be an image. Skipping: ${file.originalname}`);
            if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
            continue;
          }
          // Build path: schools/{school-name}/students/profile-images/{filename}
          const key = buildS3KeyPath(schoolName, schoolIdStr, 'students', 'profile-images', fileName);
          // Upload new first, then delete old for safety
          const uploadedUrl = await uploadBufferToS3(this.awsService.getS3Client(), this.awsService.getBucketName(), key, content, file.mimetype);
          newProfilePhotoUrl = uploadedUrl;
        } else if (file.fieldname === 'transcripts') {
          // Build path: schools/{school-name}/students/transcripts/{filename}
          const key = buildS3KeyPath(schoolName, schoolIdStr, 'students', 'transcripts', fileName);
          transcriptUploads.push(uploadBufferToS3(this.awsService.getS3Client(), this.awsService.getBucketName(), key, content, file.mimetype));
        }

        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }

      // Await transcript uploads in parallel
      const newTranscriptUrls = await Promise.all(transcriptUploads);

      // If new profile photo set, try delete old
      if (newProfilePhotoUrl) {
        const oldUrl = (currentStudent as any).profilePicture || (currentStudent as any).profilePhoto;
        const oldKey = extractS3KeyFromUrl(oldUrl, this.awsService.getBucketName(), this.configService.get<string>('AWS_REGION'));
        if (oldKey) {
          try { await deleteFromS3(this.awsService.getS3Client(), this.awsService.getBucketName(), oldKey); } catch (e) { console.warn('Failed to delete old profile photo:', e?.message || e); }
        }
        (cleanUpdateData as any).profilePicture = newProfilePhotoUrl;
      }

      // Append new transcripts
      if (newTranscriptUrls.length > 0) {
        (cleanUpdateData as any).$push = { transcripts: { $each: newTranscriptUrls } };
      }

      // Determine the new parentIds BEFORE updating the student
      // This is what will be in the database after the update
      let finalParentIds: Types.ObjectId[] = oldParentIds; // Default to old ones
      
      if (shouldUpdateParents) {
        // Parents were explicitly provided via 'parents' field
        finalParentIds = newParentIds || [];
        // Ensure parentIds is in cleanUpdateData for the database update
        cleanUpdateData.parentIds = finalParentIds;
      } else if (cleanUpdateData.parentIds !== undefined && cleanUpdateData.parentIds !== null) {
        // parentIds was set directly in cleanUpdateData (backward compatibility or direct update)
        if (Array.isArray(cleanUpdateData.parentIds)) {
          finalParentIds = cleanUpdateData.parentIds
            .map((pid: any) => {
              if (pid instanceof Types.ObjectId) return pid;
              if (typeof pid === 'string' && /^[0-9a-fA-F]{24}$/.test(pid.trim())) {
                return new Types.ObjectId(pid.trim());
              }
              return null;
            })
            .filter((pid: Types.ObjectId | null): pid is Types.ObjectId => pid !== null);
          cleanUpdateData.parentIds = finalParentIds; // Ensure it's ObjectId array
          shouldUpdateParents = true; // Enable sync since parentIds changed
        } else if (cleanUpdateData.parentIds === '') {
          finalParentIds = [];
          cleanUpdateData.parentIds = [];
          shouldUpdateParents = true;
        }
      }
      
      // Check if parentIds changed (compare old vs new)
      const oldParentIdsStr = new Set(oldParentIds.map(pid => pid.toString()));
      const finalParentIdsStr = new Set(finalParentIds.map(pid => pid.toString()));
      const parentIdsChanged = oldParentIdsStr.size !== finalParentIdsStr.size ||
        Array.from(oldParentIdsStr).some(pid => !finalParentIdsStr.has(pid)) ||
        Array.from(finalParentIdsStr).some(pid => !oldParentIdsStr.has(pid));

      const updateOps = { ...cleanUpdateData } as any;
      // If $push exists merge properly
      if (cleanUpdateData.$push) {
        const { $push, ...rest } = cleanUpdateData as any;
        updateOps.$push = $push;
        Object.assign(updateOps, rest);
      }
      
      const updateOptions = session ? { new: true, session } : { new: true };
      const student = await this.userModel.findOneAndUpdate(
        { _id: id, schoolId, role: 'STUDENT' },
        updateOps,
        updateOptions
      ).populate('parentIds', 'firstName lastName email phone');

      if (!student) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student not found',
          data: null
        };
      }

      // Handle parent relationship updates: remove from old parents, add to new parents
      // Always sync parent relationships when parentIds changes to ensure bidirectional consistency
      if (shouldUpdateParents || parentIdsChanged) {
        const studentObjectId = new Types.ObjectId(id);
        const newParentIdsToUse = finalParentIds;
        const newParentIdsStr = finalParentIdsStr;

        // Remove student from old parents' children arrays (parents that are no longer linked)
        for (const oldParentId of oldParentIds) {
          const oldParentIdStr = oldParentId.toString();
          if (!newParentIdsStr.has(oldParentIdStr)) {
            // This parent is being removed, use utility function to unlink
            try {
              await unlinkStudentFromParent(
                studentObjectId.toString(),
                oldParentId.toString(),
                {
                  userModel: this.userModel,
                  parentProfileModel: this.parentProfileModel,
                  session
                }
              );
              console.log(`✅ Removed student ${id} from old parent ${oldParentIdStr}`);
            } catch (error) {
              console.error(`❌ Error removing student from old parent ${oldParentIdStr}:`, error);
              // Continue with other parents even if one fails
            }
          }
        }

        // Add student to new parents' children arrays (parents that are newly linked)
        const parentsToAdd = newParentIdsToUse.filter(pid => !oldParentIdsStr.has(pid.toString()));
        if (parentsToAdd.length > 0) {
          try {
            await linkStudentToParents(
              studentObjectId.toString(),
              parentsToAdd.map(pid => pid.toString()),
              {
                userModel: this.userModel,
                parentProfileModel: this.parentProfileModel,
                session
              }
            );
            console.log(`✅ Linked student ${id} to ${parentsToAdd.length} new parent(s)`);
          } catch (error) {
            console.error(`❌ Error linking student to new parents:`, error);
            // Continue even if linking fails
          }
        }
        // Note: If parentId exists in both old and new, no change needed (relationship persists)
      }
      
      // Always ensure parentIds is removed from updateData after sync (it's already been applied to student)
      if (updateData.parentIds !== undefined) {
        delete updateData.parentIds;
      }

      // Log the activity
      const activityData = {
        title: 'Student Updated',
        subtitle: `Student ${student.firstName} ${student.lastName} was updated`,
        performBy: role,
        actorId: new Types.ObjectId(schoolId),
        adminId: new Types.ObjectId(schoolId)  // Use schoolId as fallback since we don't have updatedBy parameter
      };

      const createOptions = session ? { session } : {};
      await this.activityModel.create([activityData], createOptions);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student updated successfully',
        data: null
      };
      } catch (error) {
        if (error instanceof NotFoundException) {
          return {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Student not found',
            data: null
          };
        }
        console.error('Error updating student:', error);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: error.message || 'Failed to update student',
          data: null
        };
      }
    }, this.userModel.db);
  }

  async deleteStudent(schoolId: string, id: string, adminId: string, role: string): Promise<any> {
    try {
      const student = await this.userModel.findOne({ _id: id, schoolId, role: 'STUDENT', isActive: true });

      if (!student) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student not found',
          data: null
        };
      }

      // Soft delete - mark as inactive
      await this.userModel.findByIdAndUpdate(id, { isActive: false });

      // After student deactivation, evaluate each linked parent's status
      const parentIds: any[] = Array.isArray((student as any).parentIds) ? (student as any).parentIds : [];
      if (parentIds.length > 0) {
        for (const pid of parentIds) {
          try {
            // Count remaining ACTIVE children for this parent
            const activeChildrenCount = await this.userModel.countDocuments({
              role: 'STUDENT',
              isActive: true,
              parentIds: pid,
            });

            // If no active children remain, set parent inactive; otherwise keep parent active
            await this.userModel.updateOne(
              { _id: pid, role: 'PARENT', schoolId },
              { $set: { isActive: activeChildrenCount > 0 } }
            );
          } catch (e) {
            // Non-blocking: continue even if a parent update fails
            console.warn('Parent status update skipped:', (e as any)?.message || e);
          }
        }
      }

      // Log the activity with the actual student name and admin ID
      const activityData = {
        title: 'Student Deleted',
        subtitle: `Student ${student.firstName} ${student.lastName} was deleted`,
        performBy: role,
        actorId: new Types.ObjectId(adminId),
        adminId: new Types.ObjectId(adminId)
      };

      await this.activityModel.create(activityData);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Student deleted successfully',
        data: null
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student not found',
          data: null
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to delete student',
        data: null
      };
    }
  }

  async deleteStudentTranscript(schoolId: string, studentId: string, transcriptUrl: string) {
    try {
      const student = await this.userModel.findOne({ _id: studentId, schoolId, role: 'STUDENT' }).lean();
      if (!student) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Student not found',
          data: null
        };
      }

      const region = this.configService.get<string>('AWS_REGION');
      const bucket = this.awsService.getBucketName();
      const key = extractS3KeyFromUrl(transcriptUrl, bucket, region);

      if (!key) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid transcript URL',
          data: null
        };
      }

      // Delete from S3 (best effort)
      try {
        await deleteFromS3(this.awsService.getS3Client(), bucket, key);
      } catch (e) {
        // Continue even if S3 delete fails; DB still updated to avoid blocking UI
        console.warn('S3 delete failed for transcript:', e?.message || e);
      }

      // Remove from DB
      await this.userModel.updateOne(
        { _id: studentId, schoolId, role: 'STUDENT' },
        { $pull: { transcripts: transcriptUrl } }
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Transcript deleted successfully',
        data: null
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error.message || 'Failed to delete transcript',
        data: null
      };
    }
  }

  async exportStudents(schoolId: string, adminId: string) {
    try {
      // Fetch ALL students without pagination for export

      // schoolId is optional, if not provided, fetch all students
      let allStudents: any[] = [];
      if (!schoolId) {
        allStudents = await this.userModel
          .find({
            role: 'STUDENT',
            isActive: true
          })
          .populate('parentIds', 'firstName lastName email phone')
          .select('firstName lastName email studentId class gradeLevel section gender dob dateOfBirth address enrollDate expectedGraduation bloodGroup medicalConditions allergies nationality religion transportMode busRoute clubs lunch iipFlag honorRolls athletics profilePicture transcripts emergencyContact parentIds createdAt updatedAt isActive')
          .sort({ createdAt: -1 })
          .lean();
      }
      else {
        allStudents = await this.userModel
          .find({
            schoolId: schoolId,
            role: 'STUDENT',
            isActive: true
          })
          .populate('parentIds', 'firstName lastName email phone')
          .select('firstName lastName email studentId class gradeLevel section gender dob dateOfBirth address enrollDate expectedGraduation bloodGroup medicalConditions allergies nationality religion transportMode busRoute clubs lunch iipFlag honorRolls athletics profilePicture transcripts emergencyContact parentIds createdAt updatedAt isActive')
          .sort({ createdAt: -1 })
          .lean();
      }

      if (!allStudents || allStudents.length === 0) {
        return {
          csvContent: '',
          filename: `students_${schoolId ? schoolId : 'all'}_${new Date().toISOString().split('T')[0]}.csv`
        };
      }

      // Helper function to format dates
      const formatDate = (date: any): string => {
        if (!date) return 'N/A';
        try {
          const d = new Date(date);
          return isNaN(d.getTime()) ? 'N/A' : d.toISOString().split('T')[0];
        } catch {
          return 'N/A';
        }
      };

      // Helper function to format arrays
      const formatArray = (arr: any): string => {
        if (!arr) return 'N/A';
        if (typeof arr === 'string') return arr || 'N/A';
        if (Array.isArray(arr)) {
          const filtered = arr.filter(Boolean);
          return filtered.length > 0 ? filtered.join(', ') : 'N/A';
        }
        return String(arr) || 'N/A';
      };

      // Helper function to format address
      const formatAddress = (addr: any): string => {
        if (!addr) return 'N/A';
        if (typeof addr === 'string') return addr || 'N/A';
        if (typeof addr === 'object') {
          const parts = [
            addr.street,
            addr.city,
            addr.state,
            addr.zipCode,
            addr.country
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(', ') : 'N/A';
        }
        return 'N/A';
      };

      // CSV field escaping function
      const escapeCsvField = (field: string): string => {
        if (field === null || field === undefined) return 'N/A';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Define CSV headers
      const csvHeaders = [
        { key: 'studentId', header: 'Student ID' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'email', header: 'Email' },
        { key: 'class', header: 'Class' },
        { key: 'section', header: 'Section' },
        { key: 'gender', header: 'Gender' },
        { key: 'dob', header: 'Date of Birth' },
        { key: 'address', header: 'Address' },
        { key: 'enrollDate', header: 'Enrollment Date' },
        { key: 'expectedGraduation', header: 'Expected Graduation' },
        { key: 'bloodGroup', header: 'Blood Group' },
        { key: 'medicalConditions', header: 'Medical Conditions' },
        { key: 'allergies', header: 'Allergies' },
        { key: 'nationality', header: 'Nationality' },
        { key: 'religion', header: 'Religion' },
        { key: 'transportMode', header: 'Transport Mode' },
        { key: 'busRoute', header: 'Bus Route' },
        { key: 'clubs', header: 'Clubs' },
        { key: 'lunch', header: 'Lunch Preference' },
        { key: 'iipFlag', header: 'IIP Flag' },
        { key: 'honorRolls', header: 'Honor Rolls' },
        { key: 'athletics', header: 'Athletics' },
        { key: 'profilePhoto', header: 'Profile Photo URL' },
        { key: 'transcriptsCount', header: 'Transcripts Count' },
        { key: 'transcriptsUrls', header: 'Transcripts URLs' },
        { key: 'ecFirstName', header: 'Emergency Contact First Name' },
        { key: 'ecLastName', header: 'Emergency Contact Last Name' },
        { key: 'ecFullName', header: 'Emergency Contact Full Name' },
        { key: 'ecPhone', header: 'Emergency Contact Phone' },
        { key: 'ecRelationship', header: 'Emergency Contact Relationship' },
        { key: 'parentNames', header: 'Parent Names' },
        { key: 'parentEmails', header: 'Parent Emails' },
        { key: 'parentPhones', header: 'Parent Phones' },
        { key: 'status', header: 'Status' },
        { key: 'createdAt', header: 'Created At' },
        { key: 'updatedAt', header: 'Updated At' }
      ];

      // Map all students with comprehensive fields
      const csvRecords = allStudents.map((student: any) => {
        // Format emergency contact
        const ec = student.emergencyContact || {};
        const ecName = ec.firstName || ec.lastName
          ? `${ec.firstName || ''} ${ec.lastName || ''}`.trim()
          : 'N/A';

        // Format parents
        const parents = Array.isArray(student.parentIds) ? student.parentIds : [];
        const parentNames = parents.map((p: any) =>
          `${p.firstName || ''} ${p.lastName || ''}`.trim()
        ).filter(Boolean).join('; ') || 'N/A';
        const parentEmails = parents.map((p: any) => p.email || '').filter(Boolean).join('; ') || 'N/A';
        const parentPhones = parents.map((p: any) => p.phone || '').filter(Boolean).join('; ') || 'N/A';

        return {
          studentId: student.studentId || 'N/A',
          firstName: student.firstName || 'N/A',
          lastName: student.lastName || 'N/A',
          email: student.email || 'N/A',
          class: student.class || student.gradeLevel || 'N/A',
          section: student.section || 'N/A',
          gender: student.gender || 'N/A',
          dob: formatDate(student.dob || student.dateOfBirth),
          address: formatAddress(student.address),
          enrollDate: formatDate(student.enrollDate),
          expectedGraduation: student.expectedGraduation || 'N/A',
          bloodGroup: student.bloodGroup || 'N/A',
          medicalConditions: formatArray(student.medicalConditions),
          allergies: formatArray(student.allergies),
          nationality: student.nationality || 'N/A',
          religion: student.religion || 'N/A',
          transportMode: student.transportMode || 'N/A',
          busRoute: student.busRoute || 'N/A',
          clubs: formatArray(student.clubs),
          lunch: student.lunch || 'N/A',
          iipFlag: student.iipFlag ? 'Yes' : 'No',
          honorRolls: student.honorRolls ? 'Yes' : 'No',
          athletics: student.athletics ? 'Yes' : 'No',
          profilePhoto: student.profilePicture || 'N/A',
          transcriptsCount: Array.isArray(student.transcripts) ? student.transcripts.length : 0,
          transcriptsUrls: Array.isArray(student.transcripts) ? student.transcripts.join('; ') : 'N/A',
          ecFirstName: ec.firstName || 'N/A',
          ecLastName: ec.lastName || 'N/A',
          ecFullName: ecName,
          ecPhone: ec.phone || 'N/A',
          ecRelationship: ec.relationship || 'N/A',
          parentNames: parentNames,
          parentEmails: parentEmails,
          parentPhones: parentPhones,
          status: student.isActive !== false ? 'Active' : 'Inactive',
          createdAt: formatDate(student.createdAt),
          updatedAt: formatDate(student.updatedAt)
        };
      });

      // Generate CSV content manually
      const headerRow = csvHeaders.map(h => escapeCsvField(h.header)).join(',');
      const dataRows = csvRecords.map((record: any) =>
        csvHeaders.map(h => escapeCsvField(String(record[h.key as keyof typeof record] || 'N/A'))).join(',')
      );

      const csvContent = [headerRow, ...dataRows].join('\r\n');

      return {
        csvContent,
        filename: `students_${schoolId}_${new Date().toISOString().split('T')[0]}.csv`
      };
    } catch (error) {
      console.error('Error exporting students:', error);
      throw new BadRequestException('Failed to export students');
    }
  }

  async bulkUploadStudents(schoolId: string, createdBy: string, role: string, file: UploadedFileType) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Clean up uploaded file helper
    const cleanupFile = () => {
      try {
        if (file && file.path) {
          const fs = require('fs');
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      } catch (cleanupError) {
        console.error('Error cleaning up uploaded file:', cleanupError);
      }
    };

    try {
      return await withOptionalTransaction(async (session) => {
        const XLSX = require('xlsx');

        // Read first sheet from file (works for .xlsx and .csv)
        const workbook = XLSX.readFile(file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        if (!rows || rows.length === 0) {
          throw new BadRequestException('Import file is empty or invalid');
        }

      // Helper parsers
      const toBool = (v: any): boolean => {
        if (typeof v === 'boolean') return v;
        if (v === undefined || v === null || v === '') return false;
        const s = String(v).trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'y';
      };
      
      const toArray = (v: any): string[] => {
        if (!v) return [];
        if (Array.isArray(v)) return v.filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
        const s = String(v);
        if (s.startsWith('[') && s.endsWith(']')) {
          try { const parsed = JSON.parse(s); return Array.isArray(parsed) ? parsed.map((x: any) => String(x).trim()).filter(Boolean) : []; } catch { /* fallthrough */ }
        }
        return s.split(',').map((x) => x.trim()).filter(Boolean);
      };

      // Fixed date parser to handle Excel dates correctly
      const toDate = (v: any): Date | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        
        // If it's already a Date object, return it
        if (v instanceof Date) {
          return isNaN(v.getTime()) ? undefined : v;
        }
        
        // Convert to string first to check patterns
        const str = String(v).trim();
        if (!str) return undefined;
        
        // Check if it's just a 4-digit year (e.g., "1905", "2015")
        // Years before 1900 should be treated as literal years, not dates
        const yearOnlyMatch = str.match(/^(\d{4})$/);
        if (yearOnlyMatch) {
          const year = parseInt(yearOnlyMatch[1]);
          // If it's a valid year (between 1800 and current year + 100), treat it as year
          // But for date of birth, we want to create a date
          // For year-only input like "1905", create date as January 1st of that year
          if (year >= 1800 && year <= 2100) {
            return new Date(year, 0, 1); // January 1st of that year
          }
        }
        
        // If it's a number (Excel serial date), convert it
        if (typeof v === 'number') {
          // Excel serial date typically starts from 1 = 1900-01-01
          // Numbers less than ~1000 are likely years, not serial dates
          if (v > 0 && v < 1000) {
            // Treat as year
            const year = Math.floor(v);
            if (year >= 1800 && year <= 2100) {
              return new Date(year, 0, 1);
            }
          }
          
          // Otherwise, treat as Excel serial date
          // Excel serial date starts from 1900-01-01 (but Excel incorrectly treats 1900 as leap year)
          // JavaScript Date uses 1970-01-01 as epoch
          // Excel serial date 1 = 1900-01-01, so we need to adjust
          const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
          const date = new Date(excelEpoch.getTime() + (v - 1) * 86400000);
          if (!isNaN(date.getTime())) return date;
        }
        
        // Try parsing as ISO date string
        let d = new Date(str);
        if (!isNaN(d.getTime())) {
          // Check if the parsed date makes sense (not way off)
          const parsedYear = d.getFullYear();
          // If year is way off (like 1905 parsed as 2005), check if original was just a year
          if (parsedYear >= 1900 && parsedYear <= 2100) {
            // Check if original string was just digits that could be a year
            const originalDigits = str.replace(/\D/g, '');
            if (originalDigits.length === 4) {
              const originalYear = parseInt(originalDigits);
              if (originalYear >= 1800 && originalYear <= 2100 && originalYear !== parsedYear) {
                // Original was likely just a year, use it
                return new Date(originalYear, 0, 1);
              }
            }
          }
          return d;
        }
        
        // Try parsing common date formats
        // Format: MM/DD/YYYY or DD/MM/YYYY
        const dateMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if (dateMatch) {
          const [, month, day, year] = dateMatch;
          const yearNum = parseInt(year);
          // Ensure year is valid (1800-2100)
          if (yearNum >= 1800 && yearNum <= 2100) {
            d = new Date(yearNum, parseInt(month) - 1, parseInt(day));
            if (!isNaN(d.getTime())) return d;
          }
        }
        
        // If all parsing fails, return undefined
        return undefined;
      };

      const toYearString = (v: any): string | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        const str = String(v).trim();
        const match = str.match(/^\d{4}$/);
        if (match) return match[0];
        // try to parse date and take year
        const d = toDate(str);
        if (d) return String(d.getFullYear());
        return undefined;
      };

        // Helper function to find or create parent by email
        const findOrCreateParent = async (
          parentEmail: string,
          parentFirstName: string,
          parentLastName: string,
          parentPassword: string,
          parentPhone?: string,
          parentGender?: string,
          parentAddress?: string
        ): Promise<{ success: boolean; parentId?: string; error?: string }> => {
          try {
            const normalizedEmail = parentEmail.toLowerCase().trim();
            const sessionOptions = session ? { session } : {};
            
            // Check if parent exists by email
            const existingParent = await this.userModel.findOne({
              email: normalizedEmail,
              role: 'PARENT'
            }).session(session || undefined).lean();

            if (existingParent) {
              // Parent exists, check if they belong to this school
              const parentDoc = await this.parentModel.findOne({
                userId: existingParent._id
              }).session(session || undefined).lean();

            if (parentDoc) {
              const belongToSchools = Array.isArray(parentDoc.belongToSchools) ? parentDoc.belongToSchools : [];
              const schoolIdObj = new Types.ObjectId(schoolId);
              const existingSchoolEntry = belongToSchools.find((entry: any) =>
                entry.schoolId && entry.schoolId.toString() === schoolIdObj.toString()
              );

              if (!existingSchoolEntry) {
                // Add school to parent's belongToSchools
                await this.parentModel.updateOne(
                  { userId: existingParent._id },
                  {
                    $push: {
                      belongToSchools: {
                        schoolId: schoolIdObj,
                        isActive: true
                      }
                    }
                  },
                  sessionOptions
                );
              }
            } else {
              // Parent exists but no parentDoc, create it
              await this.parentModel.create([{
                userId: existingParent._id,
                parentType: 'GUARDIAN',
                belongToSchools: [{ schoolId: new Types.ObjectId(schoolId), isActive: true }],
                isPrimaryContact: false,
                hasPickupPermission: false,
              }], sessionOptions);
            }

            return { success: true, parentId: existingParent._id.toString() };
          }

          // Parent doesn't exist, create new parent
          // Use password from Excel - schema will handle hashing if pre-save hook exists
          const parentUser = new this.userModel({
            firstName: parentFirstName.trim(),
            lastName: parentLastName.trim(),
            email: normalizedEmail,
            password: parentPassword.trim(), // Assign password directly - schema handles encryption
            role: 'PARENT',
            isActive: true,
            status: 'ACTIVE',
            schoolId: new Types.ObjectId(schoolId),
            createdBy: new Types.ObjectId(createdBy),
            ...(parentPhone ? { phone: parentPhone.trim() } : {}),
            ...(parentGender ? { gender: parentGender.trim() } : {}),
            ...(parentAddress ? { address: parentAddress.trim() } : {}),
          });

            const savedParent = await parentUser.save(sessionOptions);

            // Create parent document
            await this.parentModel.create([{
              userId: savedParent._id,
              parentType: 'GUARDIAN',
              belongToSchools: [{ schoolId: new Types.ObjectId(schoolId), isActive: true }],
              isPrimaryContact: false,
              hasPickupPermission: false,
            }], sessionOptions);

            // Send welcome email to parent (outside transaction to avoid blocking)
            // Use the password from Excel for the email
            this.emailService.sendWelcomeEmail(
              savedParent.email,
              savedParent.firstName,
              savedParent.lastName,
              savedParent.role,
              parentPassword.trim(), // Use password from Excel
            ).catch((emailError) => {
              console.error(`❌ Failed to send welcome email to ${savedParent.email}:`, emailError);
            });

            return { success: true, parentId: savedParent._id.toString() };
          } catch (error: any) {
            console.error('Error in findOrCreateParent:', error);
            return {
              success: false,
              error: error.message || 'Failed to create parent'
            };
          }
        };

        // Collect studentIds and emails for de-dup check
        const incomingStudentIds = new Set<string>();
        const incomingEmails = new Set<string>();
        for (const r of rows) {
          const sid = String(r['Student ID'] || '').trim();
          const email = String(r['Email'] || '').trim().toLowerCase();
          if (sid) incomingStudentIds.add(sid);
          if (email) incomingEmails.add(email);
        }

        const existing = await this.userModel.find({
          schoolId,
          role: 'STUDENT',
          $or: [
            { studentId: { $in: Array.from(incomingStudentIds) } },
            { email: { $in: Array.from(incomingEmails) } }
          ]
        }).select('email studentId').session(session || undefined).lean();

        const existingSidSet = new Set(existing.map((e: any) => String(e.studentId || '')));
        const existingEmailSet = new Set(existing.map((e: any) => String(e.email || '').toLowerCase()));

        const docsToInsert: any[] = [];
        const rowErrors: Array<{ row: number; errors: string[] }> = [];
        const successfulRows: any[] = [];
        let skippedCount = 0;

        // Track emails and student IDs within the current batch to detect duplicates
        const batchEmailSet = new Set<string>();
        const batchStudentIdSet = new Set<string>();

        let rowIndex = 2; // Start from row 2 (row 1 is header)
        for (const r of rows) {
        const rowErrorsList: string[] = [];
        
        try {
          // Map from export columns
          const studentId = String(r['Student ID'] || '').trim();
          const firstName = String(r['First Name'] || '').trim();
          const lastName = String(r['Last Name'] || '').trim();
          const email = String(r['Email'] || '').trim().toLowerCase();
          const klass = String(r['Class'] || '').trim();
          const section = String(r['Section'] || '').trim();
          const gender = String(r['Gender'] || '').trim();
          const dob = r['Date of Birth'];
          const address = String(r['Address'] || '').trim();
          const enrollDate = r['Enrollment Date'];
          const expectedGraduation = r['Expected Graduation'];
          const bloodGroup = String(r['Blood Group'] || '').trim();
          const medicalConditions = toArray(r['Medical Conditions']);
          const allergies = toArray(r['Allergies']);
          const nationality = String(r['Nationality'] || '').trim();
          const religion = String(r['Religion'] || '').trim();
          const transportMode = String(r['Transport Mode'] || '').trim();
          const busRoute = String(r['Bus Route'] || '').trim();
          const clubs = toArray(r['Clubs']);
          const lunch = String(r['Lunch Preference'] || '').trim();
          const iipFlag = toBool(r['IIP Flag']);
          const honorRolls = toBool(r['Honor Rolls']);
          const athletics = toBool(r['Athletics']);
          const profilePicture = String(r['Profile Photo URL'] || '').trim();
          const ecFirstName = String(r['Emergency Contact First Name'] || '').trim();
          const ecLastName = String(r['Emergency Contact Last Name'] || '').trim();
          const ecPhone = String(r['Emergency Contact Phone'] || '').trim();
          const ecRelationship = String(r['Emergency Contact Relationship'] || '').trim();

          // Parent information columns
          const parentEmail = String(r['Parent Email'] || '').trim().toLowerCase();
          const parentFirstName = String(r['Parent First Name'] || '').trim();
          const parentLastName = String(r['Parent Last Name'] || '').trim();
          const parentPassword = String(r['Parent Password'] || r['parentPassword'] || r['ParentPassword'] || '').trim();
          const parentPhone = String(r['Parent Phone'] || '').trim();
          const parentGender = String(r['Parent Gender'] || '').trim();
          const parentAddress = String(r['Parent Address'] || '').trim();
          
          // Student Password column
          const studentPassword = String(r['Student Password'] || r['studentPassword'] || r['StudentPassword'] || '').trim();

          // Required fields validation
          const missing: string[] = [];
          if (!firstName) missing.push('First Name');
          if (!lastName) missing.push('Last Name');
          if (!email) missing.push('Email');
          if (!klass) missing.push('Class');
          if (!section) missing.push('Section');
          if (!gender) missing.push('Gender');
          if (!dob) missing.push('Date of Birth');
          if (!address) missing.push('Address');
          if (!enrollDate) missing.push('Enrollment Date');
          if (!expectedGraduation) missing.push('Expected Graduation');

          // Parent information validation - at least email and name required
          const missingParent: string[] = [];
          if (!parentEmail && (parentFirstName || parentLastName)) {
            missingParent.push('Parent Email is required when Parent Name is provided');
          }
          if (parentEmail && !parentFirstName && !parentLastName) {
            missingParent.push('Parent First Name or Last Name is required when Parent Email is provided');
          }

          if (missing.length > 0) {
            skippedCount++;
            rowErrorsList.push(`Missing required fields: ${missing.join(', ')}`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          if (missingParent.length > 0) {
            skippedCount++;
            rowErrorsList.push(`Parent information conflict: ${missingParent.join(', ')}`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // If parent email is provided, require both first and last name
          if (parentEmail && (!parentFirstName || !parentLastName)) {
            skippedCount++;
            rowErrorsList.push(`Parent information incomplete: Both Parent First Name and Last Name are required when Parent Email is provided`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Check for duplicate student ID in database
          if (studentId && existingSidSet.has(studentId)) {
            skippedCount++;
            rowErrorsList.push(`Student ID "${studentId}" already exists in the system`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Check for duplicate student ID within the same batch
          if (studentId && batchStudentIdSet.has(studentId)) {
            skippedCount++;
            rowErrorsList.push(`Student ID "${studentId}" appears multiple times in this file`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Check if email already exists in database
          if (email && existingEmailSet.has(email)) {
            skippedCount++;
            rowErrorsList.push(`Email "${email}" already exists in the system`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Check for duplicate email within the same batch
          if (email && batchEmailSet.has(email)) {
            skippedCount++;
            rowErrorsList.push(`Email "${email}" appears multiple times in this file`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Handle parent - find or create
          let parentIds: string[] = [];
          if (parentEmail && parentFirstName && parentLastName) {
            // Validate parent password if provided
            if (!parentPassword || parentPassword.length < 8) {
              skippedCount++;
              rowErrorsList.push('Parent Password is required and must be at least 8 characters');
              rowErrors.push({ row: rowIndex, errors: rowErrorsList });
              rowIndex++;
              continue;
            }
            
            const parentResult = await findOrCreateParent(
              parentEmail,
              parentFirstName,
              parentLastName,
              parentPassword, // Pass password from Excel
              parentPhone || undefined,
              parentGender || undefined,
              parentAddress || undefined
            );

            if (!parentResult.success || !parentResult.parentId) {
              skippedCount++;
              rowErrorsList.push(`Failed to create/link parent: ${parentResult.error || 'Unknown error'}`);
              rowErrors.push({ row: rowIndex, errors: rowErrorsList });
              rowIndex++;
              continue;
            }

            parentIds = [parentResult.parentId];
          }

          // Parse dates using improved parser
          const parsedDob = toDate(dob);
          if (dob && !parsedDob) {
            skippedCount++;
            rowErrorsList.push(`Invalid Date of Birth format: "${dob}". Please use format MM/DD/YYYY or YYYY-MM-DD`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          const parsedEnrollDate = toDate(enrollDate);
          if (enrollDate && !parsedEnrollDate) {
            skippedCount++;
            rowErrorsList.push(`Invalid Enrollment Date format: "${enrollDate}". Please use format MM/DD/YYYY or YYYY-MM-DD`);
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Validate student password
          if (!studentPassword || studentPassword.length < 8) {
            skippedCount++;
            rowErrorsList.push('Student Password is required and must be at least 8 characters');
            rowErrors.push({ row: rowIndex, errors: rowErrorsList });
            rowIndex++;
            continue;
          }

          // Build doc - use password from Excel directly (schema handles encryption)
          const studentDoc = {
            email,
            password: studentPassword.trim(), // Assign password directly - schema handles encryption
            firstName,
            lastName,
            role: 'STUDENT',
            status: 'ACTIVE',
            schoolId: new Types.ObjectId(schoolId),
            studentId: studentId || undefined,
            class: klass,
            section,
            gender,
            dob: parsedDob,
            address,
            enrollDate: parsedEnrollDate,
            expectedGraduation: toYearString(expectedGraduation),
            bloodGroup: bloodGroup || undefined,
            medicalConditions,
            allergies,
            nationality: nationality || undefined,
            religion: religion || undefined,
            transportMode: transportMode || undefined,
            busRoute: busRoute || undefined,
            clubs,
            lunch: lunch || undefined,
            iipFlag,
            honorRolls,
            athletics,
            profilePicture: profilePicture || undefined,
            emergencyContact: {
              firstName: ecFirstName || undefined,
              lastName: ecLastName || undefined,
              phone: ecPhone || undefined,
              relationship: ecRelationship || undefined,
            },
            parentIds: parentIds.map(id => new Types.ObjectId(id)),
            createdBy: new Types.ObjectId(createdBy),
          };

          docsToInsert.push(studentDoc);
          successfulRows.push({ row: rowIndex, studentData: { firstName, lastName, email } });
          
          // Track this email and studentId in the batch to detect duplicates in subsequent rows
          if (email) batchEmailSet.add(email);
          if (studentId) batchStudentIdSet.add(studentId);
          
        } catch (rowErr: any) {
          skippedCount++;
          rowErrorsList.push(`Unexpected error: ${rowErr.message || String(rowErr)}`);
          rowErrors.push({ row: rowIndex, errors: rowErrorsList });
        }
        
        rowIndex++;
      }

        let insertedCount = 0;
        let insertedStudents: any[] = [];

        if (docsToInsert.length > 0) {
          try {
            const insertOptions: any = { ordered: false };
            if (session) {
              insertOptions.session = session;
            }
            const result = await this.userModel.insertMany(docsToInsert, insertOptions);
          insertedCount = Array.isArray(result) ? result.length : 0;
          insertedStudents = Array.isArray(result) ? result : [];

          // Link students to parents and parents to students using utility function
          // Also send welcome emails
          for (let i = 0; i < insertedStudents.length; i++) {
            const student = insertedStudents[i];
            const studentDoc = docsToInsert[i];

            if (studentDoc.parentIds && studentDoc.parentIds.length > 0) {
              try {
                // Link each parent individually to pass relationship info (isPrimaryContact, hasPickupPermission)
                for (const parentId of studentDoc.parentIds) {
                  try {
                    const parentIdStr = parentId instanceof Types.ObjectId ? parentId.toString() : parentId.toString();
                    
                    // Fetch parent's Parent model to get isPrimaryContact and hasPickupPermission
                    const parentDoc = await this.parentModel.findOne({ userId: parentId }).session(session || undefined).lean();
                    
                    // Get relationship info from parent document (defaults to false if not set)
                    const isPrimaryContact = parentDoc?.isPrimaryContact ?? false;
                    const hasPickupPermission = parentDoc?.hasPickupPermission ?? false;
                    
                    await linkStudentToParent(
                      student._id.toString(),
                      parentIdStr,
                      {
                        userModel: this.userModel,
                        parentProfileModel: this.parentProfileModel,
                        isPrimaryContact: isPrimaryContact,
                        hasPickupPermission: hasPickupPermission,
                        relationship: 'Parent', // Default relationship
                        session: session || undefined
                      }
                    );
                    console.log(`✅ Linked student ${student._id} to parent ${parentIdStr} in bulk upload (isPrimaryContact: ${isPrimaryContact}, hasPickupPermission: ${hasPickupPermission})`);
                  } catch (error) {
                    console.error(`❌ Error linking student ${student._id} to parent ${parentId}:`, error);
                    // Continue with other parents even if one fails
                  }
                }
                console.log(`✅ Completed linking student ${student._id} to ${studentDoc.parentIds.length} parent(s) in bulk upload`);
              } catch (error) {
                console.error(`❌ Error linking student ${student._id} to parents:`, error);
                // Continue even if linking fails - parentIds are already set in student doc
              }
            }

            // Send welcome email to student (outside transaction to avoid blocking)
            const tempPassword = 'Student@12345';
            this.emailService.sendWelcomeEmail(
              student.email,
              student.firstName,
              student.lastName,
              student.role,
              tempPassword,
            ).catch((emailError) => {
              console.error(`❌ Failed to send welcome email to ${student.email}:`, emailError);
            });
          }
        } catch (insertError: any) {
          // Handle partial inserts - extract errors for failed records
          if (insertError.writeErrors && Array.isArray(insertError.writeErrors)) {
            insertError.writeErrors.forEach((writeErr: any, idx: number) => {
              const failedRow = successfulRows[writeErr.index];
              if (failedRow) {
                rowErrors.push({
                  row: failedRow.row,
                  errors: [`Failed to insert: ${writeErr.errmsg || writeErr.err?.message || 'Unknown error'}`]
                });
                skippedCount++;
                insertedCount--;
              }
            });
          }
        }
      }

        // Activity log
        const createOptions = session ? { session } : {};
        await this.activityModel.create([{
          title: 'Students Bulk Upload',
          subtitle: `Bulk uploaded ${insertedCount} students, skipped ${skippedCount} records`,
          performBy: role,
          actorId: new Types.ObjectId(createdBy),
          adminId: new Types.ObjectId(createdBy)
        }], createOptions);

        // Format errors for response
        const formattedErrors = rowErrors.length > 0 
          ? rowErrors.map(err => `Row ${err.row}: ${err.errors.join('; ')}`)
          : null;

        return {
          message: `Successfully uploaded ${insertedCount} student(s). ${skippedCount > 0 ? `Skipped ${skippedCount} record(s) with errors.` : ''}`,
          insertedCount,
          skippedCount,
          errors: formattedErrors,
          hasConflicts: skippedCount > 0
        };
      }, this.connection);
    } catch (error: any) {
      console.error('Error in bulk upload students:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Student bulk upload failed: ${error.message || 'Unknown error'}`);
    } finally {
      // Clean up uploaded file
      cleanupFile();
    }
  }

  // ==================== TEACHERS ====================

  async createTeacher(schoolId: string, createdBy: string, teacherData: CreateTeacherDto | any, role: string, files?: UploadedFileType[]) {
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      const userExists = await this.userModel.findOne({
        email: teacherData.email
        // role: UserRole.TEACHER
      }).lean();

      if (userExists) {
        await session.abortTransaction();
        await session.endSession();
        return { success: false, statusCode: HttpStatus.CONFLICT, message: `Email "${teacherData.email}" already exists in the system`, data: null };
      }

      // Check if employeeId is provided and validate global uniqueness
      if (teacherData.employeeId) {
        const existingEmployeeId = await this.teacherModel.findOne({ 
          employeeId: teacherData.employeeId.trim() 
        }).lean();
        
        if (existingEmployeeId) {
          await session.abortTransaction();
          await session.endSession();
          return { 
            success: false, 
            statusCode: HttpStatus.CONFLICT, 
            message: `Employee ID "${teacherData.employeeId}" already exists in the system. Employee IDs must be unique across all users.`, 
            data: null 
          };
        }
      }

      const newPassword = teacherData.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      // Handle profile picture file upload
      let profilePictureUrl = '';
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.fieldname === 'profilePicture' || file.fieldname === 'profilePhoto') {
            if (!file.mimetype || !file.mimetype.startsWith('image/')) {
              console.warn(`⚠️ Profile picture should be an image. Skipping file: ${file.originalname}`);
              continue;
            }

            try {
              const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
              const schoolName = school?.name || null;
              const schoolIdStr = school?._id?.toString() || schoolId;

              const fileExtension = file.originalname.split('.').pop();
              const fileName = `teacher-profile-${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              const fileContent = file.buffer || (file.path ? fs.readFileSync(file.path) : null);

              if (fileContent) {
                const s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'teachers', 'profile-images', fileName);
                profilePictureUrl = await uploadBufferToS3(
                  this.awsService.getS3Client(),
                  this.awsService.getBucketName(),
                  s3Key,
                  fileContent,
                  file.mimetype
                );
                console.log(`Profile picture uploaded to ${s3Key}: ${profilePictureUrl}`);

                // Clean up local file if it was saved to disk by multer
                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
                break; // Only process first profile picture
              }
            } catch (uploadError) {
              console.error(`Error uploading profile picture:`, uploadError);
            }
          }
        }
      }

      // Create user account for teacher with only basic fields
      const userDoc: any = {
        firstName: teacherData.firstName,
        lastName: teacherData.lastName,
        email: teacherData.email.toLowerCase(),
        password: newPassword,
        status: UserStatus.ACTIVE,
        gender: teacherData.gender,
        role: UserRole.TEACHER,
        address: teacherData.address,
        phone: teacherData.phone,
        isActive: true,
        dateOfBirth: teacherData.dateOfBirth,
        createdBy: new Types.ObjectId(createdBy),
        schoolId: new Types.ObjectId(schoolId),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      };
      if (profilePictureUrl) {
        userDoc.profilePicture = profilePictureUrl;
      } else if (teacherData.profilePicture !== undefined) {
        userDoc.profilePicture = teacherData.profilePicture;
      }

      const teacherUser = new this.userModel(userDoc);
      const savedTeacher = await teacherUser.save({ session });

      // Create TeacherProfile with extended fields
      const teacherProfileData: any = {
        userId: savedTeacher._id,
        schoolId: new Types.ObjectId(schoolId),
        employeeId: teacherData.employeeId,
        departmentIds: (teacherData.departmentIds || []).map((id: string) => new Types.ObjectId(id)),
      };

      if (teacherData.dateOfJoining !== undefined) teacherProfileData.dateOfJoining = teacherData.dateOfJoining;
      if (teacherData.designation !== undefined) teacherProfileData.designation = teacherData.designation;
      if (teacherData.qualifications !== undefined) teacherProfileData.qualifications = teacherData.qualifications;
      if (teacherData.certifications !== undefined) teacherProfileData.certifications = teacherData.certifications;
      if (teacherData.totalExperience !== undefined) teacherProfileData.totalExperience = teacherData.totalExperience;
      if (teacherData.previousExperience !== undefined) teacherProfileData.previousExperience = teacherData.previousExperience;
      if (teacherData.nationality !== undefined) teacherProfileData.nationality = teacherData.nationality;

      console.log("teacherProfileData: ", teacherProfileData);

      await this.teacherModel.create([teacherProfileData], { session });

      // Log activity
      await this.activityModel.create({
        title: 'Teacher Created',
        subtitle: `Created teacher: ${teacherData.firstName} ${teacherData.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy),
        action: 'CREATE_TEACHER',
        entityType: UserRole.TEACHER,
        entityId: savedTeacher._id,
        metadata: { email: savedTeacher.email }
      });

      await session.commitTransaction();
      await session.endSession();

      // Send welcome email
      try {
        await this.emailService.sendWelcomeEmail(
          savedTeacher.email,
          savedTeacher.firstName,
          savedTeacher.lastName,
          savedTeacher.role,
          newPassword,
        );
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${savedTeacher.email}:`, emailError);
        // Don't fail the creation if email fails
      }

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Teacher created successfully',
        data: { _id: savedTeacher._id }
      };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      console.error('Error in createTeacher:', error);
      if (error instanceof ConflictException) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: error.message,
          data: null
        };
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${validationErrors.join(', ')}`,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to create teacher',
        data: null,
      };
    }
  }

  async getTeachers(schoolId: string | undefined, query: any, role?: string) {
    try {
      const page = Math.max(Number(query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      // Base match filter for User collection
      const matchFilter: any = { role: UserRole.TEACHER, isActive: true };

      if (schoolId) {
        matchFilter.schoolId = new Types.ObjectId(schoolId);
      }

      // If courseId filter is provided, get teacherIds from CourseAssignment
      let teacherIdsFilter: Types.ObjectId[] | null = null;
      if (query.courseId) {
        const courseAssignments = await this.courseAssignmentModel
          .find({ courseId: new Types.ObjectId(query.courseId) })
          .select('teacherId')
          .lean();
        teacherIdsFilter = courseAssignments.map((ca: any) => new Types.ObjectId(ca.teacherId));
        if (teacherIdsFilter.length === 0) {
          // No teachers assigned to this course
          return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'Teachers fetched successfully',
            data: {
              teachers: [],
              pagination: getPaginationMeta(page, limit, 0),
            },
          };
        }
      }

      // Build aggregation pipeline starting from User collection
      const pipeline: any[] = [
        { $match: matchFilter },
      ];

      // Filter by courseId if provided
      if (teacherIdsFilter && teacherIdsFilter.length > 0) {
        pipeline.push({
          $match: { _id: { $in: teacherIdsFilter } }
        });
      }

      // Lookup Teacher collection
      pipeline.push({
        $lookup: {
          from: 'teachers',
          localField: '_id',
          foreignField: 'userId',
          as: 'teacher'
        }
      });
      pipeline.push({ $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } });

      // Filter by eligible_for_sports if query parameter is provided
      if (query.eligibleForSports === 'true' || query.eligibleForSports === true) {
        pipeline.push({
          $match: {
            'teacher.eligible_for_sports': true
          }
        });
      }

      // Add search filter (search in User fields and Teacher employeeId)
      if (query.search && query.search.trim()) {
        const regex = { $regex: query.search.trim(), $options: 'i' };
        pipeline.push({
          $match: {
            $or: [
              { firstName: regex },
              { lastName: regex },
              { email: regex },
              { 'teacher.employeeId': regex },
            ]
          }
        });
      }

      // Count total
      const countPipeline = [...pipeline, { $count: 'total' }];
      const totalCountAgg = await this.userModel.aggregate(countPipeline).exec();
      const totalCount = totalCountAgg[0]?.total || 0;

      // Get paginated results
      pipeline.push(
        { $sort: { firstName: 1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: 'schools',
            localField: 'schoolId',
            foreignField: '_id',
            as: 'school'
          }
        },
        { $unwind: { path: '$school', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'departments',
            localField: 'teacher.departmentIds',
            foreignField: '_id',
            as: 'departments'
          }
        },
        {
          $project: {
            _id: 1,
            firstName: 1,
            lastName: 1,
            email: 1,
            gender: 1,
            profilePicture: 1,
            schoolId: 1,
            createdAt: 1,
            'school.name': 1,
            employeeId: '$teacher.employeeId',
            eligible_for_sports: { $ifNull: ['$teacher.eligible_for_sports', false] },
            eligible_for_iep: { $ifNull: ['$teacher.eligible_for_iep', false] },
            eligible_for_counselor: { $ifNull: ['$teacher.eligible_for_counselor', false] }
          }
        }
      );

      const teachers = await this.userModel.aggregate(pipeline).sort({ createdAt: -1 }).exec();

      // Format response
      const enrichedTeachers = teachers.map((teacher: any) => ({
        _id: teacher._id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        email: teacher.email,
        gender: teacher.gender,
        profilePicture: teacher.profilePicture,
        schoolId: teacher.schoolId ? { _id: teacher.schoolId, name: teacher.school?.name || '' } : null,
        isActive: teacher.isActive,
        createdAt: teacher.createdAt,
        employeeId: teacher.employeeId || '',
        eligible_for_sports: teacher.eligible_for_sports || false,
        eligible_for_iep: teacher.eligible_for_iep || false,
        eligible_for_counselor: teacher.eligible_for_counselor || false
      }));

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Teachers fetched successfully',
        data: {
          teachers: enrichedTeachers,
          pagination: getPaginationMeta(page, limit, totalCount),
        },
      };
    } catch (error) {
      console.error('Error in getTeachers:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch teachers',
        data: null,
      };
    }
  }

  /**
   * Update Teacher Eligibility Fields
   */
  async updateTeacherEligibility(
    teacherId: string,
    schoolId: string | null,
    eligibilityData: { eligible_for_sports?: boolean; eligible_for_iep?: boolean; eligible_for_counselor?: boolean },
    role?: string
  ): Promise<any> {
    try {
      const teacherIdObj = new Types.ObjectId(teacherId);

      // For SUPER_ADMIN, schoolId is optional - find teacher by userId only
      // For ADMIN, schoolId is required - verify teacher belongs to the school
      let teacher;
      if (role === 'SUPER_ADMIN' && !schoolId) {
        // SUPER_ADMIN can update any teacher without school restriction
        teacher = await this.teacherModel.findOne({
          userId: teacherIdObj
        }).lean();
      } else if (schoolId) {
        const schoolIdObj = new Types.ObjectId(schoolId);
        teacher = await this.teacherModel.findOne({
          userId: teacherIdObj,
          schoolId: schoolIdObj
        }).lean();
      } else {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null
        };
      }

      if (!teacher) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Teacher not found',
          data: null
        };
      }

      // Update eligibility fields
      const updateData: any = {};
      if (eligibilityData.eligible_for_sports !== undefined) {
        updateData.eligible_for_sports = eligibilityData.eligible_for_sports;
      }
      if (eligibilityData.eligible_for_iep !== undefined) {
        updateData.eligible_for_iep = eligibilityData.eligible_for_iep;
      }
      if (eligibilityData.eligible_for_counselor !== undefined) {
        updateData.eligible_for_counselor = eligibilityData.eligible_for_counselor;
      }

      // Update query based on role
      const updateQuery: any = { userId: teacherIdObj };
      if (role !== 'SUPER_ADMIN' && schoolId) {
        updateQuery.schoolId = new Types.ObjectId(schoolId);
      } else if (role === 'SUPER_ADMIN' && schoolId) {
        // If SUPER_ADMIN provides schoolId, use it
        updateQuery.schoolId = new Types.ObjectId(schoolId);
      }

      await this.teacherModel.findOneAndUpdate(
        updateQuery,
        { $set: updateData },
        { new: true }
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Teacher eligibility updated successfully',
        data: updateData
      };
    } catch (error) {
      console.error('Error updating teacher eligibility:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to update teacher eligibility',
        data: null
      };
    }
  }

  async getTeacherById(schoolId: string, id: string) {
    try {
      const teacherUser = await this.userModel
        .findOne({ _id: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId), role: UserRole.TEACHER, isActive: true })
        .select('_id firstName lastName email gender profilePicture schoolId createdBy isActive address phone')
        .populate('schoolId', 'name code type address phone email')
        .populate('createdBy', 'firstName lastName email role')
        .lean();

      console.log("teacherUser: ", teacherUser);

      if (!teacherUser) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Teacher not found', data: null };
      }

      // Get teacher profile
      const teacherProfile = await this.teacherModel
        .findOne({ userId: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId) })
        .populate('departmentIds', 'departmentName')
        .lean();

      // Get course assignments for this teacher with course name/code
      const courseAssignments = await this.courseAssignmentModel.aggregate([
        {
          $match: {
            teacherId: new Types.ObjectId(id),
            schoolId: new Types.ObjectId(schoolId)
          }
        },
        {
          $lookup: {
            from: 'courses',
            localField: 'courseId',
            foreignField: '_id',
            as: 'course'
          }
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            _id: 1,
            courseId: '$course._id',
            courseName: '$course.courseName',
            courseCode: '$course.courseCode',
            grades: 1
          }
        },
        { $sort: { courseName: 1 } }
      ]).exec();

      console.log("teacherUser.address: ", teacherUser.address);

      const teacher: any = {
        _id: teacherUser._id,
        firstName: teacherUser.firstName,
        lastName: teacherUser.lastName,
        address: teacherUser.address,
        phone: teacherUser.phone,
        email: teacherUser.email,
        gender: teacherUser.gender,
        profilePicture: teacherUser.profilePicture,
        isActive: teacherUser.isActive,
        schoolId: teacherUser.schoolId,
        createdBy: teacherUser.createdBy,
        courseAssignments,
        ...(teacherProfile ? {
          employeeId: teacherProfile.employeeId,
          dateOfBirth: teacherProfile.dateOfBirth,
          // address: teacherProfile.address,
          // phone: teacherProfile.phone,
          dateOfJoining: teacherProfile.dateOfJoining,
          designation: teacherProfile.designation,
          departmentIds: teacherProfile.departmentIds || [],
          qualifications: teacherProfile.qualifications || [],
          certifications: teacherProfile.certifications || [],
          totalExperience: teacherProfile.totalExperience || 0,
          nationality: teacherProfile.nationality || '',
        } : {}),
      };

      console.log("teacher: ", teacher);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Teacher fetched successfully',
        data: { teacher },
      };
    } catch (error) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: error?.message || 'Failed to fetch teacher', data: null };
    }
  }

  async getAssignedCourses(schoolId: string, teacherUserId: string) {
    try {
      // Validate teacher exists
      const teacherExists = await this.userModel.exists({
        _id: new Types.ObjectId(teacherUserId),
        schoolId: new Types.ObjectId(schoolId),
        role: 'TEACHER',
        isActive: true
      });

      if (!teacherExists) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Teacher not found',
          data: null
        };
      }

      // Aggregate assignments -> join course -> project all fields including timeSlots
      console.log('========================================');
      console.log('🟢 getAssignedCourses CALLED');
      console.log('🟢 schoolId:', schoolId);
      console.log('🟢 teacherUserId:', teacherUserId);
      
      // First, let's check what's actually in the database
      const rawAssignments = await this.courseAssignmentModel.find({
        teacherId: new Types.ObjectId(teacherUserId),
        schoolId: new Types.ObjectId(schoolId)
      }).lean();
      
      console.log('🟢 Raw assignments from database (before aggregation):');
      rawAssignments.forEach((assignment: any, idx: number) => {
        console.log(`🟢   Raw Assignment ${idx}:`, {
          _id: assignment._id,
          courseId: assignment.courseId,
          grades: assignment.grades?.map((g: any) => ({
            level: g.level,
            section: g.section,
            roomNumber: g.roomNumber,
            roomNumberType: typeof g.roomNumber,
            hasRoomNumber: 'roomNumber' in g,
            roomNumberIsUndefined: g.roomNumber === undefined,
            roomNumberIsNull: g.roomNumber === null,
            allFields: Object.keys(g)
          }))
        });
      });
      
      const assignments = await this.courseAssignmentModel.aggregate([
        {
          $match: {
            teacherId: new Types.ObjectId(teacherUserId),
            schoolId: new Types.ObjectId(schoolId)
          }
        },
        {
          $lookup: {
            from: 'courses',
            localField: 'courseId',
            foreignField: '_id',
            as: 'course'
          }
        },
        { $unwind: { path: '$course', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            _id: 1,
            courseId: '$course._id',
            courseName: '$course.courseName',
            courseCode: '$course.courseCode',
            grades: 1  // Now includes timeSlots and roomNumber
          }
        },
        { $sort: { courseName: 1 } }
      ]).exec();

      console.log('🟢 Aggregated assignments result:');
      assignments.forEach((assignment: any, idx: number) => {
        console.log(`🟢   Aggregated Assignment ${idx}:`, {
          courseId: assignment.courseId,
          courseName: assignment.courseName,
          grades: assignment.grades?.map((g: any) => ({
            level: g.level,
            section: g.section,
            roomNumber: g.roomNumber,
            roomNumberType: typeof g.roomNumber,
            hasRoomNumber: 'roomNumber' in g,
            roomNumberIsUndefined: g.roomNumber === undefined,
            roomNumberIsNull: g.roomNumber === null,
            allFields: Object.keys(g)
          }))
        });
      });
      
      console.log('🟢 Full assignments array:', JSON.stringify(assignments, null, 2));
      console.log('========================================');

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Assigned courses fetched successfully',
        data: { assignments }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch assigned courses',
        data: null
      };
    }
  }

  async getCourseAssignments(schoolId: string, teacherUserId: string) {
    try {
      // 1) Find teacher profile to get departmentIds
      const teacher = await this.teacherModel
        .findOne({ userId: new Types.ObjectId(teacherUserId), schoolId: new Types.ObjectId(schoolId) })
        .select('departmentIds')
        .lean();

      if (!teacher) {
        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Courses fetched successfully',
          data: { courses: [] }
        };
      }

      const deptIds = Array.isArray((teacher as any).departmentIds) ? (teacher as any).departmentIds : [];
      if (deptIds.length === 0) {
        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Courses fetched successfully',
          data: { courses: [] }
        };
      }

      // 2) Fetch courses where any departmentIds intersects
      // Use aggregation to keep it lean and fast
      const courses = await this.courseModel.aggregate([
        {
          $match: {
            isActive: true,
            schoolId: new Types.ObjectId(schoolId),
            departmentIds: { $in: deptIds }
          }
        },
        { $sort: { courseName: 1 } },
        {
          $project: {
            _id: 1,
            courseName: 1,
            courseCode: 1
          }
        }
      ]).exec();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Courses fetched successfully',
        data: { courses }
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch courses for assignment',
        data: null
      };
    }
  }

  // Helper method to add minutes to a time string (HH:MM)
  private addMinutesToTime(time: string, minutesToAdd: number): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + minutesToAdd;
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  }

  async assignCoursesToTeacher(schoolId: string, createdBy: string, payload: any) {
    try {
      console.log('========================================');
      console.log('🔵 assignCoursesToTeacher CALLED');
      console.log('🔵 Full payload received:', JSON.stringify(payload, null, 2));
      console.log('🔵 schoolId:', schoolId);
      console.log('🔵 createdBy:', createdBy);
      
      const teacherUserId = payload.userId;
      const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];
      
      console.log('🔵 assignments array:', JSON.stringify(assignments, null, 2));
      
      // Log each assignment's grades with room numbers
      assignments.forEach((assignment: any, idx: number) => {
        console.log(`🔵 Assignment ${idx} - courseId: ${assignment.courseId}`);
        if (Array.isArray(assignment.grades)) {
          assignment.grades.forEach((grade: any, gradeIdx: number) => {
            console.log(`🔵   Grade ${gradeIdx}:`, {
              level: grade.level,
              section: grade.section,
              roomNumber: grade.roomNumber,
              roomNumberType: typeof grade.roomNumber,
              roomNumberIsUndefined: grade.roomNumber === undefined,
              roomNumberIsNull: grade.roomNumber === null,
              hasRoomNumber: 'roomNumber' in grade,
              allFields: Object.keys(grade)
            });
          });
        }
      });

      // Validate teacher exists
      const teacherUser = await this.userModel.findOne({
        _id: new Types.ObjectId(teacherUserId),
        schoolId: new Types.ObjectId(schoolId),
        role: 'TEACHER',
        isActive: true
      }).select('_id').lean();

      if (!teacherUser) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Teacher not found in this school',
          data: null
        };
      }

      if (assignments.length === 0) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'At least one course assignment is required',
          data: null
        };
      }

      // Validate courses exist
      const uniqueCourseIds = Array.from(
        new Set(assignments.map((a: any) => String(a.courseId)).filter(Boolean))
      );

      if (uniqueCourseIds.length === 0) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'No valid course IDs provided',
          data: null
        };
      }

      const courseDocs = await this.courseModel
        .find({
          _id: { $in: uniqueCourseIds.map((id: string) => new Types.ObjectId(id)) },
          schoolId: new Types.ObjectId(schoolId),
          isActive: true
        })
        .select('_id courseName')
        .lean();

      const validSet = new Set(courseDocs.map((c: any) => String(c._id)));
      const invalidCourseIds = uniqueCourseIds.filter((id: string) => !validSet.has(id));

      if (invalidCourseIds.length > 0) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Invalid or inactive course IDs: ${invalidCourseIds.join(', ')}`,
          data: { invalidCourseIds }
        };
      }

      const courseNameMap = new Map(
        courseDocs.map((c: any) => [String(c._id), c.courseName])
      );

      // ========== TIME SLOT VALIDATIONS ==========

      // 1. Validate time format and logical order
      for (const assignment of assignments) {
        const courseName = courseNameMap.get(String(assignment.courseId));
        for (const grade of assignment.grades || []) {
          if (!grade.timeSlots || grade.timeSlots.length === 0) {
            return {
              success: false,
              statusCode: HttpStatus.BAD_REQUEST,
              message: `Time slots are required for course "${courseName}", Level ${grade.level}, Section ${grade.section}`,
              data: null
            };
          }

          for (const slot of grade.timeSlots) {
            const validation = validateTimeSlot(slot);
            if (!validation.valid) {
              return {
                success: false,
                statusCode: HttpStatus.BAD_REQUEST,
                message: `${validation.error} in course "${courseName}", Level ${grade.level}, Section ${grade.section}`,
                data: null
              };
            }
          }
        }
      }

      // 2. Check teacher schedule conflicts
      const teacherTimeSlots: Array<{
        day: string;
        startTime: string;
        endTime: string;
        courseId: string;
        courseName: string;
        level: number;
        section: string;
      }> = [];

      for (const assignment of assignments) {
        const courseName = courseNameMap.get(String(assignment.courseId));
        for (const grade of assignment.grades || []) {
          for (const slot of grade.timeSlots || []) {
            teacherTimeSlots.push({
              day: slot.day,
              startTime: slot.startTime,
              endTime: slot.endTime,
              courseId: String(assignment.courseId),
              courseName: courseName || 'Unknown',
              level: grade.level,
              section: grade.section
            });
          }
        }
      }

      // Check for overlaps in request body
      for (let i = 0; i < teacherTimeSlots.length; i++) {
        for (let j = i + 1; j < teacherTimeSlots.length; j++) {
          const slot1 = teacherTimeSlots[i];
          const slot2 = teacherTimeSlots[j];

          if (slot1.day === slot2.day) {
            if (timeSlotsOverlap(slot1.startTime, slot1.endTime, slot2.startTime, slot2.endTime)) {
              return {
                success: false,
                statusCode: HttpStatus.CONFLICT,
                message: `Teacher schedule conflict on ${slot1.day}: Time ${slot1.startTime}-${slot1.endTime} (${slot1.courseName} - Level ${slot1.level}${slot1.section}) overlaps with ${slot2.startTime}-${slot2.endTime} (${slot2.courseName} - Level ${slot2.level}${slot2.section}). A teacher cannot be in two places at once.`,
                data: {
                  conflict: {
                    day: slot1.day,
                    class1: {
                      time: `${slot1.startTime}-${slot1.endTime}`,
                      course: slot1.courseName,
                      class: `Level ${slot1.level}${slot1.section}`
                    },
                    class2: {
                      time: `${slot2.startTime}-${slot2.endTime}`,
                      course: slot2.courseName,
                      class: `Level ${slot2.level}${slot2.section}`
                    }
                  }
                }
              };
            }
          }
        }
      }

      // 2b. Check for overlapping classes (no break required, but classes cannot overlap)
      // Group teacher time slots by day
      const slotsByDay = new Map<string, typeof teacherTimeSlots>();
      for (const slot of teacherTimeSlots) {
        if (!slotsByDay.has(slot.day)) {
          slotsByDay.set(slot.day, []);
        }
        slotsByDay.get(slot.day)!.push(slot);
      }

      // For each day, sort by time and check for overlaps (allow back-to-back classes)
      for (const [day, slots] of slotsByDay) {
        // Sort by start time
        const sortedSlots = slots.sort((a, b) =>
          timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
        );

        // Check for overlapping classes (but allow back-to-back classes with no gap)
        for (let i = 0; i < sortedSlots.length - 1; i++) {
          const currentSlot = sortedSlots[i];
          const nextSlot = sortedSlots[i + 1];

          const currentEndMinutes = timeToMinutes(currentSlot.endTime);
          const nextStartMinutes = timeToMinutes(nextSlot.startTime);
          const gapMinutes = nextStartMinutes - currentEndMinutes;

          // Only error if classes overlap (next starts before current ends) - no break required
          if (gapMinutes < 0) {
            return {
              success: false,
              statusCode: HttpStatus.CONFLICT,
              message: `Time conflict on ${day}: Class ending at ${currentSlot.endTime} (${currentSlot.courseName} - Level ${currentSlot.level}${currentSlot.section}) overlaps with class starting at ${nextSlot.startTime} (${nextSlot.courseName} - Level ${nextSlot.level}${nextSlot.section}).`,
              data: {
                day: day,
                firstClass: {
                  endTime: currentSlot.endTime,
                  course: currentSlot.courseName,
                  class: `Level ${currentSlot.level}${currentSlot.section}`
                },
                secondClass: {
                  startTime: nextSlot.startTime,
                  course: nextSlot.courseName,
                  class: `Level ${nextSlot.level}${nextSlot.section}`
                }
              }
            };
          }
        }
      }

      // 3. Check section schedule conflicts
      for (const sectionSlot of teacherTimeSlots) {
        const conflictingAssignments = await this.courseAssignmentModel.find({
          schoolId: new Types.ObjectId(schoolId),
          'grades.level': sectionSlot.level,
          'grades.section': sectionSlot.section,
          teacherId: { $ne: new Types.ObjectId(teacherUserId) }
        }).populate('courseId', 'courseName').populate('teacherId', 'firstName lastName').lean();

        for (const conflicting of conflictingAssignments) {
          for (const grade of (conflicting as any).grades || []) {
            if (grade.level === sectionSlot.level && grade.section === sectionSlot.section) {
              for (const existingSlot of grade.timeSlots || []) {
                if (existingSlot.day === sectionSlot.day) {
                  if (timeSlotsOverlap(
                    existingSlot.startTime,
                    existingSlot.endTime,
                    sectionSlot.startTime,
                    sectionSlot.endTime
                  )) {
                    const conflictCourseName = (conflicting as any).courseId?.courseName || 'Unknown';
                    const conflictTeacher = (conflicting as any).teacherId;
                    const teacherName = conflictTeacher
                      ? `${conflictTeacher.firstName} ${conflictTeacher.lastName}`
                      : 'Unknown';

                    return {
                      success: false,
                      statusCode: HttpStatus.CONFLICT,
                      message: `Class Level ${sectionSlot.level}${sectionSlot.section} already has ${conflictCourseName} class by ${teacherName} on ${existingSlot.day} from ${existingSlot.startTime} to ${existingSlot.endTime}. Cannot assign ${sectionSlot.courseName} at ${sectionSlot.startTime}-${sectionSlot.endTime}.`,
                      data: {
                        existingClass: {
                          course: conflictCourseName,
                          teacher: teacherName,
                          class: `Level ${sectionSlot.level}${sectionSlot.section}`,
                          day: existingSlot.day,
                          time: `${existingSlot.startTime}-${existingSlot.endTime}`
                        }
                      }
                    };
                  }
                }
              }
            }
          }
        }
      }

      // Delete existing assignments
      await this.courseAssignmentModel.deleteMany({
        teacherId: new Types.ObjectId(teacherUserId),
        schoolId: new Types.ObjectId(schoolId),
      });

      // Insert new assignments
      console.log('🔵 Creating newAssignments array...');
      const newAssignments = assignments.map((item: any, itemIdx: number) => {
        console.log(`🔵 Processing assignment ${itemIdx} for courseId: ${item.courseId}`);
        const mappedGrades = (item.grades || []).map((g: any, gradeIdx: number) => {
          const roomNumberValue = g.roomNumber;
          const roomNumberProcessed = roomNumberValue ? String(roomNumberValue).trim() : undefined;
          
          console.log(`🔵   Grade ${gradeIdx} processing:`, {
            level: g.level,
            section: g.section,
            roomNumberOriginal: roomNumberValue,
            roomNumberProcessed: roomNumberProcessed,
            roomNumberType: typeof roomNumberValue,
            roomNumberIsUndefined: roomNumberValue === undefined,
            roomNumberIsNull: roomNumberValue === null,
            roomNumberIsEmptyString: roomNumberValue === '',
            hasRoomNumber: 'roomNumber' in g
          });
          
          const gradeObject: any = {
            level: Number(g.level),
            section: String(g.section).trim(),
            timeSlots: (g.timeSlots || []).map((ts: any) => ({
              day: String(ts.day).trim(),
              startTime: String(ts.startTime).trim(),
              endTime: String(ts.endTime).trim()
            }))
          };
          
          // Always include roomNumber if it exists (even if empty string)
          // MongoDB will save it as long as the field is present
          if (roomNumberProcessed !== undefined && roomNumberProcessed !== null) {
            gradeObject.roomNumber = String(roomNumberProcessed).trim();
          } else if (g.roomNumber !== undefined) {
            // If original value exists but was falsy, still save it
            gradeObject.roomNumber = String(g.roomNumber).trim();
          }
          
          console.log(`🔵   Final grade object for grade ${gradeIdx}:`, JSON.stringify(gradeObject, null, 2));
          
          return gradeObject;
        });
        
        console.log(`🔵   Mapped grades for assignment ${itemIdx}:`, JSON.stringify(mappedGrades, null, 2));
        
        return {
          courseId: new Types.ObjectId(item.courseId),
          teacherId: new Types.ObjectId(teacherUserId),
          schoolId: new Types.ObjectId(schoolId),
          grades: mappedGrades,
          createdBy: new Types.ObjectId(createdBy),
        };
      });

      console.log('🔵 Final newAssignments before insertMany:', JSON.stringify(newAssignments, null, 2));
      console.log('🔵 Checking roomNumber in each grade...');
      newAssignments.forEach((assignment: any, idx: number) => {
        assignment.grades.forEach((grade: any, gradeIdx: number) => {
          console.log(`🔵   Assignment ${idx}, Grade ${gradeIdx} - roomNumber: "${grade.roomNumber}" (type: ${typeof grade.roomNumber})`);
        });
      });

      const insertResult = await this.courseAssignmentModel.insertMany(newAssignments);
      console.log('🔵 insertMany result:', JSON.stringify(insertResult, null, 2));
      
      // Verify what was actually saved
      const savedAssignments = await this.courseAssignmentModel.find({
        teacherId: new Types.ObjectId(teacherUserId),
        schoolId: new Types.ObjectId(schoolId),
      }).lean();
      
      console.log('🔵 Verifying saved assignments from database:');
      savedAssignments.forEach((saved: any, idx: number) => {
        console.log(`🔵   Saved Assignment ${idx}:`, {
          courseId: saved.courseId,
          grades: saved.grades?.map((g: any) => ({
            level: g.level,
            section: g.section,
            roomNumber: g.roomNumber,
            roomNumberType: typeof g.roomNumber,
            hasRoomNumber: 'roomNumber' in g
          }))
        });
      });
      
      console.log('========================================');

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: `Successfully assigned ${assignments.length} course(s) to teacher`,
        data: { assignedCount: assignments.length }
      };

    } catch (error) {
      console.error('Error in assignCoursesToTeacher:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to assign courses',
        data: null
      };
    }
  }

  async updateTeacher(schoolId: string, id: string, updateData: UpdateTeacherDto, role: string, createdBy: string, files?: UploadedFileType[]) {
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      const existingUser = await this.userModel.findOne({ _id: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId), role: UserRole.TEACHER, isActive: true }).lean();
      if (!existingUser) {
        await session.abortTransaction();
        await session.endSession();
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Teacher not found', data: null };
      }

      // Handle profile picture file upload
      let newProfilePhotoUrl = '';
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.fieldname === 'profilePicture' || file.fieldname === 'profilePhoto') {
            if (!file.mimetype || !file.mimetype.startsWith('image/')) {
              console.warn(`⚠️ Profile picture should be an image. Skipping file: ${file.originalname}`);
              continue;
            }

            try {
              const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
              const schoolName = school?.name || null;
              const schoolIdStr = school?._id?.toString() || schoolId;

              const fileExtension = file.originalname.split('.').pop();
              const fileName = `teacher-profile-${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              const fileContent = file.buffer || (file.path ? fs.readFileSync(file.path) : null);

              if (fileContent) {
                const s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'teachers', 'profile-images', fileName);
                newProfilePhotoUrl = await uploadBufferToS3(
                  this.awsService.getS3Client(),
                  this.awsService.getBucketName(),
                  s3Key,
                  fileContent,
                  file.mimetype
                );
                console.log(`Profile picture uploaded to ${s3Key}: ${newProfilePhotoUrl}`);

                // Delete old profile picture if it exists
                const oldUrl = (existingUser as any).profilePicture || (existingUser as any).profilePhoto;
                if (oldUrl && oldUrl.startsWith('http')) {
                  try {
                    const oldKey = extractS3KeyFromUrl(oldUrl, this.awsService.getBucketName(), this.configService.get<string>('AWS_REGION'));
                    if (oldKey) {
                      await deleteFromS3(this.awsService.getS3Client(), this.awsService.getBucketName(), oldKey);
                      console.log(`Deleted old profile picture: ${oldKey}`);
                    }
                  } catch (deleteError) {
                    console.warn('Failed to delete old profile picture:', deleteError);
                  }
                }

                // Clean up local file if it was saved to disk by multer
                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
                break; // Only process first profile picture
              }
            } catch (uploadError) {
              console.error(`Error uploading profile picture:`, uploadError);
            }
          }
        }
      }

      if (updateData.email && updateData.email !== existingUser.email) {
        const emailExists = await this.userModel.findOne({ email: updateData.email.toLowerCase(), _id: { $ne: new Types.ObjectId(id) } }).lean();
        if (emailExists) {
          await session.abortTransaction();
          await session.endSession();
          return { success: false, statusCode: HttpStatus.CONFLICT, message: 'Email already exists', data: null };
        }
      }

      // Check if employeeId is being updated and validate global uniqueness
      if (updateData.employeeId !== undefined && updateData.employeeId !== null) {
        const existingTeacherProfile = await this.teacherModel.findOne({ 
          userId: new Types.ObjectId(id) 
        }).lean();
        
        // Only check if the employeeId is actually changing
        if (!existingTeacherProfile || existingTeacherProfile.employeeId !== updateData.employeeId.trim()) {
          const existingEmployeeId = await this.teacherModel.findOne({ 
            employeeId: updateData.employeeId.trim(),
            userId: { $ne: new Types.ObjectId(id) } // Exclude current teacher
          }).lean();
          
          if (existingEmployeeId) {
            await session.abortTransaction();
            await session.endSession();
            return { 
              success: false, 
              statusCode: HttpStatus.CONFLICT, 
              message: `Employee ID "${updateData.employeeId}" already exists in the system. Employee IDs must be unique across all users.`, 
              data: null 
            };
          }
        }
      }

      // Update User fields (only basic fields)
      const userUpdate: any = {};
      if (updateData.firstName !== undefined) userUpdate.firstName = updateData.firstName;
      if (updateData.lastName !== undefined) userUpdate.lastName = updateData.lastName;
      if (updateData.email !== undefined) userUpdate.email = updateData.email.toLowerCase();
      if (updateData.gender !== undefined) userUpdate.gender = updateData.gender;
      if (newProfilePhotoUrl) {
        userUpdate.profilePicture = newProfilePhotoUrl;
      } else if (updateData.profilePicture !== undefined) {
        userUpdate.profilePicture = updateData.profilePicture;
      }
      if (updateData.password) userUpdate.password = await bcrypt.hash(updateData.password, 10);
      // Fix: Update phone in User model as well (phone is stored in both User and TeacherProfile)
      if (updateData.phone !== undefined) userUpdate.phone = updateData.phone;
      if (updateData.address !== undefined) userUpdate.address = updateData.address;

      if (Object.keys(userUpdate).length > 0) {
        await this.userModel.findByIdAndUpdate(id, userUpdate, { session });
      }

      // Update TeacherProfile fields (extended fields)
      const profileUpdate: any = {};
      if (updateData.employeeId !== undefined) profileUpdate.employeeId = updateData.employeeId;
      if (updateData.middleName !== undefined) profileUpdate.middleName = updateData.middleName;
      if (updateData.dateOfBirth !== undefined) profileUpdate.dateOfBirth = updateData.dateOfBirth;
      if (updateData.address !== undefined) profileUpdate.address = updateData.address;
      if (updateData.phone !== undefined) profileUpdate.phone = updateData.phone;
      if (updateData.dateOfJoining !== undefined) profileUpdate.dateOfJoining = updateData.dateOfJoining;
      if (updateData.designation !== undefined) profileUpdate.designation = updateData.designation;
      if (updateData.qualifications !== undefined) profileUpdate.qualifications = updateData.qualifications;
      if (updateData.certifications !== undefined) profileUpdate.certifications = updateData.certifications;
      if (updateData.totalExperience !== undefined) profileUpdate.totalExperience = updateData.totalExperience;
      if (updateData.nationality !== undefined) profileUpdate.nationality = updateData.nationality;
      if (Array.isArray(updateData.departmentIds) && updateData.departmentIds.length > 0) {
        profileUpdate.departmentIds = updateData.departmentIds.map((deptId: string) => new Types.ObjectId(deptId));
      }

      if (Object.keys(profileUpdate).length > 0) {
        await this.teacherModel.findOneAndUpdate(
          { userId: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId) },
          profileUpdate,
          { session, upsert: false }
        );
      }

      await this.activityModel.create({
        title: 'Teacher Updated',
        subtitle: `Teacher ${updateData.firstName || existingUser.firstName} ${updateData.lastName || existingUser.lastName} was updated`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
      });

      await session.commitTransaction();
      await session.endSession();

      return { success: true, statusCode: HttpStatus.OK, message: 'Teacher updated successfully', data: null };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to update teacher',
        data: null,
      };
    }
  }

  async deleteTeacher(schoolId: string, id: string, role: string, actorId: string) {
    try {
      const existingUser = await this.userModel.findOne({ _id: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId), role: 'TEACHER', isActive: true }).lean();
      if (!existingUser) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Teacher not found', data: null };
      }

      // Soft delete User
      await this.userModel.findByIdAndUpdate(id, { isActive: false });

      // Soft delete TeacherProfile
      await this.teacherModel.findOneAndUpdate(
        { userId: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId) },
        { employmentStatus: 'Terminated' }
      );

      await this.activityModel.create({
        title: 'Teacher Deleted',
        subtitle: `Teacher ${existingUser.firstName} ${existingUser.lastName} was deleted`,
        performBy: role,
        actorId: new Types.ObjectId(actorId) || '',
        adminId: new Types.ObjectId(actorId)
      });

      return { success: true, statusCode: HttpStatus.OK, message: 'Teacher deleted successfully', data: null };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to delete teacher',
        data: null,
      };
    }
  }

  async importTeachers(schoolId: string, createdBy: string, file: UploadedFileType) {
    const session = await this.userModel.db.startSession();
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      // Read first sheet
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rows || rows.length === 0) {
        throw new BadRequestException('Import file is empty or invalid');
      }

      console.log("rows:", rows);
      // Helpers
      const toArrayIds = (v: any): string[] => {
        if (!v) return [];
        if (Array.isArray(v)) return v.filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
        const s = String(v);
        if (s.startsWith('[') && s.endsWith(']')) {
          try { const parsed = JSON.parse(s); return Array.isArray(parsed) ? parsed.map((x: any) => String(x).trim()).filter(Boolean) : []; } catch { /* fallthrough */ }
        }
        return s.split(',').map((x) => x.trim()).filter(Boolean);
      };
      const toDate = (v: any): Date | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        const d = new Date(v);
        return isNaN(d.getTime()) ? undefined : d;
      };

      console.log("toArrayIds:", toArrayIds);
      let insertedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      // Track emails and employee IDs within the current batch to detect duplicates
      const batchEmailSet = new Set<string>();
      const batchEmployeeIdSet = new Set<string>();

      let rowIndex = 1; // human-friendly

      for (const r of rows) {
        // Extract columns (match exportTeachers defaults where possible)
        const employeeId = String(r['Employee ID'] || r['employeeId'] || '').trim();
        const firstName = String(r['First Name'] || r['firstName'] || '').trim();
        const lastName = String(r['Last Name'] || r['lastName'] || '').trim();
        const email = String(r['Email'] || r['email'] || '').trim().toLowerCase();
        const gender = String(r['Gender'] || r['gender'] || '').trim();
        const phone = String(r['Phone'] || r['phone'] || '').trim();
        const address = String(r['Address'] || r['address'] || '').trim();
        const designation = String(r['Designation'] || r['designation'] || '').trim();
        const departmentIdsStr = r['Department IDs'] ?? r['departmentIds'] ?? '';
        const qualificationsStr = r['Qualifications'] ?? r['qualifications'] ?? '';
        const certificationsStr = r['Certifications'] ?? r['certifications'] ?? '';
        const departmentIds = toArrayIds(departmentIdsStr);
        const qualifications = toArrayIds(qualificationsStr);
        const certifications = toArrayIds(certificationsStr);
        const dateOfJoining = r['Date of Joining'] ?? r['dateOfJoining'] ?? '';
        const nationality = String(r['Nationality'] || r['nationality'] || '').trim();
        const totalExperience = r['Total Experience (years)'] ?? r['totalExperience'];

        // Required fields (per API requirements)
        const missing: string[] = [];
        if (!firstName) missing.push('First Name');
        if (!lastName) missing.push('Last Name');
        if (!email) missing.push('Email');
        if (!gender) missing.push('Gender');
        // Employee ID is optional - will be auto-generated if not provided
        if (!departmentIds || departmentIds.length === 0) missing.push('Department IDs');
        if (!qualifications || qualifications.length === 0) missing.push('Qualifications');
        if (!certifications || certifications.length === 0) missing.push('Certifications');

        console.log("missing:", missing);

        if (missing.length) {
          skippedCount++;
          errors.push(`Row ${rowIndex}: Missing required -> ${missing.join(', ')}`);
          rowIndex++;
          continue;
        }

        // Check for duplicate email within the same batch
        if (email && batchEmailSet.has(email)) {
          skippedCount++;
          errors.push(`Row ${rowIndex}: Email "${email}" appears multiple times in this file`);
          rowIndex++;
          continue;
        }

        // Email unique check in database
        const existingUser = await this.userModel.findOne({ email }).lean();
        if (existingUser) {
          console.log("existingUser:", existingUser);
          skippedCount++;
          errors.push(`Row ${rowIndex}: Email "${email}" already exists in the system`);
          rowIndex++;
          continue;
        }

        // Check for duplicate employee ID within the same batch
        if (employeeId && batchEmployeeIdSet.has(employeeId)) {
          skippedCount++;
          errors.push(`Row ${rowIndex}: Employee ID "${employeeId}" appears multiple times in this file`);
          rowIndex++;
          continue;
        }

        // EmployeeId globally unique across all users
        if (employeeId) {
          const empExists = await this.teacherModel.findOne({ employeeId }).lean();
          if (empExists) {
            console.log("empExists:", empExists);
            skippedCount++;
            errors.push(`Row ${rowIndex}: Employee ID "${employeeId}" already exists in the system. Employee IDs must be unique across all users.`);
            rowIndex++;
            continue;
          }
        }

        // Track this email and employeeId in the batch to detect duplicates in subsequent rows
        if (email) batchEmailSet.add(email);
        if (employeeId) batchEmployeeIdSet.add(employeeId);

        // Create user + teacher in a mini-transaction per row for safety
        await session.withTransaction(async () => {
          const hashedPassword = await bcrypt.hash('Teacher@12345', 10);

          const userDoc: any = {
            firstName,
            lastName,
            email,
            password: hashedPassword,
            gender,
            role: UserRole.TEACHER,
            isActive: true,
            createdBy: new Types.ObjectId(createdBy),
            schoolId: new Types.ObjectId(schoolId),
          };
          if (phone) userDoc.phone = phone;
          if (address) userDoc.address = address;

          console.log("userDoc:", userDoc);
          const user = await this.userModel.create([userDoc], { session });
          console.log("user:", user);
          const userId = user[0]._id;
          console.log("userId:", userId);
          const teacherDoc: any = {
            userId,
            schoolId: new Types.ObjectId(schoolId),
            employeeId,
            departmentIds: departmentIds.map((id: string) => new Types.ObjectId(id)),
          };
          console.log("teacherDoc:", teacherDoc);
          if (designation) teacherDoc.designation = designation;
          const doj = toDate(dateOfJoining);
          if (doj) teacherDoc.dateOfJoining = doj;
          if (nationality) teacherDoc.nationality = nationality;
          if (totalExperience !== undefined && totalExperience !== '') teacherDoc.totalExperience = Number(totalExperience) || 0;
          if (qualifications) teacherDoc.qualifications = qualifications;
          if (certifications) teacherDoc.certifications = certifications;

          console.log("teacherDoc:", teacherDoc);
          await this.teacherModel.create([teacherDoc], { session });
          console.log("teacherDoc created");

          // Send welcome email (outside transaction to avoid blocking)
          const savedUser = user[0];
          const tempPassword = 'Teacher@12345';
          this.emailService.sendWelcomeEmail(
            savedUser.email,
            savedUser.firstName,
            savedUser.lastName,
            savedUser.role,
            tempPassword,
          ).catch((emailError) => {
            console.error(`❌ Failed to send welcome email to ${savedUser.email}:`, emailError);
          });

          insertedCount++;
        });

        rowIndex++;
      }

      // Log the activity
      await this.logActivity(
        schoolId,
        createdBy,
        'TEACHER_BULK_UPLOAD',
        `Bulk uploaded ${insertedCount} teachers, skipped ${skippedCount} records`
      );

      return {
        message: `Successfully uploaded ${insertedCount} teachers. Skipped ${skippedCount} records due to conflicts or validation errors.`,
        insertedCount,
        skippedCount,
        errors: errors.length ? errors : null,
      };
    } catch (error) {
      throw new BadRequestException(`Teacher bulk upload failed: ${error.message}`);
    } finally {
      try { await session.endSession(); } catch { }
      try { if (file && file.path) { const fs2 = require('fs'); fs2.unlinkSync(file.path); } } catch { }
    }
  }

  async exportTeachers(schoolId: string, adminId: string) {
    try {
      // Fetch ALL teachers without pagination for export
      const match: any = { role: 'TEACHER', isActive: true };
      if (schoolId) {
        match.schoolId = new Types.ObjectId(schoolId);
      }

      const records = await this.userModel.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'teachers',
            localField: '_id',
            foreignField: 'userId',
            as: 'teacher'
          }
        },
        { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'departments',
            localField: 'teacher.departmentIds',
            foreignField: '_id',
            as: 'departments'
          }
        },
        {
          $project: {
            firstName: 1,
            lastName: 1,
            email: 1,
            gender: 1,
            schoolId: 1,
            createdAt: 1,
            updatedAt: 1,
            employeeId: '$teacher.employeeId',
            phone: 1,
            address: 1,
            designation: '$teacher.designation',
            departmentNames: {
              $map: { input: '$departments', as: 'd', in: '$$d.departmentName' }
            },
            departmentIds: '$teacher.departmentIds',
            dateOfBirth: '$teacher.dateOfBirth',
            dateOfJoining: '$teacher.dateOfJoining',
            totalExperience: '$teacher.totalExperience',
            nationality: '$teacher.nationality',
          }
        },
        { $sort: { createdAt: -1 } }
      ]).exec();

      if (!records || records.length === 0) {
        return {
          csvContent: '',
          filename: `teachers_${schoolId ? schoolId : 'all'}_${new Date().toISOString().split('T')[0]}.csv`
        };
      }

      const formatDate = (date: any): string => {
        if (!date) return 'N/A';
        try {
          const d = new Date(date);
          return isNaN(d.getTime()) ? 'N/A' : d.toISOString().split('T')[0];
        } catch {
          return 'N/A';
        }
      };

      const escapeCsvField = (field: string): string => {
        if (field === null || field === undefined) return 'N/A';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Define CSV headers for teachers
      const csvHeaders = [
        { key: 'employeeId', header: 'Employee ID' },
        { key: 'firstName', header: 'First Name' },
        { key: 'lastName', header: 'Last Name' },
        { key: 'email', header: 'Email' },
        { key: 'gender', header: 'Gender' },
        { key: 'phone', header: 'Phone' },
        { key: 'address', header: 'Address' },
        { key: 'designation', header: 'Designation' },
        { key: 'departmentNames', header: 'Departments' },
        { key: 'dateOfJoining', header: 'Date of Joining' },
        { key: 'totalExperience', header: 'Total Experience (years)' },
        { key: 'nationality', header: 'Nationality' },
        { key: 'createdAt', header: 'Created At' },
        { key: 'updatedAt', header: 'Updated At' },
      ];

      const csvRecords = records.map((t: any) => ({
        employeeId: t.employeeId || 'N/A',
        firstName: t.firstName || 'N/A',
        lastName: t.lastName || 'N/A',
        email: t.email || 'N/A',
        gender: t.gender || 'N/A',
        phone: t.phone || 'N/A',
        address: t.address || 'N/A',
        designation: t.designation || 'N/A',
        departmentNames: Array.isArray(t.departmentNames) && t.departmentNames.length > 0 ? t.departmentNames.join('; ') : 'N/A',
        dateOfJoining: formatDate(t.dateOfJoining),
        totalExperience: t.totalExperience ?? 'N/A',
        nationality: t.nationality || 'N/A',
        createdAt: formatDate(t.createdAt),
        updatedAt: formatDate(t.updatedAt),
      }));

      const headerRow = csvHeaders.map(h => escapeCsvField(h.header)).join(',');
      const dataRows = csvRecords.map((record: any) =>
        csvHeaders.map(h => escapeCsvField(String(record[h.key as keyof typeof record] || 'N/A'))).join(',')
      );
      const csvContent = [headerRow, ...dataRows].join('\r\n');

      return {
        csvContent,
        filename: `teachers_${schoolId ? schoolId : 'all'}_${new Date().toISOString().split('T')[0]}.csv`
      };
    } catch (error) {
      throw new BadRequestException('Failed to export teachers');
    }
  }

  async downloadStudentTemplate() {
    try {
      const csvHeaders = [
        'Student ID',
        'First Name',
        'Last Name',
        'Email',
        'Student Password',
        'Class',
        'Section',
        'Gender',
        'Date of Birth',
        'Address',
        'Enrollment Date',
        'Expected Graduation',
        'Blood Group',
        'Medical Conditions',
        'Allergies',
        'Nationality',
        'Religion',
        'Transport Mode',
        'Bus Route',
        'Clubs',
        'Lunch Preference',
        'IIP Flag',
        'Honor Rolls',
        'Athletics',
        'Profile Photo URL',
        'Emergency Contact First Name',
        'Emergency Contact Last Name',
        'Emergency Contact Phone',
        'Emergency Contact Relationship',
        'Parent Email',
        'Parent First Name',
        'Parent Last Name',
        'Parent Password',
        'Parent Phone',
        'Parent Gender',
        'Parent Address'
      ];

      const exampleRow = [
        'STU001',
        'John',
        'Doe',
        'john.doe@student.school.edu',
        'TempPass123!',
        'Grade 10',
        'A',
        'Male',
        '2010-05-15',
        '123 Main St, City, State, ZIP',
        '2024-09-01',
        '2026',
        'O+',
        'Asthma,Diabetes',
        'Peanuts,Dairy',
        'American',
        'Christian',
        'School Bus',
        'Route 1',
        'Chess Club,Debate Club',
        'vegetarian',
        'false',
        'false',
        'true',
        '',
        'Jane',
        'Doe',
        '+1234567890',
        'Mother',
        'jane.doe@email.com',
        'Jane',
        'Doe',
        'ParentPass123!',
        '+1234567890',
        'Female',
        '123 Main St, City, State, ZIP'
      ];

      const headerRow = csvHeaders.join(',');
      const exampleDataRow = exampleRow.map(field => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${String(field).replace(/"/g, '""')}"`;
        }
        return String(field);
      }).join(',');

      const csvContent = [headerRow, exampleDataRow].join('\r\n');

      return {
        csvContent,
        filename: 'student_bulk_upload_template.csv'
      };
    } catch (error) {
      throw new BadRequestException('Failed to generate student template');
    }
  }

  async downloadTeacherTemplate() {
    try {
      // Create CSV template with headers and one example row
      const csvHeaders = [
        'Employee ID',
        'First Name',
        'Last Name',
        'Email',
        'Gender',
        'Phone',
        'Address',
        'Designation',
        'Department IDs',
        'Date of Joining',
        'Total Experience (years)',
        'Nationality',
        'Qualifications',
        'Certifications',
      ];

      // Example row with placeholder values
      const exampleRow = [
        'EMP001',
        'John',
        'Doe',
        'john.doe@example.com',
        'Male',
        '+1234567890',
        '123 Main St, City, State',
        'Senior Teacher',
        'dept1,dept2',
        '2024-01-15',
        '5',
        'American',
        'B.Ed,M.Ed',
        'Teaching Certificate,First Aid',
      ];

      const headerRow = csvHeaders.join(',');
      const exampleDataRow = exampleRow.map(field => {
        // Escape fields that contain commas
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      }).join(',');

      const csvContent = [headerRow, exampleDataRow].join('\r\n');

      return {
        csvContent,
        filename: 'teacher_bulk_upload_template.csv'
      };
    } catch (error) {
      throw new BadRequestException('Failed to generate teacher template');
    }
  }

  async downloadParentTemplate() {
    try {
      const csvHeaders = [
        'First Name',
        'Last Name',
        'Email',
        'Password',
        'Phone',
        'Gender',
        'Address',
        'Parent Type',
        'Is Primary Contact',
        'Has Pickup Permission'
      ];

      const exampleRow = [
        'Jane',
        'Doe',
        'jane.doe@email.com',
        'ParentPass123!',
        '+1234567890',
        'Female',
        '123 Main St, City, State, ZIP',
        'MOTHER',
        'true',
        'true'
      ];

      const headerRow = csvHeaders.join(',');
      const exampleDataRow = exampleRow.map(field => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${String(field).replace(/"/g, '""')}"`;
        }
        return String(field);
      }).join(',');

      const csvContent = [headerRow, exampleDataRow].join('\r\n');

      return {
        csvContent,
        filename: 'parent_bulk_upload_template.csv'
      };
    } catch (error) {
      throw new BadRequestException('Failed to generate parent template');
    }
  }

  async downloadNurseTemplate() {
    try {
      const csvHeaders = [
        'First Name',
        'Last Name',
        'Email',
        'Password',
        'Phone',
        'License Number',
        'Gender',
        'Address',
        'Speciality',
        'Date of Joining',
        'Employment Type',
        'Experience Years',
        'Qualifications',
        'Certifications'
      ];

      const exampleRow = [
        'Mary',
        'Smith',
        'mary.smith@school.edu',
        'NursePass123!',
        '+1234567890',
        'RN-12345',
        'Female',
        '123 Health St, City, State',
        'Pediatrics',
        '2024-01-15',
        'FULL_TIME',
        '5',
        'BSN,MSN',
        'CPR,First Aid,Pediatric Nursing'
      ];

      const headerRow = csvHeaders.join(',');
      const exampleDataRow = exampleRow.map(field => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${String(field).replace(/"/g, '""')}"`;
        }
        return String(field);
      }).join(',');

      const csvContent = [headerRow, exampleDataRow].join('\r\n');

      return {
        csvContent,
        filename: 'nurse_bulk_upload_template.csv'
      };
    } catch (error) {
      throw new BadRequestException('Failed to generate nurse template');
    }
  }

  // ==================== PARENTS ====================

  async getParents(role: string, query: any, schoolId?: string) {
    try {
      const page = Math.max(Number(query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      // Base match
      const baseMatch: any = {
        role: 'PARENT',
        isActive: true
      };

      if (query.search) {
        const regex = { $regex: query.search, $options: 'i' };
        baseMatch.$or = [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { phone: regex }
        ];
      }

      if (query.gender) {
        baseMatch.gender = query.gender;
      }

      // === Step 1: Get restricted userIds based on parentType and schoolId (for ADMIN) ===
      let restrictedUserIds: any[] = [];

      // Build filter for Parent model
      const parentFilter: any = {};

      // Add parentType filter if provided
      if (query.parentType) {
        parentFilter.parentType = query.parentType;
      }

      // For ADMIN: Filter by schoolId in belongToSchools array where isActive: true
      // For SUPER_ADMIN: Filter by schoolId from query if provided, otherwise show all active parents
      if ((role === 'ADMIN' || role === 'SECRETARY') && schoolId) {
        // ADMIN and SECRETARY: Only show parents where this school's isActive is true
        parentFilter['belongToSchools.schoolId'] = new Types.ObjectId(schoolId);
        parentFilter['belongToSchools.isActive'] = true;
      } else if (role === 'SUPER_ADMIN') {
        // SUPER_ADMIN: If schoolId is provided in query, filter by that school
        // Otherwise show all parents where at least one school has isActive: true
        if (schoolId) {
          parentFilter['belongToSchools.schoolId'] = new Types.ObjectId(schoolId);
          parentFilter['belongToSchools.isActive'] = true;
        } else {
          // Show all parents where at least one school has isActive: true
          parentFilter['belongToSchools.isActive'] = true;
        }
      }

      // Only query Parent model if we have filters to apply
      // For ADMIN: Always filter by school (if schoolId exists)
      // For SUPER_ADMIN: Only filter if parentType is provided or need to check isActive
      const shouldFilterParents = ((role === 'ADMIN' || role === 'SECRETARY') && schoolId) || (query.parentType !== undefined) || (role === 'SUPER_ADMIN');

      if (shouldFilterParents && Object.keys(parentFilter).length > 0) {
        // For ADMIN, we need to use aggregation to properly filter by nested field
        let parentDocs: any[];

        if ((role === 'ADMIN' || role === 'SECRETARY') && schoolId) {
          // Use aggregation to find parents where belongToSchools contains matching schoolId with isActive: true
          const aggregation = [
            {
              $match: parentFilter.parentType ? { parentType: parentFilter.parentType } : {}
            },
            {
              $match: {
                belongToSchools: {
                  $elemMatch: {
                    schoolId: new Types.ObjectId(schoolId),
                    isActive: true
                  }
                }
              }
            },
            {
              $project: { userId: 1 }
            }
          ];
          const result = await this.parentModel.aggregate(aggregation).exec();
          parentDocs = result;
        } else if (role === 'SUPER_ADMIN') {
          // SUPER_ADMIN: If schoolId is provided, filter by that school
          // Otherwise find parents where at least one school has isActive: true
          const aggregation: any[] = [
            {
              $match: parentFilter.parentType ? { parentType: parentFilter.parentType } : {}
            }
          ];
          
          if (schoolId) {
            // Filter by specific schoolId
            aggregation.push({
              $match: {
                belongToSchools: {
                  $elemMatch: {
                    schoolId: new Types.ObjectId(schoolId),
                    isActive: true
                  }
                }
              }
            });
          } else {
            // Show all parents where at least one school has isActive: true
            aggregation.push({
              $match: {
                belongToSchools: {
                  $elemMatch: {
                    isActive: true
                  }
                }
              }
            });
          }
          
          aggregation.push({
            $project: { userId: 1 }
          });
          
          const result = await this.parentModel.aggregate(aggregation).exec();
          parentDocs = result;
        } else {
          // Simple find for parentType only
          parentDocs = await this.parentModel
            .find(parentFilter)
            .select('userId')
            .lean();
        }

        if (parentDocs.length === 0) {
          return {
            success: true,
            statusCode: HttpStatus.OK,
            message: 'Parents fetched successfully',
            data: { parents: [], pagination: getPaginationMeta(page, limit, 0) }
          };
        }
        restrictedUserIds = parentDocs.map(p => p.userId);
      }

      // === Step 2: Build FINAL match for both data + count ===
      const finalMatch: any = { ...baseMatch };
      if (restrictedUserIds.length > 0) {
        finalMatch._id = { $in: restrictedUserIds };
      }

      // === Step 3: Count with ALL filters ===
      const countResult = await this.userModel
        .aggregate([
          { $match: finalMatch },
          { $count: 'total' }
        ])
        .exec();

      const totalCount = countResult[0]?.total || 0;

      // === Step 4: Main aggregation with pagination ===
      // Build children count filter based on role
      const childrenCountMatch: any[] = [
        { $eq: ['$role', 'STUDENT'] },
        { $eq: ['$isActive', true] },
        { $in: ['$$parentId', '$parentIds'] }
      ];

      // For ADMIN and SUPER_ADMIN (when schoolId is provided): Add schoolId filter to children count
      if (schoolId && ((role === 'ADMIN' || role === 'SECRETARY') || (role === 'SUPER_ADMIN' && schoolId))) {
        childrenCountMatch.push({ $eq: ['$schoolId', new Types.ObjectId(schoolId)] });
      }

      const aggregation: any[] = [
        { $match: finalMatch },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },

        // Lookup parent info
        {
          $lookup: {
            from: 'parents',
            localField: '_id',
            foreignField: 'userId',
            as: 'parentInfo',
            pipeline: [
              { $match: query.parentType ? { parentType: query.parentType } : {} },
              {
                $project: {
                  parentType: 1,
                  isPrimaryContact: 1,
                  hasPickupPermission: 1
                }
              }
            ]
          }
        },
        { $unwind: { path: '$parentInfo', preserveNullAndEmptyArrays: true } },

        // Count children
        // For ADMIN: Count only children from admin's school
        // For SUPER_ADMIN: Count all children
        {
          $lookup: {
            from: 'users',
            let: { parentId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: childrenCountMatch
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'childCount'
          }
        },
        {
          $addFields: {
            numberOfChildren: { $ifNull: [{ $arrayElemAt: ['$childCount.count', 0] }, 0] }
          }
        },

        // Final projection
        {
          $project: {
            _id: 1,
            email: 1,
            firstName: 1,
            lastName: 1,
            isActive: 1,
            phone: 1,
            address: 1,
            gender: 1,
            parentType: '$parentInfo.parentType',
            isPrimaryContact: { $ifNull: ['$parentInfo.isPrimaryContact', false] },
            hasPickupPermission: { $ifNull: ['$parentInfo.hasPickupPermission', false] },
            numberOfChildren: 1
          }
        }
      ];

      const parents = await this.userModel.aggregate(aggregation).exec();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Parents fetched successfully',
        data: {
          parents,
          pagination: getPaginationMeta(page, limit, totalCount)
        }
      };

    } catch (error) {
      console.error('Error fetching parents:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch parents',
        data: null
      };
    }
  }

  async createParent(createdBy: string, role: string, parentData: any, schoolId?: string) {
    console.log('🔵 [createParent] Called with parentData:', JSON.stringify({
      email: parentData.email,
      firstName: parentData.firstName,
      lastName: parentData.lastName,
      isPrimaryContact: parentData.isPrimaryContact,
      hasPickupPermission: parentData.hasPickupPermission,
      parentType: parentData.parentType,
    }, null, 2));
    
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      if (!schoolId) {
        await session.abortTransaction();
        await session.endSession();
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null
        };
      }

      const existingParent = await this.userModel.findOne({
        email: parentData.email.toLowerCase(),
        role: UserRole.PARENT
      }).lean();

      // If parent already exists, check if schoolId is in belongToSchools
      if (existingParent) {
        const parentDoc = await this.parentModel.findOne({
          userId: existingParent._id
        }).lean();

        if (parentDoc) {
          // Check if schoolId already exists in belongToSchools array
          const belongToSchools = Array.isArray(parentDoc.belongToSchools) ? parentDoc.belongToSchools : [];
          const schoolIdObj = new Types.ObjectId(schoolId);

          const existingSchoolEntry = belongToSchools.find((entry: any) =>
            entry.schoolId && entry.schoolId.toString() === schoolIdObj.toString()
          );

          if (existingSchoolEntry) {
            await session.abortTransaction();
            await session.endSession();
            return {
              success: false,
              statusCode: HttpStatus.CONFLICT,
              message: 'Parent already exists in this school',
              data: {
                _id: existingParent._id
              }
            };
          }

          // SchoolId doesn't exist, add it to belongToSchools array with isActive: true
          // Also update isPrimaryContact and hasPickupPermission if provided
          const updateData: any = {
            $push: {
              belongToSchools: {
                schoolId: schoolIdObj,
                isActive: true
              }
            }
          };
          
          // Update relationship fields if provided
          if (parentData.isPrimaryContact !== undefined) {
            updateData.isPrimaryContact = Boolean(parentData.isPrimaryContact);
            console.log('📝 Updating isPrimaryContact to:', updateData.isPrimaryContact, '(from parentData:', parentData.isPrimaryContact, ')');
          }
          if (parentData.hasPickupPermission !== undefined) {
            updateData.hasPickupPermission = Boolean(parentData.hasPickupPermission);
            console.log('📝 Updating hasPickupPermission to:', updateData.hasPickupPermission, '(from parentData:', parentData.hasPickupPermission, ')');
          }
          
          console.log('💾 Updating existing parent document with data:', JSON.stringify(updateData, null, 2));
          
          await this.parentModel.updateOne(
            { userId: existingParent._id },
            updateData,
            { session }
          );
          
          // Verify the update
          const updatedParentDoc = await this.parentModel.findOne({ userId: existingParent._id }).session(session).lean();
          console.log('✅ Parent document updated successfully:', {
            _id: updatedParentDoc?._id,
            userId: updatedParentDoc?.userId,
            isPrimaryContact: updatedParentDoc?.isPrimaryContact,
            hasPickupPermission: updatedParentDoc?.hasPickupPermission,
          });
        } else {
          // Parent exists but parentDoc doesn't, create parentDoc with schoolId and isActive: true
          const isPrimaryContact = parentData.isPrimaryContact !== undefined ? Boolean(parentData.isPrimaryContact) : false;
          const hasPickupPermission = parentData.hasPickupPermission !== undefined ? Boolean(parentData.hasPickupPermission) : false;
          
          console.log('📝 Creating parentDoc for existing parent with relationship info:');
          console.log('  - isPrimaryContact:', isPrimaryContact, '(from parentData:', parentData.isPrimaryContact, ')');
          console.log('  - hasPickupPermission:', hasPickupPermission, '(from parentData:', parentData.hasPickupPermission, ')');
          
          const parentDocData = {
            userId: existingParent._id,
            parentType: parentData.parentType || 'GUARDIAN',
            belongToSchools: [{ schoolId: new Types.ObjectId(schoolId), isActive: true }],
            isPrimaryContact: isPrimaryContact,
            hasPickupPermission: hasPickupPermission,
          };
          
          console.log('💾 Saving parent document with data:', JSON.stringify(parentDocData, null, 2));
          
          const createdParentDocs = await this.parentModel.create([parentDocData], { session });
          const newParentDoc = createdParentDocs[0];
          
          console.log('✅ Parent document created successfully:', {
            _id: newParentDoc?._id,
            userId: newParentDoc?.userId,
            isPrimaryContact: newParentDoc?.isPrimaryContact,
            hasPickupPermission: newParentDoc?.hasPickupPermission,
          });
        }

        await session.commitTransaction();
        await session.endSession();

        // Fetch the updated parent document to return complete data
        const updatedParentDoc = await this.parentModel.findOne({ userId: existingParent._id }).lean();
        
        console.log('✅ [createParent] Existing parent added to school. Returning data:', {
          _id: existingParent._id,
          email: existingParent.email,
          firstName: existingParent.firstName,
          lastName: existingParent.lastName,
          parentDoc: {
            _id: updatedParentDoc?._id,
            isPrimaryContact: updatedParentDoc?.isPrimaryContact,
            hasPickupPermission: updatedParentDoc?.hasPickupPermission,
          }
        });

        // Log activity
        await this.activityModel.create({
          title: 'Parent Added to School',
          subtitle: `Parent ${existingParent.firstName || ''} ${existingParent.lastName || ''} added to school`,
          performBy: role,
          actorId: new Types.ObjectId(createdBy) || '',
          adminId: new Types.ObjectId(createdBy),
          action: 'ADD_PARENT_TO_SCHOOL',
          entityType: UserRole.PARENT,
          entityId: existingParent._id.toString()
        });

        return {
          success: true,
          statusCode: HttpStatus.OK,
          message: 'Parent added to the school successfully',
          data: {
            _id: existingParent._id,
            userId: existingParent._id,
            email: existingParent.email,
            firstName: existingParent.firstName,
            lastName: existingParent.lastName,
            isPrimaryContact: updatedParentDoc?.isPrimaryContact ?? false,
            hasPickupPermission: updatedParentDoc?.hasPickupPermission ?? false,
          }
        };
      }

      // Parent doesn't exist, create new parent
      // Hash the password
      const newPassword = parentData.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      // Extract and log primary contact and pickup permission values
      const isPrimaryContact = parentData.isPrimaryContact !== undefined ? Boolean(parentData.isPrimaryContact) : false;
      const hasPickupPermission = parentData.hasPickupPermission !== undefined ? Boolean(parentData.hasPickupPermission) : false;
      
      console.log('📝 Creating new parent with relationship info:');
      console.log('  - isPrimaryContact:', isPrimaryContact, '(from parentData:', parentData.isPrimaryContact, ')');
      console.log('  - hasPickupPermission:', hasPickupPermission, '(from parentData:', parentData.hasPickupPermission, ')');

      // Create user account for parent with only provided fields
      const userDoc: any = {
        firstName: parentData.firstName,
        lastName: parentData.lastName,
        email: parentData.email.toLowerCase(),
        password: newPassword,
        role: UserRole.PARENT,
        isActive: true,
        createdBy: new Types.ObjectId(createdBy),
        mustChangePassword: true,
        passwordLastChanged: new Date()
      };

      if (parentData.phone !== undefined) userDoc.phone = parentData.phone;
      if (parentData.address !== undefined) userDoc.address = parentData.address;
      if (parentData.profilePicture !== undefined) userDoc.profilePicture = parentData.profilePicture;
      if (parentData.gender !== undefined) userDoc.gender = parentData.gender;

      console.log('userDoc', userDoc);

      const parent = new this.userModel(userDoc);

      const savedParent = await parent.save({ session });

      // Prepare belongToSchools array - push schoolId with isActive: true
      const belongToSchools: any[] = [{ schoolId: new Types.ObjectId(schoolId), isActive: true }];

      const parentDocData = {
        userId: savedParent._id,
        parentType: parentData.parentType,
        belongToSchools: belongToSchools,
        isPrimaryContact: isPrimaryContact,
        hasPickupPermission: hasPickupPermission,
      };
      
      console.log('💾 Saving parent document with data:', JSON.stringify(parentDocData, null, 2));

      const createdParentDocs = await this.parentModel.create([parentDocData], { session });
      const newParentDoc = createdParentDocs[0];
      
      console.log('✅ Parent document created successfully:', {
        _id: newParentDoc?._id,
        userId: newParentDoc?.userId,
        isPrimaryContact: newParentDoc?.isPrimaryContact,
        hasPickupPermission: newParentDoc?.hasPickupPermission,
      });

      // Log activity
      await this.activityModel.create({
        title: 'Parent Created',
        subtitle: `Created parent: ${parentData.firstName} ${parentData.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy),
        action: 'CREATE_PARENT',
        entityType: UserRole.PARENT,
        entityId: savedParent._id,
        metadata: { email: savedParent.email }
      });

      // Commit the transaction
      await session.commitTransaction();
      await session.endSession();
      
      // Fetch the created parent document to return complete data
      const savedParentDoc = await this.parentModel.findOne({ userId: savedParent._id }).lean();
      
      console.log('✅ [createParent] Parent created successfully. Returning data:', {
        _id: savedParent._id,
        email: savedParent.email,
        firstName: savedParent.firstName,
        lastName: savedParent.lastName,
        parentDoc: {
          _id: savedParentDoc?._id,
          isPrimaryContact: savedParentDoc?.isPrimaryContact,
          hasPickupPermission: savedParentDoc?.hasPickupPermission,
        }
      });

      // Send welcome email (outside transaction to avoid blocking)
      try {
        await this.emailService.sendWelcomeEmail(
          savedParent.email,
          savedParent.firstName,
          savedParent.lastName,
          savedParent.role,
          newPassword,
        );
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${savedParent.email}:`, emailError);
        // Don't fail the creation if email fails
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Parent created successfully',
        data: {
          _id: savedParent._id,
          userId: savedParent._id,
          email: savedParent.email,
          firstName: savedParent.firstName,
          lastName: savedParent.lastName,
          isPrimaryContact: savedParentDoc?.isPrimaryContact ?? false,
          hasPickupPermission: savedParentDoc?.hasPickupPermission ?? false,
        }
      };
    } catch (error) {
      await session.abortTransaction();
      console.error('Error in createParent:', error);
      if (error instanceof ConflictException) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: error.message,
          data: null
        };
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${validationErrors.join(', ')}`,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to create parent',
        data: null
      };
    } finally {
      session.endSession();
    }
  }

  async updateParent(parentId: string, updateData: any, role: string, roleId: string) {
    try {
      const existingUser = await this.userModel.findById(parentId).lean();
      if (!existingUser || existingUser.role !== UserRole.PARENT as any) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Parent not found',
          data: null
        };
      }

      // Build $set only with provided fields
      const toSet: any = {};
      if (updateData.firstName !== undefined) toSet.firstName = updateData.firstName;
      if (updateData.lastName !== undefined) toSet.lastName = updateData.lastName;
      if (updateData.password !== undefined) {
        toSet.password = await bcrypt.hash(updateData.password, 10);
      }
      if (updateData.phone !== undefined) toSet.phone = updateData.phone;
      if (updateData.address !== undefined) toSet.address = updateData.address;
      if (updateData.profilePicture !== undefined) toSet.profilePicture = updateData.profilePicture;
      if (updateData.gender !== undefined) toSet.gender = updateData.gender;

      if (Object.keys(toSet).length > 0) {
        await this.userModel.updateOne({ _id: parentId }, { $set: toSet });
      }

      // Update Parent document for parentType and studentIds
      const studentIds = Array.isArray(updateData.studentIds)
        ? updateData.studentIds.filter(Boolean).map((id: string) => new Types.ObjectId(id))
        : undefined;

      const parentUpdate: any = {};
      if (updateData.parentType) parentUpdate.parentType = updateData.parentType;
      if (studentIds) parentUpdate.studentIds = studentIds;
      if (updateData.isPrimaryContact !== undefined) parentUpdate.isPrimaryContact = updateData.isPrimaryContact;
      if (updateData.hasPickupPermission !== undefined) parentUpdate.hasPickupPermission = updateData.hasPickupPermission;
      if (Object.keys(parentUpdate).length > 0) {
        const updRes = await this.parentModel.updateOne(
          { userId: new Types.ObjectId(parentId) },
          { $set: parentUpdate }
        );
        if (updRes.matchedCount === 0) {
          return {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Parent record not found',
            data: null
          };
        }
      }

      // Log the activity
      const updatedUser = await this.userModel.findById(parentId).lean();


      console.log("updatedUser:", updatedUser);

      await this.activityModel.create({
        title: 'Parent Updated',
        subtitle: `Parent ${updatedUser?.firstName || ''} ${updatedUser?.lastName || ''} was updated`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(roleId),
        adminId: new Types.ObjectId(roleId),
        action: 'UPDATE_PARENT',
        entityType: 'PARENT',
        entityId: parentId
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Parent updated successfully',
        data: null
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
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to update parent',
        data: null
      };
    }
  }

  async deleteParent(parentId: string, role: string, roleId: string, schoolId?: string) {
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      // Fetch parent info for activity logging (in parallel with other operations)
      const parent = await this.userModel.findOne({ _id: parentId, role: UserRole.PARENT }).lean();

      if (role === 'ADMIN' || role === 'SECRETARY') {
        if (!schoolId) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'School ID is required for ADMIN role',
            data: null
          };
        }

        // Check parent's belongToSchools status for admin's school
        const parentDoc = await this.parentModel.findOne({ userId: parentId }).lean();
        if (!parentDoc || !parentDoc.belongToSchools || parentDoc.belongToSchools.length === 0) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Parent not found',
            data: null
          };
        }

        // Find the entry for admin's school
        const adminSchoolEntry = parentDoc.belongToSchools.find((entry: any) =>
          entry && entry.schoolId && entry.schoolId.toString() === new Types.ObjectId(schoolId).toString()
        );

        // Check if parent is associated with admin's school
        if (!adminSchoolEntry) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Parent is not associated with this school',
            data: null
          };
        }

        // Check if parent is already deleted (isActive: false) for admin's school
        if (adminSchoolEntry.isActive === false) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Parent is already deleted from this school',
            data: null
          };
        }
      } else if (role === 'SUPER_ADMIN') {
        // check if parent is active in belongToSchools. and if its isActive is false in all schools
        const parentDoc = await this.parentModel.findOne({ userId: parentId }).lean();
        if (!parentDoc || !parentDoc.belongToSchools || parentDoc.belongToSchools.length === 0) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'Parent not found',
            data: null
          };
        }
        if (parentDoc.belongToSchools.every((entry: any) => entry.isActive === false)) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Parent is already deleted from all schools',
            data: null
          };
        }
      }

      // Determine which students to detach parent from based on role
      let studentFilter: any;

      if (role === 'SUPER_ADMIN') {
        // SUPER_ADMIN: Detach from all students across all schools
        studentFilter = {
          role: 'STUDENT',
          isActive: true,
          parentIds: new Types.ObjectId(parentId)
        };
      } else {
        // ADMIN: Detach only from students in the admin's school
        if (!schoolId) {
          await session.abortTransaction();
          await session.endSession();
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'School ID is required for ADMIN role',
            data: null
          };
        }
        studentFilter = {
          role: 'STUDENT',
          isActive: true,
          schoolId: new Types.ObjectId(schoolId),
          parentIds: new Types.ObjectId(parentId)
        };
      }

      // Update belongToSchools: Set isActive to false for the school(s)
      // For ADMIN: Set isActive: false only for the admin's schoolId
      // For SUPER_ADMIN: Set isActive: false for ALL schools
      let updateParentResult: any;

      if (role === 'SUPER_ADMIN') {
        // SUPER_ADMIN: Set isActive: false for all schools in belongToSchools
        updateParentResult = await this.parentModel.updateOne(
          { userId: new Types.ObjectId(parentId) },
          {
            $set: {
              'belongToSchools.$[].isActive': false
            }
          },
          { session }
        );
      } else {
        // ADMIN: Set isActive: false only for the specific schoolId
        updateParentResult = await this.parentModel.updateOne(
          { userId: new Types.ObjectId(parentId) },
          {
            $set: {
              'belongToSchools.$[elem].isActive': false
            }
          },
          {
            arrayFilters: [{ 'elem.schoolId': new Types.ObjectId(schoolId) }],
            session
          }
        );
      }

      // Remove parent ID from all matching students' parentIds array (bulk update)
      // Create activity log
      const [updateStudentsResult, activityResult] = await Promise.all([
        // Remove parent ID from students' parentIds array (bulk update)
        this.userModel.updateMany(
          studentFilter,
          { $pull: { parentIds: new Types.ObjectId(parentId) } },
          { session }
        ),
        // Create activity log
        this.activityModel.create({
          title: 'Parent Deleted',
          subtitle: `Parent ${parent.firstName || ''} ${parent.lastName || ''} was deleted from school`,
          performBy: role,
          actorId: new Types.ObjectId(roleId),
          adminId: new Types.ObjectId(roleId)
        })
      ]);

      const studentsDetached = updateStudentsResult.modifiedCount || 0;

      await session.commitTransaction();
      await session.endSession();

      console.log("studentsDetached:", studentsDetached);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: `Parent deleted successfully`,
        data: {
          studentsDetached: studentsDetached
        }
      };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();

      console.error('Error deleting parent:', error);

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
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to delete parent',
        data: null
      };
    }
  }

  async resetParentPassword(schoolId: string, adminId: string, parentId: string, newPassword: string, role: string) {
    try {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // For ADMIN: Check association with school
      // For SUPER_ADMIN: Skip association check, just verify parent exists
      const isSuperAdmin = role === 'SUPER_ADMIN';

      let parent;
      let hasAssociation;

      if (isSuperAdmin) {
        // SUPER_ADMIN: Only verify parent exists, no association check needed
        parent = await this.userModel.findOne({ _id: parentId, role: 'PARENT', isActive: true }).lean();
      } else {
        // ADMIN: Check both parent exists and association with school
        if (!schoolId) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'School ID is required for ADMIN role',
            data: null
          };
        }

        const [parentResult, associationResult] = await Promise.all([
          this.userModel.findOne({ _id: parentId, role: 'PARENT', isActive: true }).lean(),
          this.userModel.exists({
            role: 'STUDENT',
            isActive: true,
            schoolId: new Types.ObjectId(schoolId),
            parentIds: new Types.ObjectId(parentId)
          })
        ]);

        parent = parentResult;
        hasAssociation = associationResult;
      }

      if (!parent) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Parent not found',
          data: null
        };
      }

      // Only check association for ADMIN
      if (!isSuperAdmin && !hasAssociation) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Parent is not associated with any students in this school',
          data: null
        };
      }

      // Update parent password
      const updatedParent = await this.userModel.findOneAndUpdate(
        { _id: parentId, role: 'PARENT' },
        { password: hashedPassword },
        { new: true }
      );

      if (!updatedParent) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Failed to update parent password',
          data: null
        };
      }

      // Log the activity
      const activityData = {
        title: 'Parent Password Reset',
        subtitle: `Password reset for parent ${(parent as any).firstName || ''} ${(parent as any).lastName || ''}`,
        performBy: role,
        actorId: new Types.ObjectId(adminId),
        adminId: new Types.ObjectId(adminId)
      };

      await this.activityModel.create(activityData);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Parent password reset successfully',
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
      console.error('Error resetting parent password:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to reset parent password',
        data: null
      };
    }
  }

  async getParentByIdWithChildren(parentId: string, role: string, schoolId?: string) {
    try {
      // Fetch parent user and parent document in parallel
      const [parent, parentDoc] = await Promise.all([
        this.userModel.findOne({ _id: parentId, role: 'PARENT' }).lean(),
        this.parentModel.findOne({ userId: new Types.ObjectId(parentId) }).lean()
      ]);

      if (!parent) {
        throw new NotFoundException('Parent not found');
      }

      // Check if parent is active in belongToSchools based on role
      if (parentDoc && Array.isArray(parentDoc.belongToSchools) && parentDoc.belongToSchools.length > 0) {
        if ((role === 'ADMIN' || role === 'SECRETARY') && schoolId) {
          // ADMIN and SECRETARY: Check if parent's isActive is false for admin's/secretary's school
          const adminSchoolEntry = parentDoc.belongToSchools.find((entry: any) =>
            entry && entry.schoolId && entry.schoolId.toString() === new Types.ObjectId(schoolId).toString()
          );

          if (!adminSchoolEntry || adminSchoolEntry.isActive === false) {
            throw new NotFoundException('Parent not found');
          }
        } else if (role === 'SUPER_ADMIN') {
          // SUPER_ADMIN: Check if ALL schools have isActive: false
          const allInactive = parentDoc.belongToSchools.every((entry: any) =>
            !entry || entry.isActive === false
          );

          if (allInactive) {
            throw new NotFoundException('Parent not found');
          }
        }
      } else if ((role === 'ADMIN' || role === 'SECRETARY') && schoolId) {
        // ADMIN and SECRETARY: If no belongToSchools entry, parent is not associated with admin's/secretary's school
        throw new NotFoundException('Parent not found');
      }

      // Build filter for children based on role
      // ADMIN and SECRETARY: Only children from admin's/secretary's school
      // SUPER_ADMIN: All children regardless of school
      const childrenFilter: any = {
        role: 'STUDENT',
        isActive: true,
        parentIds: new Types.ObjectId(parentId)
      };

      if ((role === 'ADMIN' || role === 'SECRETARY') && schoolId) {
        // ADMIN and SECRETARY: Filter children by schoolId
        childrenFilter.schoolId = new Types.ObjectId(schoolId);
      }

      // Find children: STUDENT role users where parentId is in parentIds array
      const children: any[] = await this.userModel
        .find(childrenFilter)
        .select('firstName lastName profilePicture schoolId studentId class section email gender dob')
        .lean();

      // Count children (filtered by school for ADMIN, all for SUPER_ADMIN)
      const numberOfChildren = children.length;

      // Get unique school IDs from children
      const childrenSchoolIds = [...new Set(
        children
          .map(child => child.schoolId?.toString())
          .filter(Boolean)
      )];

      // Get school IDs from parent's belongToSchools array (new structure with schoolId and isActive)
      const belongToSchoolsData = Array.isArray(parentDoc?.belongToSchools)
        ? parentDoc.belongToSchools.filter((entry: any) => entry && entry.schoolId)
        : [];

      const belongToSchoolIds = belongToSchoolsData.map((entry: any) => entry.schoolId.toString()).filter(Boolean);

      // Combine all school IDs (children schools + belongToSchools)
      const allSchoolIds = [...new Set([...childrenSchoolIds, ...belongToSchoolIds])];

      // Fetch school names for all schools (children + belongToSchools)
      const schools = allSchoolIds.length > 0
        ? await this.schoolModel
          .find({ _id: { $in: allSchoolIds.map(id => new Types.ObjectId(id)) } })
          .select('_id name')
          .lean()
        : [];

      // Create school ID to name map
      const schoolIdToName = new Map(
        schools.map((school: any) => [school._id.toString(), school.name])
      );

      // Format belongToSchools with school names and isActive status
      const belongToSchoolsWithNames = belongToSchoolsData.map((entry: any) => ({
        schoolId: entry.schoolId.toString(),
        schoolName: schoolIdToName.get(entry.schoolId.toString()) || 'N/A',
        isActive: entry.isActive !== undefined ? entry.isActive : true
      }));

      // Format children with school names
      const childrenWithSchoolNames = children.map((child: any) => ({
        _id: child._id,
        firstName: child.firstName,
        lastName: child.lastName,
        profilePicture: child.profilePicture || null,
        schoolId: child.schoolId ? child.schoolId.toString() : null,
        schoolName: child.schoolId ? (schoolIdToName.get(child.schoolId.toString()) || 'N/A') : 'N/A',
        studentId: child.studentId,
        class: child.class,
        section: child.section,
        email: child.email,
        gender: child.gender,
        dob: child.dob
      }));

      // Build parent response with all info from both tables
      const response = {
        parent: {
          _id: parent._id,
          email: parent.email,
          firstName: parent.firstName,
          lastName: parent.lastName,
          phone: parent.phone || null,
          address: parent.address || null,
          gender: parent.gender || null,
          profilePicture: parent.profilePicture || null,
          isActive: parent.isActive !== false,
          // Additional info from Parent table
          parentType: parentDoc?.parentType || null,
          isPrimaryContact: parentDoc?.isPrimaryContact ?? false,
          hasPickupPermission: parentDoc?.hasPickupPermission ?? false,
          // Schools that this parent belongs to (with names)
          belongToSchools: belongToSchoolsWithNames,
          // Count of children
          numberOfChildren: numberOfChildren,
          createdAt: (parent as any).createdAt || null,
          updatedAt: (parent as any).updatedAt || null
        },
        children: childrenWithSchoolNames
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Parent fetched successfully',
        data: response
      };
    } catch (error) {
      console.error('Error fetching parent by ID:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch parent',
        data: null
      };
    }
  }

  // ==================== NURSES ====================

  async getNurses(role: string, query: any, schoolId?: string) {
    try {
      const page = Math.max(Number(query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      // Base match
      const baseMatch: any = {
        role: UserRole.NURSE,
        isActive: true
      };

      // School filtering
      if ((role === UserRole.ADMIN || role === UserRole.SECRETARY) && schoolId) {
        baseMatch.schoolId = new Types.ObjectId(schoolId);
      } else if (role === UserRole.SUPER_ADMIN && query.schoolId) {
        baseMatch.schoolId = new Types.ObjectId(query.schoolId);
      }

      // Search filter
      if (query.search) {
        const regex = { $regex: query.search, $options: 'i' };
        baseMatch.$or = [
          { firstName: regex },
          { lastName: regex },
          { email: regex },
          { phone: regex }
        ];
      }

      // Count total
      const countResult = await this.userModel
        .aggregate([
          { $match: baseMatch },
          { $count: 'total' }
        ])
        .exec();

      const totalCount = countResult[0]?.total || 0;

      // Main aggregation with pagination
      const aggregation: any[] = [
        { $match: baseMatch },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },

        // Lookup nurse info
        {
          $lookup: {
            from: 'nurses',
            localField: '_id',
            foreignField: 'userId',
            as: 'nurseInfo'
          }
        },
        { $unwind: { path: '$nurseInfo', preserveNullAndEmptyArrays: true } },

        // Filter by specialty if provided
        ...(query.speciality ? [{
          $match: {
            'nurseInfo.speciality': { $regex: query.speciality, $options: 'i' }
          }
        }] : []),

        // school name from schoolId
        {
          $lookup: {
            from: 'schools',
            localField: 'schoolId',
            foreignField: '_id',
            as: 'schoolInfo'
          }
        },
        { $unwind: { path: '$schoolInfo', preserveNullAndEmptyArrays: true } },

        // Final projection
        {
          $project: {
            _id: 1,
            email: 1,
            firstName: 1,
            lastName: 1,
            phone: 1,
            address: 1,
            profilePicture: 1,
            schoolId: 1,
            schoolName: '$schoolInfo.name',
            experienceYears: '$nurseInfo.experienceYears',
            licenseNumber: '$nurseInfo.licenseNumber',
            dateOfJoining: '$nurseInfo.dateOfJoining',
            createdAt: 1
          }
        }
      ];

      const nurses = await this.userModel.aggregate(aggregation).exec();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Nurses fetched successfully',
        data: {
          nurses,
          pagination: getPaginationMeta(page, limit, totalCount)
        }
      };
    } catch (error) {
      console.error('Error fetching nurses:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch nurses',
        data: null
      };
    }
  }

  async createNurse(createdBy: string, role: UserRole, nurseData: CreateNurseDto, schoolId?: string, files?: UploadedFileType[]) {
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {

      const existingNurse = await this.userModel.findOne({
        email: nurseData.email,
        role: UserRole.NURSE
      }).lean();

      const existingNurseByLicenseNumber = await this.nurseModel.findOne({
        licenseNumber: nurseData.licenseNumber,
        userId: { $ne: existingNurse?._id }
      }).lean();

      if (existingNurse || existingNurseByLicenseNumber) {
        await session.abortTransaction();
        await session.endSession();
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'Nurse with this email or license number already exists',
          data: null
        };
      }

      // Get the password (plain text for welcome email)
      const newPassword = nurseData.password?.trim() || PasswordGenerator.generateTemporaryPassword();
      
      // Note: Password will be hashed by User schema pre-save hook
      // We keep plain password for welcome email, but don't hash manually to avoid double hashing

      // Handle profile picture file upload
      let profilePictureUrl = '';
      if (files && files.length > 0) {
        // Fetch school information for organized folder structure
        const finalSchoolId = schoolId || nurseData.schoolId;
        if (finalSchoolId) {
          const school = await this.schoolModel.findById(finalSchoolId).select('name _id').lean();
          const schoolName = school?.name || null;
          const schoolIdStr = school?._id?.toString() || finalSchoolId;

          for (const file of files) {
            if (file.fieldname === 'profilePicture' || file.fieldname === 'profilePhoto') {
              const fileExtension = file.originalname.split('.').pop();
              const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtension?.toLowerCase() || '');
              if (!isImage) {
                console.warn(`⚠️ Profile picture should be an image. Skipping file: ${file.originalname}`);
                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
                continue;
              }

              const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              // Build path: schools/{school-name}/nurses/profile-images/{filename}
              const key = buildS3KeyPath(schoolName, schoolIdStr, 'nurses', 'profile-images', fileName);
              const fileContent = file.buffer || fs.readFileSync(file.path || '');

              try {
                profilePictureUrl = await uploadBufferToS3(
                  this.awsService.getS3Client(),
                  this.awsService.getBucketName(),
                  key,
                  fileContent,
                  file.mimetype
                );
                console.log(`Profile picture uploaded to ${key}: ${profilePictureUrl}`);

                // Clean up if it was saved to disk
                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
              } catch (uploadError) {
                console.error(`Error uploading profile picture:`, uploadError);
                // Continue with nurse creation even if file upload fails
              }
              break; // Only process first profile picture
            }
          }
        } else {
          // Fallback if no school ID - use old structure
          for (const file of files) {
            if (file.fieldname === 'profilePicture' || file.fieldname === 'profilePhoto') {
              const fileExtension = file.originalname.split('.').pop();
              const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtension?.toLowerCase() || '');
              if (!isImage) {
                console.warn(`⚠️ Profile picture should be an image. Skipping file: ${file.originalname}`);
                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
                continue;
              }

              const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              const key = `nurse_profile_pictures/${fileName}`;
              const fileContent = file.buffer || fs.readFileSync(file.path || '');

              try {
                profilePictureUrl = await uploadBufferToS3(
                  this.awsService.getS3Client(),
                  this.awsService.getBucketName(),
                  key,
                  fileContent,
                  file.mimetype
                );
                console.log(`Profile picture uploaded: ${profilePictureUrl}`);

                if (file.path && fs.existsSync(file.path)) {
                  fs.unlinkSync(file.path);
                }
              } catch (uploadError) {
                console.error(`Error uploading profile picture:`, uploadError);
              }
              break;
            }
          }
        }
      }

      // Create user account for nurse
      const userDoc: any = {
        firstName: nurseData.firstName,
        lastName: nurseData.lastName,
        email: nurseData.email,
        password: newPassword, // Plain password - will be hashed by User schema pre-save hook
        role: UserRole.NURSE,
        isActive: true,
        schoolId: new Types.ObjectId(schoolId),
        createdBy: new Types.ObjectId(createdBy),
        status: UserStatus.ACTIVE,
        mustChangePassword: true,
        passwordChangedAt: undefined // Don't set passwordChangedAt when mustChangePassword is true
      };
      if (nurseData.phone !== undefined) userDoc.phone = nurseData.phone;
      if (nurseData.address !== undefined) userDoc.address = nurseData.address;
      if (profilePictureUrl) userDoc.profilePicture = profilePictureUrl;
      if (nurseData.gender !== undefined) userDoc.gender = nurseData.gender;

      const nurseUser = new this.userModel(userDoc);
      const savedNurse = await nurseUser.save({ session });

      // Create nurse document with unique fields
      const nurseDoc: any = {};
      if (nurseData.qualifications !== undefined) nurseDoc.qualifications = nurseData.qualifications;
      if (nurseData.experienceYears !== undefined) nurseDoc.experienceYears = nurseData.experienceYears;
      if (nurseData.speciality !== undefined) nurseDoc.speciality = nurseData.speciality;
      if (nurseData.licenseNumber !== undefined) nurseDoc.licenseNumber = nurseData.licenseNumber;
      if (nurseData.dateOfJoining !== undefined) nurseDoc.dateOfJoining = new Date(nurseData.dateOfJoining);
      if (nurseData.certifications !== undefined) nurseDoc.certifications = nurseData.certifications;
      if (nurseData.employmentType !== undefined) nurseDoc.employmentType = nurseData.employmentType;

      if (Object.keys(nurseDoc).length > 0) {
        await this.nurseModel.create([{
          userId: savedNurse._id,
          ...nurseDoc
        }], { session });
      }

      // Log activity
      await this.activityModel.create({
        title: 'Nurse Created',
        subtitle: `Created nurse: ${nurseData.firstName} ${nurseData.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy),
        action: 'CREATE_NURSE',
        entityType: UserRole.NURSE,
        entityId: savedNurse._id,
        metadata: { email: savedNurse.email }
      });

      await session.commitTransaction();
      await session.endSession();

      // Send welcome email (outside transaction to avoid blocking)
      try {
        await this.emailService.sendWelcomeEmail(
          savedNurse.email,
          savedNurse.firstName,
          savedNurse.lastName,
          savedNurse.role,
          newPassword,
        );
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${savedNurse.email}:`, emailError);
        // Don't fail the creation if email fails
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Nurse created successfully',
        data: null
      };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      console.error('Error in createNurse:', error);
      if (error instanceof ConflictException) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: error.message,
          data: null
        };
      }
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${validationErrors.join(', ')}`,
          data: null
        };
      }
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error.message || 'Failed to create nurse',
        data: null
      };
    }
  }

  async getNurseById(nurseId: string, role: string, schoolId?: string) {
    try {
      const match: any = {
        _id: new Types.ObjectId(nurseId),
        role: UserRole.NURSE,
        isActive: true,
        schoolId: new Types.ObjectId(schoolId),
      };

      // Fetch user and nurse info in parallel using Promise.all
      const [userResult, nurseInfo] = await Promise.all([
        this.userModel
          .findOne(match)
          .select('_id firstName lastName email gender phone address profilePicture createdAt updatedAt')
          .populate('schoolId', 'name code type address phone')
          .populate('createdBy', 'firstName lastName email role')
          .lean(),
        this.nurseModel.findOne({ userId: nurseId }).lean(),
      ]);

      if (!userResult || !nurseInfo) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Nurse not found',
          data: null,
        };
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Nurse fetched successfully',
        data: { ...userResult, ...nurseInfo },
      };
    } catch (error) {
      console.error('Error fetching nurse:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch nurse',
        data: null,
      };
    }
  }

  async updateNurse(nurseId: string, updateData: any, role: string, roleId: string, schoolId?: string, files?: UploadedFileType[]) {
    try {
      const nurseObjectId = new Types.ObjectId(nurseId);
      const match: any = {
        _id: nurseObjectId,
        role: UserRole.NURSE,
        schoolId: new Types.ObjectId(schoolId),
      };

      const existingUser = await this.userModel.findOne(match).lean();
      if (!existingUser) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Nurse not found',
          data: null
        };
      }

      const existingNurseInfo = await this.nurseModel.findOne({ userId: nurseObjectId }).lean();

      // Enforce unique email (excluding current record)
      if (updateData.email && updateData.email !== existingUser.email) {
        const emailConflict = await this.userModel.findOne({
          email: updateData.email,
          role: UserRole.NURSE,
          _id: { $ne: nurseObjectId }
        }).lean();

        if (emailConflict) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Another nurse with this email already exists',
            data: null
          };
        }
      }

      // Enforce unique license number (excluding current record)
      if (
        updateData.licenseNumber &&
        updateData.licenseNumber !== existingNurseInfo?.licenseNumber
      ) {
        const licenseConflict = await this.nurseModel.findOne({
          licenseNumber: updateData.licenseNumber,
          userId: { $ne: nurseObjectId }
        }).lean();

        if (licenseConflict) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Another nurse with this license number already exists',
            data: null
          };
        }
      }

      // Handle profile picture file upload
      let newProfilePictureUrl: string | null = null;
      if (files && files.length > 0) {
        // Fetch school information for organized folder structure
        const finalSchoolId = schoolId || existingUser.schoolId?.toString();
        const school = finalSchoolId ? await this.schoolModel.findById(finalSchoolId).select('name _id').lean() : null;
        const schoolName = school?.name || null;
        const schoolIdStr = school?._id?.toString() || finalSchoolId;

        for (const file of files) {
          if (file.fieldname === 'profilePicture' || file.fieldname === 'profilePhoto') {
            const fileExtension = file.originalname.split('.').pop();
            const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fileExtension?.toLowerCase() || '');
            if (!isImage) {
              console.warn(`Profile picture should be an image. Skipping file: ${file.originalname}`);
              if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
              continue;
            }

            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            // Build path: schools/{school-name}/nurses/profile-images/{filename}
            const key = schoolIdStr ? buildS3KeyPath(schoolName, schoolIdStr, 'nurses', 'profile-images', fileName) : `nurse_profile_pictures/${fileName}`;
            const fileContent = file.buffer || fs.readFileSync(file.path || '');

            try {
              // Upload new profile picture first
              newProfilePictureUrl = await uploadBufferToS3(
                this.awsService.getS3Client(),
                this.awsService.getBucketName(),
                key,
                fileContent,
                file.mimetype
              );
              console.log(`Profile picture uploaded: ${newProfilePictureUrl}`);

              // Delete old profile picture from AWS
              const oldUrl = (existingUser as any).profilePicture || (existingUser as any).profilePhoto;
              if (oldUrl) {
                const oldKey = extractS3KeyFromUrl(
                  oldUrl,
                  this.awsService.getBucketName(),
                  this.configService.get<string>('AWS_REGION')
                );
                if (oldKey) {
                  try {
                    await deleteFromS3(
                      this.awsService.getS3Client(),
                      this.awsService.getBucketName(),
                      oldKey
                    );
                    console.log(`Old profile picture deleted from S3`);
                  } catch (deleteError) {
                    console.warn(`Failed to delete old profile picture:`, deleteError);
                  }
                }
              }

              // Clean up if it was saved to disk
              if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            } catch (uploadError) {
              console.error(`Error uploading profile picture:`, uploadError);
              // Continue with update even if file upload fails
            }
            break; // Only process first profile picture
          }
        }
      }

      // Build $set only with provided fields for user
      const toSet: any = {};
      if (updateData.firstName !== undefined) toSet.firstName = updateData.firstName;
      if (updateData.lastName !== undefined) toSet.lastName = updateData.lastName;
      if (updateData.email !== undefined) toSet.email = updateData.email;
      if (updateData.password !== undefined) {
        toSet.password = await bcrypt.hash(updateData.password, 10);
      }
      if (updateData.phone !== undefined) toSet.phone = updateData.phone;
      if (updateData.address !== undefined) toSet.address = updateData.address;
      if (newProfilePictureUrl) toSet.profilePicture = newProfilePictureUrl;
      if (updateData.gender !== undefined) toSet.gender = updateData.gender;

      if (Object.keys(toSet).length > 0) {
        await this.userModel.updateOne({ _id: nurseObjectId }, { $set: toSet });
      }

      // Update Nurse document
      const nurseUpdate: any = {};
      if (updateData.qualifications !== undefined) nurseUpdate.qualifications = updateData.qualifications;
      if (updateData.experienceYears !== undefined) nurseUpdate.experienceYears = updateData.experienceYears;
      if (updateData.speciality !== undefined) nurseUpdate.speciality = updateData.speciality;
      if (updateData.licenseNumber !== undefined) nurseUpdate.licenseNumber = updateData.licenseNumber;
      if (updateData.dateOfJoining !== undefined) nurseUpdate.dateOfJoining = new Date(updateData.dateOfJoining);
      if (updateData.certifications !== undefined) nurseUpdate.certifications = updateData.certifications;
      if (updateData.employmentType !== undefined) nurseUpdate.employmentType = updateData.employmentType;

      if (Object.keys(nurseUpdate).length > 0) {
        const updRes = await this.nurseModel.updateOne(
          { userId: nurseObjectId },
          { $set: nurseUpdate },
          { upsert: true }
        );
      }

      // Log activity
      const updatedUser = await this.userModel.findById(nurseObjectId).lean();
      await this.activityModel.create({
        title: 'Nurse Updated',
        subtitle: `Nurse ${updatedUser?.firstName || ''} ${updatedUser?.lastName || ''} was updated`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(roleId),
        adminId: new Types.ObjectId(roleId),
        action: 'UPDATE_NURSE',
        entityType: UserRole.NURSE,
        entityId: nurseId
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Nurse updated successfully',
        data: null
      };
    } catch (error) {
      console.error('Error updating nurse:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to update nurse',
        data: null
      };
    }
  }

  async deleteNurse(nurseId: string, role: string, roleId: string, schoolId?: string) {
    try {
      const match: any = {
        _id: new Types.ObjectId(nurseId),
        role: UserRole.NURSE,
        schoolId: new Types.ObjectId(schoolId),
        isActive: true
      };

      const nurse = await this.userModel.findOne(match).lean();

      if (!nurse) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Nurse not found',
          data: null
        };
      }

      // Soft delete by setting isActive to false
      await this.userModel.updateOne({ _id: nurseId }, { $set: { isActive: false } });

      // Log activity
      await this.activityModel.create({
        title: 'Nurse Deactivated',
        subtitle: `Deactivated nurse: ${nurse.firstName} ${nurse.lastName}`,
        performBy: role || 'ADMIN',
        actorId: new Types.ObjectId(roleId),
        adminId: new Types.ObjectId(roleId),
        action: 'DEACTIVATE_NURSE',
        entityType: UserRole.NURSE,
        entityId: nurseId
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Nurse deactivated successfully',
        data: null
      };
    } catch (error) {
      console.error('Error deactivating nurse:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to deactivate nurse',
        data: null
      };
    }
  }

  // ==================== COURSES ====================

  async createCourse(schoolId: string, createdBy: string, courseData: any, role: string) {
    try {
      const courseName = courseData.courseName;
      const courseCode = courseData.courseCode;

      const existing = await this.courseModel.findOne({
        schoolId: new Types.ObjectId(schoolId),
        courseCode: courseCode
      });

      if (existing) {
        throw new ConflictException('Course code already exists');
      }

      // Allow same course name with different course code - only check course code uniqueness
      // Removed course name uniqueness check to allow same name with different codes 

      const payload: any = {
        courseName,
        courseCode,
        departmentIds: (courseData.departmentIds || []).map((id: string) => new Types.ObjectId(id)),
        Prerequisites: courseData.Prerequisites || '',
        description: courseData.description || '',
        schoolId: new Types.ObjectId(schoolId),
        createdBy: new Types.ObjectId(createdBy),
        isActive: true,
      };

      await this.courseModel.create(payload);

      await this.activityModel.create({
        title: 'Course Created',
        subtitle: `Course ${courseName} (${courseCode}) was created`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy),
      });

      return { success: true, statusCode: HttpStatus.CREATED, message: 'Course created successfully', data: null };
    } catch (error) {
      return {
        success: false,
        statusCode: error?.status || HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to create course',
        data: null,
      };
    }
  }

  async getCourses(role: string, schoolId: string, query: any) {
    try {
      const page = Math.max(Number(query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      const match: any = { isActive: true };
      if (schoolId) match.schoolId = new Types.ObjectId(schoolId);
      if (query.departmentId) match.departmentIds = new Types.ObjectId(query.departmentId);
      if (query.search) {
        const regex = { $regex: query.search, $options: 'i' };
        match.$or = [{ courseName: regex }, { courseCode: regex }];
      }

      const totalCountAgg = await this.courseModel.aggregate([{ $match: match }, { $count: 'total' }]).exec();
      const totalCount = totalCountAgg[0]?.total || 0;

      const coursesRaw = await this.courseModel
        .find(match)
        .select('_id courseName courseCode departmentIds schoolId createdAt')
        .populate('schoolId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Attach departmentsCount and omit departmentIds from response
      const courses = coursesRaw.map((c: any) => {
        const departmentsCount = Array.isArray(c.departmentIds) ? c.departmentIds.length : 0;
        const { departmentIds, ...rest } = c;
        return { ...rest, departmentsCount };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Courses fetched successfully',
        data: {
          courses,
          pagination: getPaginationMeta(page, limit, totalCount),
        },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch courses',
        data: null,
      };
    }
  }

  async getCourseById(schoolId: string, id: string) {
    try {
      const course = await this.courseModel
        .findOne({ _id: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId), isActive: true })
        .select('_id name code courseName courseCode Prerequisites description departmentIds schoolId isActive createdAt updatedAt')
        .populate('departmentIds', 'departmentName code description')
        .populate('createdBy', 'firstName lastName email role')
        .populate('schoolId', 'name code type address phone email')
        .lean();

      if (!course) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Course not found', data: null };
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Course fetched successfully',
        data: { course },
      };
    } catch (error) {
      return { success: false, statusCode: HttpStatus.BAD_REQUEST, message: error?.message || 'Failed to fetch course', data: null };
    }
  }

  async updateCourse(schoolId: string, courseId: string, updateData: any, role: string, adminId: string) {
    try {
      const existing = await this.courseModel.findOne({ _id: new Types.ObjectId(courseId), schoolId: new Types.ObjectId(schoolId), isActive: true }).lean();
      if (!existing) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Course not found', data: null };
      }

      const newCode = updateData.courseCode;
      if (newCode && newCode !== (existing.courseCode)) {
        const dup = await this.courseModel.findOne({
          schoolId: new Types.ObjectId(schoolId),
          courseCode: newCode,
          _id: { $ne: new Types.ObjectId(courseId) },
        }).lean();
        if (dup) {
          return { success: false, statusCode: HttpStatus.CONFLICT, message: 'Course code already exists', data: null };
        }
      }

      const name = updateData.courseName;
      const toSet: any = { ...updateData };
      if (name) { toSet.courseName = name; }
      if (newCode) { toSet.courseCode = newCode; }
      if (Array.isArray(updateData.departmentIds) && updateData.departmentIds.length > 0) {
        toSet.departmentIds = updateData.departmentIds.map((id: string) => new Types.ObjectId(id));
      }

      await this.courseModel.findByIdAndUpdate(courseId, toSet, { new: false }).lean();

      await this.activityModel.create({
        title: 'Course Updated',
        subtitle: `Course ${(name || existing.courseName) || ''} (${(newCode || existing.courseCode) || ''}) was updated`,
        performBy: role,
        actorId: new Types.ObjectId(adminId),
        adminId: new Types.ObjectId(adminId)
      });

      return { success: true, statusCode: HttpStatus.OK, message: 'Course updated successfully', data: null };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to update course',
        data: null,
      };
    }
  }

  async deleteCourse(schoolId: string, courseId: string, role: string, actorId: string) {
    try {
      const existing = await this.courseModel.findOne({ _id: new Types.ObjectId(courseId), schoolId: new Types.ObjectId(schoolId), isActive: true }).lean();
      if (!existing) {
        return { success: false, statusCode: HttpStatus.NOT_FOUND, message: 'Course not found', data: null };
      }

      await this.courseModel.findByIdAndUpdate(courseId, { isActive: false }).lean();

      await this.activityModel.create({
        title: 'Course Deleted',
        subtitle: `Course ${existing.courseName} (${existing.courseCode}) was deleted`,
        performBy: role,
        actorId,
        adminId: new Types.ObjectId(actorId)
      });

      return { success: true, statusCode: HttpStatus.OK, message: 'Course deleted successfully', data: null };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to delete course',
        data: null,
      };
    }
  }

  // ==================== UTILITIES ====================

  async getSchoolInfo(schoolId: string) {
    try {
      const school = await this.schoolModel
        .findById(schoolId)
        .select('name code type address phone email website gradelevels')
        .lean();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'School info fetched successfully',
        data: school
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to fetch school info',
        data: null
      };
      throw new BadRequestException('Failed to fetch school info');
    }
  }

  async getCountries() {
    // Return a list of countries for the nationality dropdown
    const countries = [
      { code: 'AF', name: 'Afghanistan' },
      { code: 'AL', name: 'Albania' },
      { code: 'DZ', name: 'Algeria' },
      { code: 'AD', name: 'Andorra' },
      { code: 'AO', name: 'Angola' },
      { code: 'AR', name: 'Argentina' },
      { code: 'AM', name: 'Armenia' },
      { code: 'AU', name: 'Australia' },
      { code: 'AT', name: 'Austria' },
      { code: 'AZ', name: 'Azerbaijan' },
      { code: 'BH', name: 'Bahrain' },
      { code: 'BD', name: 'Bangladesh' },
      { code: 'BY', name: 'Belarus' },
      { code: 'BE', name: 'Belgium' },
      { code: 'BZ', name: 'Belize' },
      { code: 'BJ', name: 'Benin' },
      { code: 'BT', name: 'Bhutan' },
      { code: 'BO', name: 'Bolivia' },
      { code: 'BA', name: 'Bosnia and Herzegovina' },
      { code: 'BW', name: 'Botswana' },
      { code: 'BR', name: 'Brazil' },
      { code: 'BN', name: 'Brunei' },
      { code: 'BG', name: 'Bulgaria' },
      { code: 'BF', name: 'Burkina Faso' },
      { code: 'BI', name: 'Burundi' },
      { code: 'CV', name: 'Cabo Verde' },
      { code: 'KH', name: 'Cambodia' },
      { code: 'CM', name: 'Cameroon' },
      { code: 'CA', name: 'Canada' },
      { code: 'CF', name: 'Central African Republic' },
      { code: 'TD', name: 'Chad' },
      { code: 'CL', name: 'Chile' },
      { code: 'CN', name: 'China' },
      { code: 'CO', name: 'Colombia' },
      { code: 'KM', name: 'Comoros' },
      { code: 'CG', name: 'Congo' },
      { code: 'CD', name: 'Congo (DRC)' },
      { code: 'CR', name: 'Costa Rica' },
      { code: 'CI', name: 'Côte d\'Ivoire' },
      { code: 'HR', name: 'Croatia' },
      { code: 'CU', name: 'Cuba' },
      { code: 'CY', name: 'Cyprus' },
      { code: 'CZ', name: 'Czech Republic' },
      { code: 'DK', name: 'Denmark' },
      { code: 'DJ', name: 'Djibouti' },
      { code: 'DM', name: 'Dominica' },
      { code: 'DO', name: 'Dominican Republic' },
      { code: 'EC', name: 'Ecuador' },
      { code: 'EG', name: 'Egypt' },
      { code: 'SV', name: 'El Salvador' },
      { code: 'GQ', name: 'Equatorial Guinea' },
      { code: 'ER', name: 'Eritrea' },
      { code: 'EE', name: 'Estonia' },
      { code: 'SZ', name: 'Eswatini' },
      { code: 'ET', name: 'Ethiopia' },
      { code: 'FJ', name: 'Fiji' },
      { code: 'FI', name: 'Finland' },
      { code: 'FR', name: 'France' },
      { code: 'GA', name: 'Gabon' },
      { code: 'GM', name: 'Gambia' },
      { code: 'GE', name: 'Georgia' },
      { code: 'DE', name: 'Germany' },
      { code: 'GH', name: 'Ghana' },
      { code: 'GR', name: 'Greece' },
      { code: 'GD', name: 'Grenada' },
      { code: 'GT', name: 'Guatemala' },
      { code: 'GN', name: 'Guinea' },
      { code: 'GW', name: 'Guinea-Bissau' },
      { code: 'GY', name: 'Guyana' },
      { code: 'HT', name: 'Haiti' },
      { code: 'VA', name: 'Holy See' },
      { code: 'HN', name: 'Honduras' },
      { code: 'HU', name: 'Hungary' },
      { code: 'IS', name: 'Iceland' },
      { code: 'IN', name: 'India' },
      { code: 'ID', name: 'Indonesia' },
      { code: 'IR', name: 'Iran' },
      { code: 'IQ', name: 'Iraq' },
      { code: 'IE', name: 'Ireland' },
      { code: 'IL', name: 'Israel' },
      { code: 'IT', name: 'Italy' },
      { code: 'JM', name: 'Jamaica' },
      { code: 'JP', name: 'Japan' },
      { code: 'JO', name: 'Jordan' },
      { code: 'KZ', name: 'Kazakhstan' },
      { code: 'KE', name: 'Kenya' },
      { code: 'KI', name: 'Kiribati' },
      { code: 'KP', name: 'Korea (North)' },
      { code: 'KR', name: 'Korea (South)' },
      { code: 'KW', name: 'Kuwait' },
      { code: 'KG', name: 'Kyrgyzstan' },
      { code: 'LA', name: 'Laos' },
      { code: 'LV', name: 'Latvia' },
      { code: 'LB', name: 'Lebanon' },
      { code: 'LS', name: 'Lesotho' },
      { code: 'LR', name: 'Liberia' },
      { code: 'LY', name: 'Libya' },
      { code: 'LI', name: 'Liechtenstein' },
      { code: 'LT', name: 'Lithuania' },
      { code: 'LU', name: 'Luxembourg' },
      { code: 'MG', name: 'Madagascar' },
      { code: 'MW', name: 'Malawi' },
      { code: 'MY', name: 'Malaysia' },
      { code: 'MV', name: 'Maldives' },
      { code: 'ML', name: 'Mali' },
      { code: 'MT', name: 'Malta' },
      { code: 'MH', name: 'Marshall Islands' },
      { code: 'MR', name: 'Mauritania' },
      { code: 'MU', name: 'Mauritius' },
      { code: 'MX', name: 'Mexico' },
      { code: 'FM', name: 'Micronesia' },
      { code: 'MD', name: 'Moldova' },
      { code: 'MC', name: 'Monaco' },
      { code: 'MN', name: 'Mongolia' },
      { code: 'ME', name: 'Montenegro' },
      { code: 'MA', name: 'Morocco' },
      { code: 'MZ', name: 'Mozambique' },
      { code: 'MM', name: 'Myanmar' },
      { code: 'NA', name: 'Namibia' },
      { code: 'NR', name: 'Nauru' },
      { code: 'NP', name: 'Nepal' },
      { code: 'NL', name: 'Netherlands' },
      { code: 'NZ', name: 'New Zealand' },
      { code: 'NI', name: 'Nicaragua' },
      { code: 'NE', name: 'Niger' },
      { code: 'NG', name: 'Nigeria' },
      { code: 'MK', name: 'North Macedonia' },
      { code: 'NO', name: 'Norway' },
      { code: 'OM', name: 'Oman' },
      { code: 'PK', name: 'Pakistan' },
      { code: 'PW', name: 'Palau' },
      { code: 'PS', name: 'Palestine' },
      { code: 'PA', name: 'Panama' },
      { code: 'PG', name: 'Papua New Guinea' },
      { code: 'PY', name: 'Paraguay' },
      { code: 'PE', name: 'Peru' },
      { code: 'PH', name: 'Philippines' },
      { code: 'PL', name: 'Poland' },
      { code: 'PT', name: 'Portugal' },
      { code: 'QA', name: 'Qatar' },
      { code: 'RO', name: 'Romania' },
      { code: 'RU', name: 'Russia' },
      { code: 'RW', name: 'Rwanda' },
      { code: 'KN', name: 'Saint Kitts and Nevis' },
      { code: 'LC', name: 'Saint Lucia' },
      { code: 'VC', name: 'Saint Vincent and the Grenadines' },
      { code: 'WS', name: 'Samoa' },
      { code: 'SM', name: 'San Marino' },
      { code: 'ST', name: 'Sao Tome and Principe' },
      { code: 'SA', name: 'Saudi Arabia' },
      { code: 'SN', name: 'Senegal' },
      { code: 'RS', name: 'Serbia' },
      { code: 'SC', name: 'Seychelles' },
      { code: 'SL', name: 'Sierra Leone' },
      { code: 'SG', name: 'Singapore' },
      { code: 'SK', name: 'Slovakia' },
      { code: 'SI', name: 'Slovenia' },
      { code: 'SB', name: 'Solomon Islands' },
      { code: 'SO', name: 'Somalia' },
      { code: 'ZA', name: 'South Africa' },
      { code: 'SS', name: 'South Sudan' },
      { code: 'ES', name: 'Spain' },
      { code: 'LK', name: 'Sri Lanka' },
      { code: 'SD', name: 'Sudan' },
      { code: 'SR', name: 'Suriname' },
      { code: 'SE', name: 'Sweden' },
      { code: 'CH', name: 'Switzerland' },
      { code: 'SY', name: 'Syria' },
      { code: 'TW', name: 'Taiwan' },
      { code: 'TJ', name: 'Tajikistan' },
      { code: 'TZ', name: 'Tanzania' },
      { code: 'TH', name: 'Thailand' },
      { code: 'TL', name: 'Timor-Leste' },
      { code: 'TG', name: 'Togo' },
      { code: 'TO', name: 'Tonga' },
      { code: 'TT', name: 'Trinidad and Tobago' },
      { code: 'TN', name: 'Tunisia' },
      { code: 'TR', name: 'Turkey' },
      { code: 'TM', name: 'Turkmenistan' },
      { code: 'TV', name: 'Tuvalu' },
      { code: 'UG', name: 'Uganda' },
      { code: 'UA', name: 'Ukraine' },
      { code: 'AE', name: 'United Arab Emirates' },
      { code: 'GB', name: 'United Kingdom' },
      { code: 'US', name: 'United States' },
      { code: 'UY', name: 'Uruguay' },
      { code: 'UZ', name: 'Uzbekistan' },
      { code: 'VU', name: 'Vanuatu' },
      { code: 'VE', name: 'Venezuela' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'YE', name: 'Yemen' },
      { code: 'ZM', name: 'Zambia' },
      { code: 'ZW', name: 'Zimbabwe' }
    ];

    return countries;
  }

  // ==================== HONOR ROLL MANAGEMENT ====================

  async getHonorRollCriteria(schoolId: string, filters: any = {}) {
    try {
      return await this.honorRollService.getCriteriaBySchool(schoolId, filters);
    } catch (error) {
      throw new BadRequestException('Failed to fetch honor roll criteria');
    }
  }

  async createHonorRollCriteria(schoolId: string, createdBy: string, criteriaData: any) {
    try {
      criteriaData.schoolId = schoolId;
      const result = await this.honorRollService.createCriteria(criteriaData, createdBy);

      await this.logActivity(
        schoolId,
        createdBy,
        'HONOR_ROLL_CRITERIA_CREATED',
        `Created honor roll criteria: ${criteriaData.name}`
      );

      return result;
    } catch (error) {
      throw new BadRequestException('Failed to create honor roll criteria');
    }
  }

  async updateHonorRollCriteria(schoolId: string, updatedBy: string, criteriaId: string, updateData: any) {
    try {
      const result = await this.honorRollService.updateCriteria(criteriaId, updateData, updatedBy);

      await this.logActivity(
        schoolId,
        updatedBy,
        'HONOR_ROLL_CRITERIA_UPDATED',
        `Updated honor roll criteria: ${criteriaId}`
      );

      return result;
    } catch (error) {
      throw new BadRequestException('Failed to update honor roll criteria');
    }
  }

  async deleteHonorRollCriteria(schoolId: string, deletedBy: string, criteriaId: string) {
    try {
      await this.honorRollService.deleteCriteria(criteriaId);

      await this.logActivity(
        schoolId,
        deletedBy,
        'HONOR_ROLL_CRITERIA_DELETED',
        `Deleted honor roll criteria: ${criteriaId}`
      );

      return { message: 'Honor roll criteria deleted successfully' };
    } catch (error) {
      throw new BadRequestException('Failed to delete honor roll criteria');
    }
  }

  async getHonorRollAwards(schoolId: string, filters: any = {}) {
    try {
      return await this.honorRollService.getHonorRollAwards(schoolId, filters);
    } catch (error) {
      throw new BadRequestException('Failed to fetch honor roll awards');
    }
  }

  async calculateHonorRoll(schoolId: string, calculatedBy: string, academicYear: string, markingPeriod: string) {
    try {
      const result = await this.honorRollService.calculateHonorRoll(schoolId, academicYear, markingPeriod, calculatedBy);

      await this.logActivity(
        schoolId,
        calculatedBy,
        'HONOR_ROLL_CALCULATED',
        `Calculated honor roll for ${academicYear} - ${markingPeriod}`
      );

      return result;
    } catch (error) {
      throw new BadRequestException('Failed to calculate honor roll');
    }
  }

  async getHonorRollReport(schoolId: string, filters: any = {}) {
    try {
      return await this.honorRollService.getHonorRollReport(schoolId, filters);
    } catch (error) {
      throw new BadRequestException('Failed to generate honor roll report');
    }
  }

  // ==================== UTILITY METHODS ====================

  private async logActivity(schoolId: string, userId: string, type: string, description: string) {
    try {
      const activity = new this.activityModel({
        title: type,
        subtitle: description,
        performBy: 'ADMIN',
        adminId: userId,
        actorId:  userId,
      });
      await activity.save();
    } catch (error) {
      // Logging should not break the main operation
      console.error('Failed to log activity:', error);
    }
  }

  // ==================== DEPARTMENTS ====================

  async getDepartments(schoolId: string | undefined, query: any, role?: string) {
    try {
      const page = Math.max(Number(query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      // Build match filter
      const matchFilter: any = {
        isActive: true
      };

      // For SUPER_ADMIN: if schoolId is provided, filter by it; otherwise get all schools
      // For ADMIN: always filter by schoolId
      if (schoolId) {
        matchFilter.schoolId = new Types.ObjectId(schoolId);
      }
      // If role is SUPER_ADMIN and no schoolId, matchFilter won't have schoolId filter (gets all schools)

      // Search filter
      if (query.search) {
        const regex = { $regex: query.search, $options: 'i' };
        matchFilter.$or = [
          { departmentName: regex },
          { code: regex },
          { description: regex }
        ];
      }

      // Count total departments matching filters
      const countResult = await this.departmentModel
        .aggregate([
          { $match: matchFilter },
          { $count: 'total' }
        ])
        .exec();

      const totalCount = countResult[0]?.total || 0;

      // Fetch departments with pagination
      // latest record first
      const departments = await this.departmentModel
        .find(matchFilter)
        .select('_id departmentName code description schoolId createdAt')
        .populate('schoolId', 'name') // Populate school info if needed
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      const hasNext = page < totalPages;
      const hasPrev = page > 1;

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Departments fetched successfully',
        data: {
          departments,
          pagination: {
            currentPage: page,
            totalCount,
            totalPages,
            limit,
            hasNext,
            hasPrev
          }
        }
      };
    } catch (error) {
      console.error('Error fetching departments:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch departments',
        data: null
      };
    }
  }

  async getDepartmentNames(schoolId: string) {
    try {
      if (!schoolId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null,
        };
      }

      const departments = await this.departmentModel
        .find({ schoolId: new Types.ObjectId(schoolId), isActive: true })
        .select('_id departmentName code')
        .sort({ departmentName: 1 })
        .lean();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Department names fetched successfully',
        data: { departments },
      };
    } catch (error) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error?.message || 'Failed to fetch department names',
        data: null,
      };
    }
  }

  async getDepartmentById(schoolId: string, id: string) {
    try {
      const department = await this.departmentModel
        .findOne({
          _id: new Types.ObjectId(id),
          schoolId: new Types.ObjectId(schoolId),
          isActive: true
        })
        .populate('schoolId', 'name code type address phone email')
        .populate('createdBy', 'firstName lastName email role')
        .lean();

      if (!department) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Department not found',
          data: null
        };
      }

      // Fetch courses for this department using departmentIds
      const coursesRaw = await this.courseModel
        .find({
          schoolId: new Types.ObjectId(schoolId),
          isActive: true,
          departmentIds: new Types.ObjectId(id)
        })
        .select('_id courseName courseCode departmentIds schoolId createdAt')
        .sort({ courseName: 1 })
        .lean();

      const courses = coursesRaw.map((c: any) => {
        const departmentsCount = Array.isArray(c.departmentIds) ? c.departmentIds.length : 0;
        const { departmentIds, ...rest } = c;
        return { ...rest, departmentsCount };
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Department fetched successfully',
        data: {
          department,
          courses
        }
      };
    } catch (error) {
      console.error('Error fetching department:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Failed to fetch department',
        data: null
      };
    }
  }

  async createDepartment(schoolId: string, createdBy: string, departmentData: any, role: string) {
    console.log("schoolId:", schoolId);
    console.log("createdBy:", createdBy);
    console.log("role:", role);
    console.log("departmentData:", departmentData);

    try {
      // Check if department already exists (case-insensitive)
      const escapedName = departmentData.departmentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      console.log("escapedName:", escapedName);

      const existingDepartment = await this.departmentModel.findOne({
        schoolId: new Types.ObjectId(schoolId),
        departmentName: { $regex: new RegExp(`^${escapedName}$`, 'i') }
        // isActive: true
      });

      console.log("existingDepartment:", existingDepartment);

      if (existingDepartment) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'Department with this name already exists',
          data: null
        };
      }

      console.log("existingDepartment:", existingDepartment);

      // Check if code already exists (if provided)
      if (departmentData.code) {
        const existingCode = await this.departmentModel.findOne({
          schoolId: new Types.ObjectId(schoolId),
          code: departmentData.code,
          isActive: true
        });

        if (existingCode) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Department with this code already exists',
            data: null
          };
        }
      }

      const department = new this.departmentModel({
        departmentName: departmentData.departmentName.trim(),
        code: departmentData.code?.trim() || undefined,
        description: departmentData.description?.trim() || undefined,
        schoolId: new Types.ObjectId(schoolId),
        createdBy: new Types.ObjectId(createdBy),
        isActive: true
      });

      await department.save();

      // Log the activity
      const activityData = {
        title: 'Department Created',
        subtitle: `Department ${departmentData.departmentName} was created`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy)
      };

      console.log("activityData:", activityData);

      await this.activityModel.create(activityData);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Department created successfully',
        data: null
      };
    } catch (error) {
      console.error('Error creating department:', error);
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${validationErrors.join(', ')}`,
          data: null
        };
      }
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error.message || 'Failed to create department',
        data: null
      };
    }
  }

  async updateDepartment(schoolId: string, id: string, updateData: any, role: string, adminId: string) {
    try {
      // Check if department exists
      const existingDepartment = await this.departmentModel.findOne({
        _id: new Types.ObjectId(id),
        schoolId: new Types.ObjectId(schoolId),
        isActive: true
      });

      if (!existingDepartment) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Department not found',
          data: null
        };
      }

      // Check if another department with the same name exists (case-insensitive)
      // Only check if the name is actually changing
      if (updateData.departmentName && updateData.departmentName.trim() !== existingDepartment.departmentName) {
        const escapedName = updateData.departmentName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const duplicateName = await this.departmentModel.findOne({
          _id: { $ne: new Types.ObjectId(id) },
          schoolId: new Types.ObjectId(schoolId),
          departmentName: { $regex: new RegExp(`^${escapedName}$`, 'i') },
          isActive: true
        });

        if (duplicateName) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Department with this name already exists in this school',
            data: null
          };
        }
      }

      // Check if another department with the same code exists (if code is provided)
      // Only check if the code is actually changing
      if (updateData.code !== undefined) {
        const newCode = updateData.code?.trim() || undefined;
        const existingCode = existingDepartment.code?.trim() || undefined;

        // Only check for duplicate if code is being changed
        if (newCode !== existingCode) {
          if (newCode) {
            const duplicateCode = await this.departmentModel.findOne({
              _id: { $ne: new Types.ObjectId(id) },
              schoolId: new Types.ObjectId(schoolId),
              code: newCode,
              isActive: true
            });

            if (duplicateCode) {
              return {
                success: false,
                statusCode: HttpStatus.CONFLICT,
                message: 'Department with this code already exists in this school',
                data: null
              };
            }
          }
        }
      }

      // Prepare update object
      const updateObj: any = {};
      if (updateData.departmentName) {
        updateObj.departmentName = updateData.departmentName.trim();
      }
      if (updateData.code !== undefined) {
        updateObj.code = updateData.code?.trim() || undefined;
      }
      if (updateData.description !== undefined) {
        updateObj.description = updateData.description?.trim() || undefined;
      }

      const department = await this.departmentModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId) },
        updateObj,
        { new: true }
      );

      if (!department) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Department not found',
          data: null
        };
      }

      // Log the activity
      const activityData = {
        title: 'Department Updated',
        subtitle: `Department ${department.departmentName} was updated`,
        performBy: role,
        actorId: new Types.ObjectId(adminId),
        adminId: new Types.ObjectId(adminId)
      };

      await this.activityModel.create(activityData);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Department updated successfully',
        data: null
      };
    } catch (error) {
      console.error('Error updating department:', error);

      // Handle MongoDB duplicate key error
      if (error.code === 11000 || error.name === 'MongoError') {
        const errorMessage = error.message || '';

        if (errorMessage.includes('departmentName')) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Department with this name already exists in this school',
            data: null
          };
        } else if (errorMessage.includes('code')) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Department with this code already exists in this school',
            data: null
          };
        } else {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Duplicate key error: A department with this information already exists in this school',
            data: null
          };
        }
      }

      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors || {}).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${validationErrors.join(', ')}`,
          data: null
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error.message || 'Failed to update department',
        data: null
      };
    }
  }

  async deleteDepartment(schoolId: string, id: string, role: string, adminId: string) {
    try {
      // Check if department exists
      const department = await this.departmentModel.findOne({
        _id: new Types.ObjectId(id),
        schoolId: new Types.ObjectId(schoolId),
        isActive: true
      });

      if (!department) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Department not found',
          data: null
        };
      }

      // Check if department has any courses
      const coursesUsingDepartment = await this.courseModel.findOne({
        departmentId: new Types.ObjectId(id),
        schoolId: new Types.ObjectId(schoolId)
      });

      if (coursesUsingDepartment) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'Cannot delete department that has courses assigned to it',
          data: null
        };
      }

      // Soft delete: set isActive to false
      await this.departmentModel.findOneAndUpdate(
        { _id: new Types.ObjectId(id), schoolId: new Types.ObjectId(schoolId) },
        { isActive: false },
        { new: true }
      );

      // Log the activity
      const activityData = {
        title: 'Department Deleted',
        subtitle: `Department ${department.departmentName} was deleted`,
        performBy: role,
        actorId: new Types.ObjectId(adminId),
        adminId: new Types.ObjectId(adminId)
      };

      await this.activityModel.create(activityData);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Department deleted successfully',
        data: null
      };
    } catch (error) {
      console.error('Error deleting department:', error);
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: error.message || 'Failed to delete department',
        data: null
      };
    }
  }

  // ==================== SCHEDULES ====================

  async getSchedules(schoolId: string, query: any): Promise<any[]> {
    try {
      const filter: any = { schoolId };

      // Add query filters
      if (query.class) {
        filter.className = query.class;
      }
      if (query.section) {
        filter.section = query.section;
      }

      const schedules = await this.scheduleModel
        .find(filter)
        .populate('courseId', 'courseName courseCode')
        .populate('teacherId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .exec();

      console.log(`📋 Fetched ${schedules.length} schedules for school ${schoolId}`);
      console.log(`📋 Sample schedule:`, schedules[0] ? {
        id: schedules[0]._id,
        courseId: schedules[0].courseId,
        teacherId: schedules[0].teacherId,
        className: schedules[0].className
      } : 'No schedules found');

      return schedules;
    } catch (error) {
      throw new BadRequestException('Failed to fetch schedules');
    }
  }

  async createSchedule(schoolId: string, createdBy: string, scheduleData: any): Promise<any> {
    try {
      const newSchedule = new this.scheduleModel({
        ...scheduleData,
        schoolId,
        createdBy,
      });

      const savedSchedule = await newSchedule.save();

      // Log activity - use safer field access
      try {
        const activityData = {
          action: 'CREATE_SCHEDULE',
          description: `Created schedule for class ${scheduleData.className || 'Unknown'} section ${scheduleData.section || 'Unknown'}`,
          performBy: 'ADMIN',
          actorId: new Types.ObjectId(createdBy),
          adminId: new Types.ObjectId(createdBy)
        };

        await this.activityModel.create(activityData);
      } catch (activityError) {
        console.error('Failed to log activity for schedule creation:', activityError);
        // Don't throw error for activity logging failure
      }

      return {
        success: true,
        data: savedSchedule,
        message: 'Schedule created successfully'
      };
    } catch (error) {
      console.error('Error creating schedule:', error);
      throw new BadRequestException(`Failed to create schedule: ${error.message}`);
    }
  }

  async updateSchedule(schoolId: string, id: string, updateData: any): Promise<any> {
    try {
      const schedule = await this.scheduleModel.findOne({ _id: id, schoolId });
      if (!schedule) {
        throw new NotFoundException('Schedule not found or not accessible');
      }

      const updatedSchedule = await this.scheduleModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .populate('courseId', 'courseName courseCode')
        .populate('teacherId', 'firstName lastName email');

      return updatedSchedule;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to update schedule');
    }
  }

  async deleteSchedule(schoolId: string, id: string): Promise<any> {
    try {
      const schedule = await this.scheduleModel.findOne({ _id: id, schoolId });
      if (!schedule) {
        throw new NotFoundException('Schedule not found or not accessible');
      }

      await this.scheduleModel.findByIdAndDelete(id);

      return { message: 'Schedule deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Failed to delete schedule');
    }
  }

  // ==================== LESSON PLANS ====================

  async getLessonPlans(schoolId: string | null, query: any = {}, userRole?: string): Promise<any> {
    try {
      // Pagination
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;

      let teachersToUse: any[] = [];

      // For super admin: if schoolId is null/undefined or 'all', get all teachers from all schools
      // Otherwise, filter by the provided schoolId
      if (userRole === 'SUPER_ADMIN' && (!schoolId || schoolId === 'all')) {
        // Get all teachers from all schools
        teachersToUse = await this.userModel.find({
          role: 'TEACHER',
          isActive: true
        }).select('_id firstName lastName').lean();
      } else {
        // Get teachers from specific school (for admin or super admin with schoolId filter)
        const schoolObjectId = new Types.ObjectId(schoolId);
        const schoolTeachers = await this.userModel.find({
          schoolId: schoolObjectId,
          role: 'TEACHER',
          isActive: true
        }).select('_id firstName lastName').lean();

        // Also try finding teachers with string-based schoolId matching as fallback
        const alternativeTeachers = await this.userModel.find({
          schoolId: schoolId,
          role: 'TEACHER',
          isActive: true
        }).select('_id firstName lastName').lean();

        // Use whichever search returned results
        teachersToUse = schoolTeachers.length > 0 ? schoolTeachers : alternativeTeachers;
      }

      if (teachersToUse.length === 0) {
        return {
          data: [],
          pagination: {
            page: 1,
            limit: 10,
            total: 0,
            totalPages: 0
          }
        };
      }

      // Convert teacher IDs to both string and ObjectId formats for compatibility
      const mongoose = require('mongoose');
      const teacherIds = [];
      teachersToUse.forEach(teacher => {
        const teacherIdStr = teacher._id.toString();
        teacherIds.push(teacherIdStr);
        teacherIds.push(new mongoose.Types.ObjectId(teacherIdStr));
      });

      // Build filters with $in operator for multiple teacher IDs
      const filters: any = {
        teacherId: { $in: teacherIds }
      };

      if (query.status && query.status !== 'all') {
        filters.status = query.status;
      }

      // Add search to filters if provided
      const filtersWithSearch: any = { ...filters };
      if (query.search && query.search.trim()) {
        filtersWithSearch.search = query.search.trim();
      }

      // Use lessonPlanService method with pagination
      return await this.lessonPlanService.findAllForAdmin(filtersWithSearch, page, limit);
    } catch (error) {
      console.error('Error getting lesson plans:', error);
      throw new BadRequestException('Failed to fetch lesson plans');
    }
  }

  async getPendingLessonPlans(schoolId: string): Promise<any> {
    return await this.getLessonPlans(schoolId, { status: 'pending' });
  }

  async canTeacherApproveLessonPlans(userId: string, role: string): Promise<boolean> {
    if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN || role === UserRole.SECRETARY) {
      return true;
    }
    if (role !== UserRole.TEACHER) {
      return false;
    }
    const profile = await this.teacherProfileModel.findOne({ userId: new Types.ObjectId(userId) }).lean();
    if (!profile || !profile.designation) {
      return false;
    }
    const d = (profile.designation as string).toLowerCase();
    return d.includes('head teacher') || d.includes('coordinator') || d.includes('department head');
  }

  async getCanApproveLessonPlans(userId: string, role: string): Promise<{ canApprove: boolean }> {
    const canApprove = await this.canTeacherApproveLessonPlans(userId, role);
    return { canApprove };
  }

  async approveLessonPlan(id: string, comments: string, reviewedBy: string, user: { _id: any; role: string }): Promise<any> {
    const canApprove = await this.canTeacherApproveLessonPlans(user._id.toString(), user.role);
    if (!canApprove) {
      throw new ForbiddenException('Only head teachers, coordinators, or department heads can approve lesson plans');
    }
    try {
      return await this.lessonPlanService.approve(id, comments, reviewedBy);
    } catch (error) {
      console.error('Error approving lesson plan:', error);
      throw new BadRequestException('Failed to approve lesson plan');
    }
  }

  async rejectLessonPlan(id: string, feedback: string[], reviewedBy: string, user: { _id: any; role: string }): Promise<any> {
    const canApprove = await this.canTeacherApproveLessonPlans(user._id.toString(), user.role);
    if (!canApprove) {
      throw new ForbiddenException('Only head teachers, coordinators, or department heads can reject lesson plans');
    }
    try {
      return await this.lessonPlanService.reject(id, feedback, reviewedBy);
    } catch (error) {
      console.error('Error rejecting lesson plan:', error);
      throw new BadRequestException('Failed to reject lesson plan');
    }
  }

  async requestLessonPlanRevision(id: string, comments: string[], reviewedBy: string, user: { _id: any; role: string }): Promise<any> {
    const canApprove = await this.canTeacherApproveLessonPlans(user._id.toString(), user.role);
    if (!canApprove) {
      throw new ForbiddenException('Only head teachers, coordinators, or department heads can request lesson plan revisions');
    }
    try {
      return await this.lessonPlanService.requestRevision(id, comments, reviewedBy);
    } catch (error) {
      console.error('Error requesting lesson plan revision:', error);
      throw new BadRequestException('Failed to request lesson plan revision');
    }
  }

  async getLessonPlanStats(schoolId: string | null, userRole?: string): Promise<any> {
    // For super admin: if schoolId is null/undefined or 'all', get stats for all schools
    // Otherwise, filter by the provided schoolId
    if (userRole === 'SUPER_ADMIN' && (!schoolId || schoolId === 'all')) {
      // Return stats for all schools (pass undefined to get all stats)
      return await this.lessonPlanService.getStats(undefined);
    }
    return await this.lessonPlanService.getStats(schoolId);
  }

  // ==================== SECRETARY MANAGEMENT ====================

  async getSecretaries(role: string, schoolId: string, query: any) {
    try {
      const filter: any = {
        role: UserRole.SECRETARY,
        isActive: true
      };

      // Role-based school filtering
      if (role === 'ADMIN' || role === 'SECRETARY') {
        // admin and secretary — always filter by their own schoolId
        if (!schoolId) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'School ID is required',
            data: null
          };
        }
        filter.schoolId = new Types.ObjectId(schoolId);
      } else if (role === 'SUPER_ADMIN') {
        // super admin — may receive schoolId in query, or none (to get all)
        if (query.schoolId) {
          filter.schoolId = new Types.ObjectId(query.schoolId);
        }
      } else {
        // For other roles, require schoolId
        if (!schoolId) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'School ID is required',
            data: null
          };
        }
        filter.schoolId = new Types.ObjectId(schoolId);
      }

      // Search conditions
      const searchConditions = [];
      if (query.search) {
        searchConditions.push(
          { firstName: { $regex: query.search, $options: 'i' } },
          { lastName: { $regex: query.search, $options: 'i' } },
          { email: { $regex: query.search, $options: 'i' } }
        );
      }

      if (searchConditions.length > 0) {
        filter.$or = searchConditions;
      }

      // Pagination
      const page = parseInt(query.page) || 1;
      const limit = parseInt(query.limit) || 10;
      const skip = (page - 1) * limit;

      // Total count
      const totalSecretaries = await this.userModel.countDocuments(filter);

      // Fetch data
      const secretaries = await this.userModel
        .find(filter)
        .select('-password -refreshTokens')
        .populate('schoolId', 'name schoolCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Secretaries fetched successfully',
        data: {
          secretaries,
          pagination: getPaginationMeta(page, limit, totalSecretaries)
        }
      };
    } catch (error) {
      console.error('Error getting secretaries:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to fetch secretaries',
        data: null
      };
    }
  }

  async createSecretary(createdBy: string, role: string, secretaryData: any, schoolId: string) {
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      if (!schoolId) {
        await session.abortTransaction();
        await session.endSession();
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null
        };
      }

      // Check if secretary already exists for this school (only one per school)
      const existingSecretary = await this.userModel.findOne({
        schoolId: new Types.ObjectId(schoolId),
        role: UserRole.SECRETARY,
        isActive: true
      }).lean();

      if (existingSecretary) {
        await session.abortTransaction();
        await session.endSession();
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'A secretary is already assigned to this school. Please delete the existing secretary first.',
          data: null
        };
      }

      // Check if email already exists
      const existingUser = await this.userModel.findOne({
        email: secretaryData.email.toLowerCase(),
        role: UserRole.SECRETARY
      }).lean();

      if (existingUser) {
        await session.abortTransaction();
        await session.endSession();
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'Secretary with this email already exists',
          data: null
        };
      }

      const newPassword = secretaryData.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      // Create user account for secretary
      const userDoc: any = {
        firstName: secretaryData.firstName,
        lastName: secretaryData.lastName,
        email: secretaryData.email.toLowerCase(),
        password: newPassword,
        role: UserRole.SECRETARY,
        schoolId: new Types.ObjectId(schoolId),
        isActive: true,
        createdBy: new Types.ObjectId(createdBy),
        mustChangePassword: true,
        passwordLastChanged: new Date()
      };
      
      if (secretaryData.phone !== undefined) userDoc.phone = secretaryData.phone;
      if (secretaryData.address !== undefined) userDoc.address = secretaryData.address;

      const secretary = new this.userModel(userDoc);
      const savedSecretary = await secretary.save({ session });

      // Log activity
      await this.activityModel.create({
        title: 'Secretary Created',
        subtitle: `Created secretary: ${secretaryData.firstName} ${secretaryData.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(createdBy),
        adminId: new Types.ObjectId(createdBy),
        action: 'CREATE_SECRETARY',
        entityType: UserRole.SECRETARY,
        entityId: savedSecretary._id,
        metadata: { email: savedSecretary.email, schoolId: schoolId }
      });

      // Commit the transaction
      await session.commitTransaction();
      await session.endSession();

      // Send welcome email (outside transaction to avoid blocking)
      try {
        await this.emailService.sendWelcomeEmail(
          savedSecretary.email,
          savedSecretary.firstName,
          savedSecretary.lastName,
          savedSecretary.role,
          newPassword,
        );
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${savedSecretary.email}:`, emailError);
        // Don't fail the creation if email fails
      }

      const { password, refreshTokens, ...secretaryWithoutPassword } = savedSecretary.toObject();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Secretary created successfully',
        data: secretaryWithoutPassword
      };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      console.error('Error in createSecretary:', error);
      
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${validationErrors.join(', ')}`,
          data: null
        };
      }
      
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to create secretary',
        data: null
      };
    }
  }

  async updateSecretary(secretaryId: string, updateData: any, schoolId: string, role: string, roleId: string) {
    try {
      const existingUser = await this.userModel.findById(secretaryId).lean();
      
      if (!existingUser || existingUser.role !== UserRole.SECRETARY as any) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Secretary not found',
          data: null
        };
      }

      // For SUPER_ADMIN, allow editing any secretary
      // For ADMIN, verify secretary belongs to the same school
      if (role !== 'SUPER_ADMIN') {
        // Normalize both schoolIds to strings for comparison
        const secretarySchoolIdStr = existingUser.schoolId 
          ? (existingUser.schoolId instanceof Types.ObjectId ? existingUser.schoolId.toString() : String(existingUser.schoolId))
          : '';
        const adminSchoolIdStr = schoolId 
          ? String(schoolId)
          : '';
        
        // If both have schoolIds and they don't match, deny access
        if (secretarySchoolIdStr && adminSchoolIdStr && secretarySchoolIdStr !== adminSchoolIdStr) {
          console.log('Permission denied - schoolId mismatch:', { secretarySchoolIdStr, adminSchoolIdStr });
          return {
            success: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You do not have permission to update this secretary',
            data: null
          };
        }
      }

      // Email should not be updated - it's disabled in frontend
      // But if someone tries to update it via API, check if it already exists
      if (updateData.email && updateData.email.toLowerCase() !== existingUser.email.toLowerCase()) {
        const emailExists = await this.userModel.findOne({
          email: updateData.email.toLowerCase(),
          role: UserRole.SECRETARY,
          _id: { $ne: new Types.ObjectId(secretaryId) }
        }).lean();

        if (emailExists) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Secretary with this email already exists',
            data: null
          };
        }
      }

      // Prepare update object - email should not be updated
      const updateObj: any = {
        updatedBy: new Types.ObjectId(roleId),
      };

      if (updateData.firstName !== undefined) updateObj.firstName = updateData.firstName;
      if (updateData.lastName !== undefined) updateObj.lastName = updateData.lastName;
      // Email is not updated - it's disabled in edit mode
      // if (updateData.email !== undefined) updateObj.email = updateData.email.toLowerCase();
      if (updateData.phone !== undefined) updateObj.phone = updateData.phone;
      if (updateData.address !== undefined) updateObj.address = updateData.address;

      await this.userModel.updateOne(
        { _id: new Types.ObjectId(secretaryId) },
        { $set: updateObj }
      );

      // Log activity
      await this.activityModel.create({
        title: 'Secretary Updated',
        subtitle: `Updated secretary: ${updateData.firstName || existingUser.firstName} ${updateData.lastName || existingUser.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(roleId),
        adminId: new Types.ObjectId(roleId),
        action: 'UPDATE_SECRETARY',
        entityType: UserRole.SECRETARY,
        entityId: secretaryId
      });

      const updatedSecretary = await this.userModel.findById(secretaryId).select('-password -refreshTokens').lean();

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Secretary updated successfully',
        data: updatedSecretary
      };
    } catch (error) {
      console.error('Error updating secretary:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to update secretary',
        data: null
      };
    }
  }

  async deleteSecretary(secretaryId: string, schoolId: string, role: string, roleId: string) {
    try {
      const existingUser = await this.userModel.findById(secretaryId).lean();
      
      if (!existingUser || existingUser.role !== UserRole.SECRETARY as any) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Secretary not found',
          data: null
        };
      }

      // For SUPER_ADMIN, allow deleting any secretary
      // For ADMIN, verify secretary belongs to the same school
      if (role !== 'SUPER_ADMIN') {
        // Normalize both schoolIds to strings for comparison
        const secretarySchoolIdStr = existingUser.schoolId 
          ? (existingUser.schoolId instanceof Types.ObjectId ? existingUser.schoolId.toString() : String(existingUser.schoolId))
          : '';
        const adminSchoolIdStr = schoolId 
          ? String(schoolId)
          : '';
        
        // If both have schoolIds and they don't match, deny access
        if (secretarySchoolIdStr && adminSchoolIdStr && secretarySchoolIdStr !== adminSchoolIdStr) {
          console.log('Permission denied - schoolId mismatch:', { secretarySchoolIdStr, adminSchoolIdStr });
          return {
            success: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You do not have permission to delete this secretary',
            data: null
          };
        }
      }

      // Soft delete - set isActive to false
      await this.userModel.updateOne(
        { _id: new Types.ObjectId(secretaryId) },
        { 
          $set: { 
            isActive: false,
            updatedBy: new Types.ObjectId(roleId)
          } 
        }
      );

      // Log activity
      await this.activityModel.create({
        title: 'Secretary Deleted',
        subtitle: `Deleted secretary: ${existingUser.firstName} ${existingUser.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(roleId),
        adminId: new Types.ObjectId(roleId),
        action: 'DELETE_SECRETARY',
        entityType: UserRole.SECRETARY,
        entityId: secretaryId
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Secretary deleted successfully',
        data: null
      };
    } catch (error) {
      console.error('Error deleting secretary:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to delete secretary',
        data: null
      };
    }
  }

  async changeSecretaryPassword(secretaryId: string, password: string, schoolId: string, role: string, roleId: string) {
    try {
      const existingUser = await this.userModel.findById(secretaryId).lean();
      
      if (!existingUser || existingUser.role !== UserRole.SECRETARY as any) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Secretary not found',
          data: null
        };
      }

      // For SUPER_ADMIN, allow changing password for any secretary
      // For ADMIN, verify secretary belongs to the same school
      if (role !== 'SUPER_ADMIN') {
        // Normalize both schoolIds to strings for comparison
        const secretarySchoolIdStr = existingUser.schoolId 
          ? (existingUser.schoolId instanceof Types.ObjectId ? existingUser.schoolId.toString() : String(existingUser.schoolId))
          : '';
        const adminSchoolIdStr = schoolId 
          ? String(schoolId)
          : '';
        
        // If both have schoolIds and they don't match, deny access
        if (secretarySchoolIdStr && adminSchoolIdStr && secretarySchoolIdStr !== adminSchoolIdStr) {
          console.log('Permission denied - schoolId mismatch:', { secretarySchoolIdStr, adminSchoolIdStr });
          return {
            success: false,
            statusCode: HttpStatus.FORBIDDEN,
            message: 'You do not have permission to change this secretary\'s password',
            data: null
          };
        }
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      await this.userModel.updateOne(
        { _id: new Types.ObjectId(secretaryId) },
        { 
          $set: { 
            password: hashedPassword,
            passwordLastChanged: new Date(),
            updatedBy: new Types.ObjectId(roleId)
          } 
        }
      );

      // Log activity
      await this.activityModel.create({
        title: 'Secretary Password Changed',
        subtitle: `Changed password for secretary: ${existingUser.firstName} ${existingUser.lastName}`,
        performBy: role,
        actorId: new Types.ObjectId(roleId),
        adminId: new Types.ObjectId(roleId),
        action: 'CHANGE_SECRETARY_PASSWORD',
        entityType: UserRole.SECRETARY,
        entityId: secretaryId
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Secretary password changed successfully',
        data: null
      };
    } catch (error) {
      console.error('Error changing secretary password:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to change secretary password',
        data: null
      };
    }
  }

  // ==================== PASSWORD MANAGEMENT ====================

  /**
   * Get all users from admin's school (excluding SUPER_ADMIN and current admin)
   */
  async getSchoolUsers(
    schoolId: string,
    adminId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: string
  ): Promise<any> {
    try {
      const skip = (page - 1) * limit;
      const queryConditions: any[] = [];

      console.log('🔍 Admin getSchoolUsers called with params:', { schoolId, adminId, page, limit, search, role });

      // Always filter by school
      if (!schoolId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School ID is required',
          data: null,
        };
      }

      queryConditions.push({ schoolId: new Types.ObjectId(schoolId) });

      // Exclude SUPER_ADMIN role
      queryConditions.push({ role: { $ne: 'SUPER_ADMIN' } });

      // Exclude current admin
      queryConditions.push({ _id: { $ne: new Types.ObjectId(adminId) } });

      // Build role filter (if provided and not 'all')
      if (role && role !== 'all' && role.trim() !== '') {
        queryConditions.push({ role: role.trim() });
        console.log('✅ Role filter applied:', role.trim());
      }

      // Build search condition
      if (search && search.trim()) {
        const searchTrimmed = search.trim();
        const escapedSearch = searchTrimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const searchCondition = {
          $or: [
            { firstName: { $regex: escapedSearch, $options: 'i' } },
            { lastName: { $regex: escapedSearch, $options: 'i' } },
            { email: { $regex: escapedSearch, $options: 'i' } },
          ]
        };
        queryConditions.push(searchCondition);
        console.log('✅ Search filter applied:', searchTrimmed);
      }

      // Build final query
      const query = queryConditions.length > 1 ? { $and: queryConditions } : queryConditions[0];

      console.log('📊 Final MongoDB query:', JSON.stringify(query, null, 2));

      const users = await this.userModel
        .find(query)
        .populate('schoolId', 'name code')
        .select('firstName lastName email role lastLogin failedLoginAttempts mfaEnabled isActive schoolId accountLocked mustChangePassword passwordLastChanged createdAt')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean();

      const totalUsers = await this.userModel.countDocuments(query);
      console.log('📈 Total users found:', totalUsers);

      // Add computed fields for each user
      const usersWithExtraInfo = users.map(user => ({
        ...user,
        fullName: `${user.firstName} ${user.lastName}`,
        schoolName: user.schoolId && typeof user.schoolId === 'object' ? (user.schoolId as any).name : (user.schoolId ? 'School' : 'No School'),
        status: user.isActive ? 'Active' : 'Inactive',
        lastLoginFormatted: user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never',
        createdAtFormatted: (user as any).createdAt ? new Date((user as any).createdAt).toLocaleDateString() : 'Unknown',
        failedLoginAttempts: user.failedLoginAttempts || 0,
        mfaEnabled: user.mfaEnabled || false
      }));

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Users fetched successfully',
        data: {
          users: usersWithExtraInfo,
          pagination: getPaginationMeta(page, limit, totalUsers),
        }
      };
    } catch (error) {
      console.error('Error fetching school users:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch users',
        data: null,
      };
    }
  }

  /**
   * Reset password for a user in admin's school
   */
  async resetUserPassword(
    userId: string,
    schoolId: string,
    adminId: string,
    newPassword: string
  ): Promise<any> {
    try {
      // Verify user exists and belongs to admin's school
      // Also verify it's not the current admin
      if (userId === adminId) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'You cannot reset your own password through this interface',
          data: null,
        };
      }

      const user = await this.userModel.findOne({
        _id: new Types.ObjectId(userId),
        schoolId: new Types.ObjectId(schoolId),
        role: { $ne: 'SUPER_ADMIN' }
      });

      if (!user) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'User not found or you do not have permission to reset this user\'s password',
          data: null,
        };
      }

      // Validate password
      if (!newPassword || newPassword.length < 6) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Password must be at least 6 characters long',
          data: null,
        };
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Update user with new password
      await this.userModel.updateOne(
        { _id: new Types.ObjectId(userId) },
        {
          password: hashedPassword,
          failedLoginAttempts: 0,
          accountLocked: false,
          lockoutUntil: null,
          mustChangePassword: true,
          passwordLastChanged: new Date()
        }
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Password reset successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error resetting user password:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to reset password',
        data: null,
      };
    }
  }

  // ==================== REPORTS MANAGEMENT ====================

  private generatedReports: Map<string, any> = new Map();

  getReportById(id: string): any {
    return this.generatedReports.get(id) || null;
  }

  async getAllReports(
    schoolId: string,
    adminId: string,
    page: number = 1,
    limit: number = 10,
    status?: string,
    type?: string
  ): Promise<any> {
    try {
      // Convert schoolId to string for comparison
      const schoolIdStr = String(schoolId);
      
      console.log('🔍 Fetching reports for schoolId:', schoolIdStr);
      console.log('📦 Total reports in memory:', this.generatedReports.size);
      
      // Get generated reports from memory, filtered by schoolId
      const allReports = Array.from(this.generatedReports.values());
      console.log('📋 All reports before filtering:', allReports.map(r => ({
        _id: r._id,
        name: r.name,
        schoolIds: r.parameters?.schoolIds
      })));
      
      const reportsArray = allReports
        .filter(report => {
          // Filter by schoolId - check if report parameters include this school
          const reportSchoolIds = report.parameters?.schoolIds || [];
          
          // If no schoolIds in parameters, it's a general report (shouldn't show for admin)
          if (reportSchoolIds.length === 0) {
            return false;
          }
          
          // Check if any of the report's schoolIds match the admin's schoolId
          const matches = reportSchoolIds.some((id: any) => String(id) === schoolIdStr);
          
          if (matches) {
            console.log('✅ Report matches:', {
              reportId: report._id,
              name: report.name,
              reportSchoolIds: reportSchoolIds,
              adminSchoolId: schoolIdStr
            });
          }
          
          return matches;
        });
      
      console.log('📊 Filtered reports count:', reportsArray.length);

      // Filter by status if provided
      let filteredReports = reportsArray;
      if (status && status !== 'all') {
        filteredReports = reportsArray.filter(report => report.status === status);
      }
      
      // Filter by type if provided
      if (type && type !== 'all') {
        filteredReports = filteredReports.filter(report => report.type === type);
      }

      // Sort by creation date (newest first)
      filteredReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Paginate
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedReports = filteredReports.slice(startIndex, endIndex);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Reports fetched successfully',
        data: {
          reports: paginatedReports,
          totalPages: Math.ceil(filteredReports.length / limit),
          currentPage: page,
          totalReports: filteredReports.length
        }
      };
    } catch (error) {
      console.error('Error fetching reports:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch reports',
        data: null,
      };
    }
  }

  async getSchoolIdForAdmin(adminId: string): Promise<string | null> {
    const user = await this.userModel.findById(adminId).select('schoolId').lean().exec();
    if (!user?.schoolId) return null;
    const raw = (user as any).schoolId;
    return typeof raw === 'object' && raw?._id != null ? String(raw._id) : String(raw);
  }

  /**
   * Generate report for admin's school
   */
  async generateReport(
    schoolId: string,
    adminId: string,
    adminInfo: { firstName?: string; lastName?: string; email?: string },
    reportData: any
  ): Promise<any> {
    try {
      const { name, type, description, dataSource, columns, filters, status } = reportData;

      // Generate unique ID for the report
      const reportId = `admin_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Generate the actual report content based on type
      let reportContent = '';
      let fileSize = 0;

      // Always include admin's schoolId in parameters (convert to string to ensure consistency)
      const schoolIdStr = String(schoolId);
      const parameters: any = {
        schoolIds: [schoolIdStr],
        dateRange: filters?.find((f: any) => f.field === 'createdAt') ? {
          start: filters.find((f: any) => f.field === 'createdAt' && f.operator === 'greater_equal')?.value,
          end: filters.find((f: any) => f.field === 'createdAt' && f.operator === 'less_equal')?.value
        } : undefined,
        userRoles: reportData.userRoles || []
      };
      if (type === 'attendance') {
        parameters.attendanceGroupBy = reportData.attendanceGroupBy || 'all';
        parameters.attendanceGradeLevel = reportData.attendanceGradeLevel;
        parameters.attendanceSection = reportData.attendanceSection;
        parameters.attendanceTeacherId = reportData.attendanceTeacherId;
        parameters.attendanceStudentId = reportData.attendanceStudentId;
      }

      switch (type) {
        case 'student':
          reportContent = await this.generateStudentReport(schoolId, parameters);
          break;
        case 'teacher':
          reportContent = await this.generateTeacherReport(schoolId, parameters);
          break;
        case 'parent':
          reportContent = await this.generateParentReport(schoolId, parameters);
          break;
        case 'attendance':
          reportContent = await this.generateAttendanceReport(schoolId, parameters);
          break;
        case 'grade':
        case 'academic-performance':
          reportContent = await this.generateGradeReport(schoolId, parameters);
          break;
        case 'behavior':
          reportContent = await this.generateBehaviorReport(schoolId, parameters);
          break;
        case 'club':
          reportContent = await this.generateClubReport(schoolId, parameters);
          break;
        case 'sports':
          reportContent = await this.generateSportsReport(schoolId, parameters);
          break;
        case 'course':
          reportContent = await this.generateCourseReport(schoolId, parameters);
          break;
        default:
          throw new Error('Unsupported report type');
      }

      fileSize = Buffer.byteLength(reportContent, 'utf8');

      // Create report metadata
      const report = {
        _id: reportId,
        name: name || `${type} Report`,
        type: type,
        description: description || `Generated ${type} report for school`,
        parameters: parameters,
        status: status || 'draft',
        fileUrl: `/admin/reports/${reportId}.csv`,
        fileSize: fileSize,
        content: reportContent,
        createdBy: {
          firstName: adminInfo.firstName || 'Admin',
          lastName: adminInfo.lastName || '',
          email: adminInfo.email || ''
        },
        createdAt: new Date().toISOString(),
        completedAt: status === 'completed' ? new Date().toISOString() : undefined
      };

      // Store the report in memory
      this.generatedReports.set(reportId, report);

      console.log('📊 Report created and stored:', {
        reportId: report._id,
        name: report.name,
        schoolIds: report.parameters.schoolIds,
        status: report.status
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Report created successfully',
        data: {
          _id: report._id,
          name: report.name,
          type: report.type,
          description: report.description,
          status: report.status,
          fileSize: report.fileSize,
          createdAt: report.createdAt
        }
      };
    } catch (error) {
      console.error('Report generation error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to generate report',
        data: null,
      };
    }
  }

  /**
   * Execute Report - Generates report content and updates status
   */
  async executeReport(
    reportId: string,
    schoolId: string,
    adminId: string,
    adminInfo: { firstName?: string; lastName?: string; email?: string },
    existingReport: any
  ): Promise<any> {
    try {
      // Generate the actual report content based on type
      let reportContent = '';
      let fileSize = 0;

      const schoolIdStr = String(schoolId);
      const parameters = existingReport.parameters || {
        schoolIds: [schoolIdStr],
        dateRange: existingReport.parameters?.dateRange,
        userRoles: existingReport.parameters?.userRoles || []
      };

      // Ensure schoolId is in parameters
      if (!parameters.schoolIds || !parameters.schoolIds.includes(schoolIdStr)) {
        parameters.schoolIds = [schoolIdStr];
      }

      const reportType = existingReport.type;

      switch (reportType) {
        case 'student':
          reportContent = await this.generateStudentReport(schoolId, parameters);
          break;
        case 'teacher':
          reportContent = await this.generateTeacherReport(schoolId, parameters);
          break;
        case 'parent':
          reportContent = await this.generateParentReport(schoolId, parameters);
          break;
        case 'attendance':
          reportContent = await this.generateAttendanceReport(schoolId, parameters);
          break;
        case 'grade':
        case 'academic-performance':
          reportContent = await this.generateGradeReport(schoolId, parameters);
          break;
        case 'behavior':
          reportContent = await this.generateBehaviorReport(schoolId, parameters);
          break;
        case 'club':
          reportContent = await this.generateClubReport(schoolId, parameters);
          break;
        case 'sports':
          reportContent = await this.generateSportsReport(schoolId, parameters);
          break;
        case 'course':
          reportContent = await this.generateCourseReport(schoolId, parameters);
          break;
        default:
          throw new Error('Unsupported report type');
      }

      fileSize = Buffer.byteLength(reportContent, 'utf8');

      // Update the existing report with completed status and content
      const updatedReport = {
        ...existingReport,
        status: 'completed',
        fileSize: fileSize,
        content: reportContent,
        completedAt: new Date().toISOString()
      };

      // Store the updated report in memory
      this.generatedReports.set(reportId, updatedReport);

      console.log('📊 Report executed and stored:', {
        reportId: reportId,
        name: updatedReport.name,
        status: updatedReport.status,
        fileSize: updatedReport.fileSize
      });

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Report execution started',
        data: {
          executionId: reportId,
          status: 'completed'
        }
      };
    } catch (error) {
      console.error('Report execution error:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to execute report',
        data: null,
      };
    }
  }

  /**
   * Generate Student Report
   */
  private async generateStudentReport(schoolId: string, parameters: any): Promise<string> {
    try {
      // Convert schoolId to ObjectId
      const schoolIdObj = new Types.ObjectId(schoolId);
      
      const query: any = { 
        schoolId: schoolIdObj,
        role: 'STUDENT'
      };
      
      // Don't filter by isActive - include all students for reports
      // if (parameters.includeInactive !== true) {
      //   query.isActive = { $ne: false };
      // }

      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        query.createdAt = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      console.log('📊 Generating student report with query:', JSON.stringify(query, null, 2));
      
      const students = await this.studentModel.find(query).lean();
      
      console.log(`📊 Found ${students.length} students for schoolId: ${schoolId}`);

      let csv = 'Student ID,First Name,Last Name,Email,Class,Section,Gender,Date of Birth,Status\n';
      
      if (students.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Students,0\n';
        console.log('⚠️ No students found for this school');
        return csv;
      }
      
      for (const student of students) {
        const studentData = student as any;
        const csvRow = [
          studentData.studentId || studentData._id?.toString() || '',
          studentData.firstName || '',
          studentData.lastName || '',
          studentData.email || '',
          studentData.class || studentData.gradeLevel || '',
          studentData.section || '',
          studentData.gender || '',
          studentData.dateOfBirth ? new Date(studentData.dateOfBirth).toLocaleDateString() : '',
          studentData.isActive !== false ? 'Active' : 'Inactive'
        ];
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Students,${students.length}\n`;
      console.log(`✅ Student report generated with ${students.length} students`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating student report:', error);
      throw error;
    }
  }

  /**
   * Generate Teacher Report
   */
  private async generateTeacherReport(schoolId: string, parameters: any): Promise<string> {
    try {
      const schoolIdObj = new Types.ObjectId(schoolId);
      
      // Build aggregation pipeline starting from User collection (where firstName, lastName, email are stored)
      const pipeline: any[] = [
        {
          $match: {
            role: UserRole.TEACHER,
            schoolId: schoolIdObj,
            isActive: true
          }
        }
      ];

      // Add date range filter if provided
      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        pipeline[0].$match.createdAt = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      // Lookup Teacher collection to get employeeId, designation, etc.
      pipeline.push({
        $lookup: {
          from: 'teachers',
          localField: '_id',
          foreignField: 'userId',
          as: 'teacher'
        }
      });
      
      pipeline.push({ 
        $unwind: { 
          path: '$teacher', 
          preserveNullAndEmptyArrays: true 
        } 
      });

      // Project required fields (matching getTeachers pattern)
      pipeline.push({
        $project: {
          _id: 1,
          firstName: 1,
          lastName: 1,
          email: 1,
          isActive: 1,
          employeeId: '$teacher.employeeId',
          designation: '$teacher.designation'
        }
      });

      console.log('📊 Generating teacher report with pipeline:', JSON.stringify(pipeline, null, 2));
      
      const teachers = await this.userModel.aggregate(pipeline).exec();
      
      console.log(`📊 Found ${teachers.length} teachers for schoolId: ${schoolId}`);
      if (teachers.length > 0) {
        console.log('📊 Sample teacher data (raw):', JSON.stringify(teachers[0], null, 2));
      }

      // CSV header - Department column is intentionally excluded
      let csv = 'Employee ID,First Name,Last Name,Email,Designation,Status\n';
      
      if (teachers.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Teachers,0\n';
        return csv;
      }
      
      for (const teacher of teachers) {
        const teacherData = teacher as any;
        
        // Log each teacher's data for debugging
        console.log('📊 Processing teacher:', {
          _id: teacherData._id,
          firstName: teacherData.firstName,
          lastName: teacherData.lastName,
          email: teacherData.email,
          employeeId: teacherData.employeeId,
          designation: teacherData.designation
        });
        
        const csvRow = [
          teacherData.employeeId || teacherData._id?.toString() || '',
          teacherData.firstName || '',
          teacherData.lastName || '',
          teacherData.email || '',
          teacherData.designation || '',
          teacherData.isActive !== false ? 'Active' : 'Inactive'
        ];
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Teachers,${teachers.length}\n`;
      console.log(`✅ Teacher report generated with ${teachers.length} teachers`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating teacher report:', error);
      throw error;
    }
  }

  /**
   * Generate Parent Report
   */
  private async generateParentReport(schoolId: string, parameters: any): Promise<string> {
    try {
      const schoolIdObj = new Types.ObjectId(schoolId);
      
      // Base match (same as getParents method)
      const baseMatch: any = {
        role: 'PARENT',
        isActive: true
      };

      // Add date range filter if provided
      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        baseMatch.createdAt = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      // Add gender filter if provided
      if (parameters.gender && parameters.gender !== 'all') {
        baseMatch.gender = parameters.gender;
      }

      // Build filter for Parent model (for schoolId and parentType)
      const parentFilter: any = {};
      
      // For ADMIN: Filter by schoolId in belongToSchools array where isActive: true
      parentFilter['belongToSchools.schoolId'] = schoolIdObj;
      parentFilter['belongToSchools.isActive'] = true;

      // Add parentType filter if provided
      if (parameters.parentType && parameters.parentType !== 'all') {
        parentFilter.parentType = parameters.parentType;
      }

      // Get restricted userIds from Parent model (same as getParents)
      let restrictedUserIds: any[] = [];
      
      const aggregation = [
        {
          $match: parentFilter.parentType ? { parentType: parentFilter.parentType } : {}
        },
        {
          $match: {
            belongToSchools: {
              $elemMatch: {
                schoolId: schoolIdObj,
                isActive: true
              }
            }
          }
        },
        {
          $project: { userId: 1 }
        }
      ];
      
      const parentDocs = await this.parentModel.aggregate(aggregation).exec();
      
      if (parentDocs.length === 0) {
        let csv = 'Name,Email,Phone,Gender,Type,Children,Primary Contact,Status\n';
        csv += '\n--- SUMMARY ---\nTotal Parents,0\n';
        return csv;
      }
      
      restrictedUserIds = parentDocs.map(p => p.userId);

      // Build final match
      const finalMatch: any = { ...baseMatch };
      if (restrictedUserIds.length > 0) {
        finalMatch._id = { $in: restrictedUserIds };
      }

      // Build children count filter (for admin's school only)
      const childrenCountMatch: any[] = [
        { $eq: ['$role', 'STUDENT'] },
        { $eq: ['$isActive', true] },
        { $in: ['$$parentId', '$parentIds'] },
        { $eq: ['$schoolId', schoolIdObj] }
      ];

      // Main aggregation (same as getParents, but without pagination)
      const mainAggregation: any[] = [
        { $match: finalMatch },
        { $sort: { createdAt: -1 } },

        // Lookup parent info
        {
          $lookup: {
            from: 'parents',
            localField: '_id',
            foreignField: 'userId',
            as: 'parentInfo',
            pipeline: [
              { $match: parameters.parentType && parameters.parentType !== 'all' ? { parentType: parameters.parentType } : {} },
              {
                $project: {
                  parentType: 1,
                  isPrimaryContact: 1,
                  hasPickupPermission: 1
                }
              }
            ]
          }
        },
        { $unwind: { path: '$parentInfo', preserveNullAndEmptyArrays: true } },

        // Count children (for admin's school only)
        {
          $lookup: {
            from: 'users',
            let: { parentId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: childrenCountMatch
                  }
                }
              },
              { $count: 'count' }
            ],
            as: 'childCount'
          }
        },
        {
          $addFields: {
            numberOfChildren: { $ifNull: [{ $arrayElemAt: ['$childCount.count', 0] }, 0] }
          }
        },

        // Final projection (same as getParents)
        {
          $project: {
            _id: 1,
            email: 1,
            firstName: 1,
            lastName: 1,
            isActive: 1,
            phone: 1,
            address: 1,
            gender: 1,
            parentType: '$parentInfo.parentType',
            isPrimaryContact: { $ifNull: ['$parentInfo.isPrimaryContact', false] },
            hasPickupPermission: { $ifNull: ['$parentInfo.hasPickupPermission', false] },
            numberOfChildren: 1
          }
        }
      ];

      console.log('📊 Generating parent report with aggregation:', JSON.stringify(mainAggregation, null, 2));
      
      const parents = await this.userModel.aggregate(mainAggregation).exec();
      
      console.log(`📊 Found ${parents.length} parents for schoolId: ${schoolId}`);
      if (parents.length > 0) {
        console.log('📊 Sample parent data:', JSON.stringify(parents[0], null, 2));
      }

      let csv = 'Name,Email,Phone,Gender,Type,Children,Primary Contact,Status\n';
      
      if (parents.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Parents,0\n';
        return csv;
      }
      
      for (const parent of parents) {
        const parentData = parent as any;
        
        // Log each parent's data for debugging
        console.log('📊 Processing parent:', {
          _id: parentData._id,
          name: `${parentData.firstName} ${parentData.lastName}`,
          email: parentData.email,
          phone: parentData.phone,
          gender: parentData.gender,
          parentType: parentData.parentType,
          numberOfChildren: parentData.numberOfChildren,
          isPrimaryContact: parentData.isPrimaryContact
        });
        
        const csvRow = [
          `${parentData.firstName || ''} ${parentData.lastName || ''}`.trim() || 'N/A',
          parentData.email || 'N/A',
          parentData.phone || 'N/A',
          parentData.gender || 'N/A',
          parentData.parentType || 'N/A',
          (parentData.numberOfChildren || 0).toString(),
          parentData.isPrimaryContact ? 'Yes' : 'No',
          parentData.isActive !== false ? 'Active' : 'Inactive'
        ];
        
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Parents,${parents.length}\n`;
      console.log(`✅ Parent report generated with ${parents.length} parents`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating parent report:', error);
      throw error;
    }
  }

  /**
   * Generate Attendance Report (Late, Absent, Excused) with optional filter by grade, class, teacher, student, or all
   */
  private async generateAttendanceReport(schoolId: string, parameters: any): Promise<string> {
    const groupBy = parameters.attendanceGroupBy || 'all';
    const filters: any = {
      startDate: parameters.dateRange?.start,
      endDate: parameters.dateRange?.end
    };
    if (groupBy === 'grade' && parameters.attendanceGradeLevel) filters.gradeLevel = parameters.attendanceGradeLevel;
    if (groupBy === 'class' && parameters.attendanceSection) filters.class = parameters.attendanceSection;
    if (groupBy === 'teacher' && parameters.attendanceTeacherId) filters.teacherId = parameters.attendanceTeacherId;
    if (groupBy === 'student' && parameters.attendanceStudentId) filters.studentId = parameters.attendanceStudentId;

    const [lateRes, absentRes, excusedRes] = await Promise.all([
      this.attendanceService.generateLateReport(schoolId, filters),
      this.attendanceService.generateAbsentReport(schoolId, filters),
      this.attendanceService.generateExcusedReport(schoolId, filters)
    ]);

    const header = 'Student Name,Grade,Section,Date,Status,Course,Teacher,Note/Reason\n';
    const rows: string[] = [];
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    (lateRes.data || []).forEach((r: any) => {
      rows.push([r.studentName, r.gradeLevel, r.section, r.date, 'Late', r.course, r.teacher, r.note || ''].map(escape).join(','));
    });
    (absentRes.data || []).forEach((r: any) => {
      rows.push([r.studentName, r.gradeLevel, r.section, r.date, 'Absent', r.course, r.teacher, r.note || ''].map(escape).join(','));
    });
    (excusedRes.data || []).forEach((r: any) => {
      rows.push([r.studentName, r.gradeLevel, r.section, r.date, 'Excused', r.course, r.teacher, r.reason || r.note || ''].map(escape).join(','));
    });

    let csv = header + rows.join('\n');
    csv += `\n--- SUMMARY ---\nLate: ${(lateRes.totalRecords || 0)}, Absent: ${(absentRes.totalRecords || 0)}, Excused: ${(excusedRes.totalRecords || 0)}\n`;
    return csv;
  }

  /**
   * Generate Grade Report
   */
  private async generateGradeReport(schoolId: string, parameters: any): Promise<string> {
    // This is a simplified version - you may need to adjust based on your grades schema
    let csv = 'Student Name,Course,Grade,Percentage\n';
    csv += '\n--- SUMMARY ---\nNote: Grade data will be populated based on your grades schema\n';
    return csv;
  }

  /**
   * Generate Behavior Report
   */
  private async generateBehaviorReport(schoolId: string, parameters: any): Promise<string> {
    try {
      const schoolIdObj = new Types.ObjectId(schoolId);
      const query: any = { 
        schoolId: schoolIdObj
      };

      // Add date range filter if provided
      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        query.date = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      // Add status filter if provided
      if (parameters.status) {
        query.status = parameters.status;
      }

      // Add type filter if provided
      if (parameters.type) {
        query.type = parameters.type;
      }

      console.log('📊 Generating behavior report with query:', JSON.stringify(query, null, 2));
      
      // Query disciplinary actions with populated student and assignedBy data (same as getActions)
      const actions = await this.actionModel.find(query)
        .populate('studentId', 'firstName lastName studentId class section email')
        .populate('assignedBy', 'firstName lastName email role')
        .sort({ date: -1, createdAt: -1 })
        .lean();
      
      console.log(`📊 Found ${actions.length} disciplinary actions for schoolId: ${schoolId}`);
      if (actions.length > 0) {
        console.log('📊 Sample action data:', JSON.stringify(actions[0], null, 2));
      }

      let csv = 'Student Name,Student ID,Class,Section,Date,Time,Incident Type,Description,Location,Consequence Type,Duration,Status,Assigned By\n';
      
      if (actions.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Actions,0\n';
        return csv;
      }
      
      for (const action of actions) {
        const actionData = action as any;
        const student = actionData.studentId || {};
        const assignedBy = actionData.assignedBy || {};
        
        const csvRow = [
          `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'N/A',
          student.studentId || 'N/A',
          student.class || 'N/A',
          student.section || 'N/A',
          actionData.date ? new Date(actionData.date).toLocaleDateString() : 'N/A',
          actionData.time || 'N/A',
          actionData.type || 'N/A',
          actionData.description || actionData.reason || 'N/A',
          actionData.location || 'N/A',
          actionData.actionType || actionData.consequence?.type || 'N/A',
          actionData.duration || actionData.consequence?.duration || 'N/A',
          actionData.status || 'N/A',
          `${assignedBy.firstName || ''} ${assignedBy.lastName || ''}`.trim() || 'N/A'
        ];
        
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Actions,${actions.length}\n`;
      console.log(`✅ Behavior report generated with ${actions.length} actions`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating behavior report:', error);
      throw error;
    }
  }

  /**
   * Generate Club Report
   */
  private async generateClubReport(schoolId: string, parameters: any): Promise<string> {
    try {
      const schoolIdObj = new Types.ObjectId(schoolId);
      const query: any = { 
        schoolId: schoolIdObj,
        isActive: true // Only active clubs
      };

      // Add date range filter if provided
      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        query.createdAt = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      // Add type filter if provided
      if (parameters.type && parameters.type !== 'all') {
        query.type = parameters.type;
      }

      console.log('📊 Generating club report with query:', JSON.stringify(query, null, 2));
      
      // Query clubs with populated advisorId (same as clubService.findAll)
      const clubs = await this.clubModel.find(query)
        .populate('advisorId', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .lean();
      
      console.log(`📊 Found ${clubs.length} clubs for schoolId: ${schoolId}`);
      if (clubs.length > 0) {
        console.log('📊 Sample club data:', JSON.stringify(clubs[0], null, 2));
      }

      // Calculate member count for each club (same as clubService.findAll)
      const clubsWithStats = await Promise.all(clubs.map(async (club: any) => {
        const memberCount = await this.clubMembershipModel.countDocuments({
          clubId: club._id,
          status: 'approved',
          isActive: true
        });

        return {
          ...club,
          memberCount
        };
      }));

      let csv = 'Club Name,Type,Advisor Name,Advisor Email,Members,Location,Status\n';
      
      if (clubsWithStats.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Clubs,0\n';
        return csv;
      }
      
      for (const club of clubsWithStats) {
        const clubData = club as any;
        const advisor = clubData.advisorId || {};
        const advisorName = advisor.firstName && advisor.lastName 
          ? `${advisor.firstName} ${advisor.lastName}` 
          : 'N/A';
        const advisorEmail = advisor.email || 'N/A';
        
        // Log each club's data for debugging
        console.log('📊 Processing club:', {
          _id: clubData._id,
          name: clubData.name,
          type: clubData.type,
          advisorName: advisorName,
          memberCount: clubData.memberCount
        });
        
        const csvRow = [
          clubData.name || 'N/A',
          clubData.type || 'N/A',
          advisorName,
          advisorEmail,
          (clubData.memberCount || 0).toString(),
          clubData.location || 'N/A',
          clubData.isActive !== false ? 'Active' : 'Inactive'
        ];
        
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Clubs,${clubsWithStats.length}\n`;
      console.log(`✅ Club report generated with ${clubsWithStats.length} clubs`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating club report:', error);
      throw error;
    }
  }

  /**
   * Generate Sports Report
   */
  private async generateSportsReport(schoolId: string, parameters: any): Promise<string> {
    try {
      const schoolIdObj = new Types.ObjectId(schoolId);
      const query: any = { 
        schoolId: schoolIdObj,
        isActive: true // Only active programs by default
      };

      // Add date range filter if provided
      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        query.createdAt = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      // Add season filter if provided
      if (parameters.season && parameters.season !== 'all') {
        query.season = parameters.season;
      }

      // Add type filter if provided
      if (parameters.type && parameters.type !== 'all') {
        query.type = parameters.type;
      }

      // Override isActive if explicitly provided
      if (parameters.isActive !== undefined) {
        query.isActive = parameters.isActive;
      }

      console.log('📊 Generating sports report with query:', JSON.stringify(query, null, 2));
      
      // Query sports programs (same as sportsService.getSportsPrograms)
      const programs = await this.sportsProgramModel.find(query)
        .select('_id name season type isActive maxParticipants createdAt')
        .sort({ createdAt: -1 })
        .lean();
      
      console.log(`📊 Found ${programs.length} sports programs for schoolId: ${schoolId}`);
      if (programs.length > 0) {
        console.log('📊 Sample program data:', JSON.stringify(programs[0], null, 2));
      }

      // Get participant counts for each program (same as sportsService.getSportsPrograms)
      const programIds = programs.map((p: any) => p._id);
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

      const countMap = new Map(participantCounts.map((p: any) => [p._id.toString(), p.count]));

      // Combine programs with participant counts
      const programsWithCounts = programs.map((program: any) => {
        const participantCount = countMap.get(program._id.toString()) || 0;
        return {
          ...program,
          participantCount
        };
      });

      let csv = 'Program Name,Season,Type,Participants,Max Capacity,Status\n';
      
      if (programsWithCounts.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Programs,0\n';
        return csv;
      }
      
      for (const program of programsWithCounts) {
        const programData = program as any;
        
        // Log each program's data for debugging
        console.log('📊 Processing program:', {
          _id: programData._id,
          name: programData.name,
          season: programData.season,
          type: programData.type,
          participantCount: programData.participantCount,
          maxParticipants: programData.maxParticipants
        });
        
        const csvRow = [
          programData.name || 'N/A',
          programData.season ? programData.season.charAt(0).toUpperCase() + programData.season.slice(1).replace('-', ' ') : 'N/A',
          programData.type ? programData.type.charAt(0).toUpperCase() + programData.type.slice(1) : 'N/A',
          (programData.participantCount || 0).toString(),
          programData.maxParticipants ? programData.maxParticipants.toString() : 'Unlimited',
          programData.isActive !== false ? 'Active' : 'Inactive'
        ];
        
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Programs,${programsWithCounts.length}\n`;
      console.log(`✅ Sports report generated with ${programsWithCounts.length} programs`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating sports report:', error);
      throw error;
    }
  }

  /**
   * Generate Course Report
   */
  private async generateCourseReport(schoolId: string, parameters: any): Promise<string> {
    try {
      const schoolIdObj = new Types.ObjectId(schoolId);
      const query: any = { 
        schoolId: schoolIdObj,
        isActive: true // Only active courses (same as getCourses)
      };

      // Add date range filter if provided
      if (parameters.dateRange?.start && parameters.dateRange?.end) {
        query.createdAt = {
          $gte: new Date(parameters.dateRange.start),
          $lte: new Date(parameters.dateRange.end)
        };
      }

      // Add department filter if provided
      if (parameters.departmentId && parameters.departmentId !== 'all') {
        query.departmentIds = new Types.ObjectId(parameters.departmentId);
      }

      // Add search filter if provided
      if (parameters.search && parameters.search.trim()) {
        const regex = { $regex: parameters.search.trim(), $options: 'i' };
        query.$or = [
          { courseName: regex },
          { courseCode: regex }
        ];
      }

      console.log('📊 Generating course report with query:', JSON.stringify(query, null, 2));
      
      // Query courses with populated departments (same pattern as getCourses)
      const courses = await this.courseModel.find(query)
        .select('_id courseName courseCode departmentIds createdAt')
        .populate('departmentIds', 'departmentName code')
        .sort({ createdAt: -1 })
        .lean();
      
      console.log(`📊 Found ${courses.length} courses for schoolId: ${schoolId}`);
      if (courses.length > 0) {
        console.log('📊 Sample course data:', JSON.stringify(courses[0], null, 2));
      }

      let csv = 'Course Name,Course Code,Departments,Created Date\n';
      
      if (courses.length === 0) {
        csv += '\n--- SUMMARY ---\nTotal Courses,0\n';
        return csv;
      }
      
      for (const course of courses) {
        const courseData = course as any;
        
        // Get department names (handle both populated and unpopulated cases)
        let departmentNames = 'N/A';
        if (courseData.departmentIds && Array.isArray(courseData.departmentIds)) {
          if (courseData.departmentIds.length > 0) {
            // Check if populated (has departmentName) or just ObjectId
            const deptNames = courseData.departmentIds.map((dept: any) => {
              if (typeof dept === 'object' && dept.departmentName) {
                return dept.departmentName + (dept.code ? ` (${dept.code})` : '');
              }
              return 'Unknown';
            });
            departmentNames = deptNames.join(', ');
          }
        }
        
        // Log each course's data for debugging
        console.log('📊 Processing course:', {
          _id: courseData._id,
          courseName: courseData.courseName,
          courseCode: courseData.courseCode,
          departmentsCount: Array.isArray(courseData.departmentIds) ? courseData.departmentIds.length : 0,
          departmentNames: departmentNames
        });
        
        const csvRow = [
          courseData.courseName || 'N/A',
          courseData.courseCode || 'N/A',
          departmentNames,
          courseData.createdAt ? new Date(courseData.createdAt).toLocaleDateString() : 'N/A'
        ];
        
        csv += csvRow.map(v => {
          const value = v === null || v === undefined ? '' : String(v);
          return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
        }).join(',') + '\n';
      }

      csv += `\n--- SUMMARY ---\nTotal Courses,${courses.length}\n`;
      console.log(`✅ Course report generated with ${courses.length} courses`);
      return csv;
    } catch (error) {
      console.error('❌ Error generating course report:', error);
      throw error;
    }
  }

  /**
   * Download report
   */
  async downloadReport(id: string, schoolId: string): Promise<string> {
    const storedReport = this.generatedReports.get(id);
    
    if (!storedReport) {
      throw new NotFoundException('Report not found');
    }

    // Verify report belongs to admin's school
    const reportSchoolIds = storedReport.parameters?.schoolIds || [];
    const schoolIdStr = String(schoolId);
    const matches = reportSchoolIds.some((id: any) => String(id) === schoolIdStr);
    
    if (!matches) {
      throw new UnauthorizedException('You do not have permission to access this report');
    }

    if (storedReport.content) {
      return storedReport.content;
    }

    throw new NotFoundException('Report content not found');
  }

  /**
   * Delete report
   */
  async deleteReport(id: string, schoolId: string, adminId: string): Promise<any> {
    const storedReport = this.generatedReports.get(id);
    
    if (!storedReport) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Report not found',
        data: null,
      };
    }

    // Verify report belongs to admin's school
    const reportSchoolIds = storedReport.parameters?.schoolIds || [];
    if (!reportSchoolIds.includes(schoolId)) {
      return {
        success: false,
        statusCode: HttpStatus.FORBIDDEN,
        message: 'You do not have permission to delete this report',
        data: null,
      };
    }

    // Verify report was created by this admin
    if (storedReport.createdBy?.email && storedReport.createdBy.email !== adminId) {
      // Allow deletion if admin has permission (for now, allow if same school)
    }

    this.generatedReports.delete(id);
    
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Report deleted successfully',
      data: null,
    };
  }

  async getAcademicTermsForSchool(schoolId: string, page: number = 1, limit: number = 50, filters?: { academicYear?: string; isActive?: string }): Promise<{ terms: AcademicTerm[]; totalTerms: number; totalPages: number; currentPage: number }> {
    const query: any = { schoolId: new Types.ObjectId(schoolId) };
    if (filters?.academicYear && filters.academicYear !== 'all') query.academicYear = filters.academicYear;
    if (filters?.isActive !== undefined && filters?.isActive !== 'all') query.isActive = filters.isActive === 'true';
    const skip = (page - 1) * limit;
    const [terms, totalTerms] = await Promise.all([
      this.academicTermModel.find(query).sort({ academicYear: -1, sortOrder: 1 }).skip(skip).limit(limit).lean().exec(),
      this.academicTermModel.countDocuments(query),
    ]);
    return { terms: terms as AcademicTerm[], totalTerms, totalPages: Math.ceil(totalTerms / limit), currentPage: page };
  }

  async createAcademicTermForSchool(schoolId: string, termData: any): Promise<AcademicTerm> {
    if (new Date(termData.startDate) >= new Date(termData.endDate)) {
      throw new BadRequestException('Start date must be before end date');
    }
    const existingTerm = await this.academicTermModel.findOne({
      schoolId: new Types.ObjectId(schoolId),
      $or: [{ startDate: { $lte: new Date(termData.endDate) }, endDate: { $gte: new Date(termData.startDate) } }],
    });
    if (existingTerm) throw new ConflictException('Term dates overlap with an existing term');
    const term = await this.academicTermModel.create({
      ...termData,
      schoolId: new Types.ObjectId(schoolId),
    });
    return term.toObject();
  }

  async updateAcademicTermForSchool(schoolId: string, id: string, updateData: any): Promise<AcademicTerm> {
    const term = await this.academicTermModel.findOne({ _id: id, schoolId: new Types.ObjectId(schoolId) });
    if (!term) throw new NotFoundException('Academic term not found');
    if (updateData.startDate || updateData.endDate) {
      const start = new Date(updateData.startDate || term.startDate);
      const end = new Date(updateData.endDate || term.endDate);
      if (start >= end) throw new BadRequestException('Start date must be before end date');
    }
    const updated = await this.academicTermModel.findByIdAndUpdate(id, updateData, { new: true }).lean().exec();
    return updated as AcademicTerm;
  }

  async deleteAcademicTermForSchool(schoolId: string, id: string): Promise<void> {
    const term = await this.academicTermModel.findOne({ _id: id, schoolId: new Types.ObjectId(schoolId) });
    if (!term) throw new NotFoundException('Academic term not found');
    await this.academicTermModel.findByIdAndDelete(id);
  }

  async setCurrentAcademicTermForSchool(schoolId: string, id: string): Promise<void> {
    await this.academicTermModel.updateMany(
      { schoolId: new Types.ObjectId(schoolId) },
      { $set: { isCurrent: false } },
    );
    const term = await this.academicTermModel.findOne({ _id: id, schoolId: new Types.ObjectId(schoolId) });
    if (!term) throw new NotFoundException('Academic term not found');
    await this.academicTermModel.findByIdAndUpdate(id, { $set: { isCurrent: true } });
  }

  async getTopPerformingSchools(metric: string, limit: number): Promise<any[]> {
    return [];
  }

  async getGradeAverages(schoolId: string): Promise<any> {
    return { grades: [] };
  }

  async getAttendanceTrends(schoolId: string, days: number): Promise<any> {
    return { trends: [] };
  }
}

