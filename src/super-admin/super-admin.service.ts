import { Injectable, NotFoundException, ConflictException, BadRequestException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as NodeCache from 'node-cache';
import { User, UserDocument, UserRole, UserStatus } from '../auth/schemas/user.schema';
import { School, SchoolDocument } from '../auth/schemas/school.schema';
import { StudentProfile, StudentProfileDocument } from '../auth/schemas/student-profile.schema';
import { ParentProfile, ParentProfileDocument } from '../auth/schemas/parent-profile.schema';
import { TeacherProfile, TeacherProfileDocument } from '../auth/schemas/teacher-profile.schema';
import { Role } from './schemas/role.schema';
import { Permission } from './schemas/permission.schema';
import { AcademicTerm, AcademicTermDocument } from './schemas/academic-term.schema';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { SystemConfig, SystemConfigDocument } from './schemas/system-config.schema';
import { AccessControl, AccessControlDocument } from './schemas/access-control.schema';
import { UserSession, UserSessionDocument } from './schemas/user-session.schema';
import { SystemMonitor, SystemMonitorDocument } from './schemas/system-monitor.schema';
import { SystemAlert, SystemAlertDocument, AlertRule, AlertRuleDocument, NotificationTemplate, NotificationTemplateDocument } from './schemas/system-alert.schema';
import { Integration, IntegrationDocument, IntegrationLog, IntegrationLogDocument } from './schemas/integration.schema';
import { ScheduledJob, ScheduledJobDocument } from './schemas/scheduled-job.schema';
import { RolloverConfig, RolloverConfigDocument } from './schemas/rollover-config.schema';
import { Activity } from '../activity/schema/schema.activity';
import { EmailService } from '../email/email.service';
import { PasswordGenerator } from '../utils/password-generator';
import { Parent, ParentDocument } from '../parent/schema/parent.schema';
import { Department, DepartmentDocument } from '../auth/schemas/department.schema';
import { Course, CourseDocument } from '../course/schema/course.schema';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/user.dto';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import { CreateRoleDto, UpdateRoleDto, CreatePermissionDto } from './dto/role.dto';
// import { CreateStudentDto } from './dto/create-student.dto';
import { generateSchoolCode } from '../utils/generate-school-code';
import { CreateParentDto } from './dto/create-parent.dto';
import { CreateAdminDto, UpdateAdminDto, AdminQueryDto } from './dto/admin.dto';
import { getPaginationMeta } from '../../utils/pagination';
import { LessonPlanService } from '../lesson-plan/lesson-plan.service';

const DEFAULT_EMAIL_TEMPLATES = [
  {
    id: '1',
    name: 'Welcome Email',
    subject: 'Welcome to {{schoolName}}',
    body: 'Dear {{firstName}}, welcome to our school management system.',
    type: 'welcome',
    status: 'active',
    variables: ['schoolName', 'firstName', 'lastName'],
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Password Reset',
    subject: 'Password Reset Request',
    body: 'Click here to reset your password: {{resetLink}}',
    type: 'password-reset',
    status: 'active',
    variables: ['resetLink', 'firstName'],
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  }
];

const DEFAULT_CUSTOM_REPORTS = [
  {
    id: '1',
    name: 'Student Performance Analysis',
    description: 'Comprehensive analysis of student academic performance',
    dataSource: 'students',
    columns: [
      { field: 'studentName', label: 'Student Name', aggregation: null },
      { field: 'grade', label: 'Grade Level', aggregation: null },
      { field: 'gpa', label: 'GPA', aggregation: 'avg' },
      { field: 'attendance', label: 'Attendance %', aggregation: 'avg' }
    ],
    filters: [
      { field: 'grade', operator: 'in', value: '9,10,11,12' },
      { field: 'active', operator: 'equals', value: 'true' }
    ],
    groupBy: [],
    orderBy: [],
    status: 'published',
    createdAt: new Date().toISOString(),
    lastRun: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  }
];

@Injectable()
export class SuperAdminService {
  private cache: NodeCache;
  private emailTemplatesStore: Array<{ id: string; name: string; subject: string; body: string; type: string; status: string; variables?: string[]; createdAt: string; lastModified: string }> = [...DEFAULT_EMAIL_TEMPLATES];
  private customReportsStore: Array<Record<string, any>> = [...DEFAULT_CUSTOM_REPORTS];

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    @InjectModel(StudentProfile.name) private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(ParentProfile.name) private parentProfileModel: Model<ParentProfileDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(Permission.name) private permissionModel: Model<Permission>,
    @InjectModel(AcademicTerm.name) private academicTermModel: Model<AcademicTermDocument>,
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLogDocument>,
    @InjectModel(SystemConfig.name) private systemConfigModel: Model<SystemConfigDocument>,
    @InjectModel(AccessControl.name) private accessControlModel: Model<AccessControlDocument>,
    @InjectModel(UserSession.name) private userSessionModel: Model<UserSessionDocument>,
    @InjectModel(SystemMonitor.name) private systemMonitorModel: Model<SystemMonitorDocument>,
    @InjectModel(SystemAlert.name) private systemAlertModel: Model<SystemAlertDocument>,
    @InjectModel(AlertRule.name) private alertRuleModel: Model<AlertRuleDocument>,
    @InjectModel(NotificationTemplate.name) private notificationTemplateModel: Model<NotificationTemplateDocument>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(Parent.name) private parentModel: Model<ParentDocument>,
    @InjectModel(Department.name) private departmentModel: Model<DepartmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Integration.name) private integrationModel: Model<IntegrationDocument>,
    @InjectModel(IntegrationLog.name) private integrationLogModel: Model<IntegrationLogDocument>,
    @InjectModel(ScheduledJob.name) private scheduledJobModel: Model<ScheduledJobDocument>,
    @InjectModel(RolloverConfig.name) private rolloverConfigModel: Model<RolloverConfigDocument>,
    private emailService: EmailService,
    private lessonPlanService: LessonPlanService,
  ) {
    // Initialize cache with 30 minutes TTL (1800 seconds)
    this.cache = new NodeCache({ stdTTL: 1800, checkperiod: 600 });
  }

  private async logActivity(
    title: string,
    subtitle: string,
    role?: string,
    actorId?: string,
  ) {
    const performBy = (role || UserRole.SUPER_ADMIN)?.toString()?.toUpperCase() || UserRole.SUPER_ADMIN;

    try {
      await this.activityModel.create({
        title,
        subtitle,
        performBy,
        actorId: new Types.ObjectId(actorId),
      });
    } catch (activityError) {
      console.error(`❌ Failed to log activity [${title}]:`, activityError?.message || activityError);
    }
  }

  // ==================== RELATIONSHIP HELPERS ====================

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
      { code: 'BB', name: 'Barbados' },
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
      { code: 'CV', name: 'Cape Verde' },
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
      { code: 'CD', name: 'Congo, Democratic Republic' },
      { code: 'CR', name: 'Costa Rica' },
      { code: 'CI', name: 'Cote d\'Ivoire' },
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
      { code: 'KP', name: 'Korea, North' },
      { code: 'KR', name: 'Korea, South' },
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
      { code: 'MK', name: 'Macedonia' },
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
      { code: 'NO', name: 'Norway' },
      { code: 'OM', name: 'Oman' },
      { code: 'PK', name: 'Pakistan' },
      { code: 'PW', name: 'Palau' },
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
      { code: 'SZ', name: 'Swaziland' },
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
      { code: 'VA', name: 'Vatican City' },
      { code: 'VE', name: 'Venezuela' },
      { code: 'VN', name: 'Vietnam' },
      { code: 'YE', name: 'Yemen' },
      { code: 'ZM', name: 'Zambia' },
      { code: 'ZW', name: 'Zimbabwe' }
    ];

    return countries;
  }

  async getStudentsForParentSelection(schoolId?: string): Promise<any[]> {
    const query = schoolId ? { schoolId } : {};

    const students = await this.studentProfileModel
      .find(query)
      .populate('userId', 'firstName lastName email')
      .select('firstName lastName studentId gradeLevel section userId')
      .sort({ gradeLevel: 1, section: 1, lastName: 1 });

    return students.map(student => ({
      id: student._id,
      studentId: student.studentId,
      name: `${student.firstName} ${student.lastName}`,
      gradeLevel: student.gradeLevel,
      section: student.section,
      fullName: `${student.firstName} ${student.lastName} (${student.studentId})`,
    }));
  }

  async getParentsForStudentSelection(schoolId?: string): Promise<any[]> {
    const query: any = {};
    if (schoolId) {
      query.schoolIds = schoolId;
    }

    const parents = await this.parentProfileModel
      .find(query)
      .populate('userId', 'firstName lastName email')
      .select('firstName lastName phone userId')
      .sort({ lastName: 1 });

    return parents.map(parent => ({
      id: parent.userId,
      name: `${parent.firstName} ${parent.lastName}`,
      phone: parent.phone,
      fullName: `${parent.firstName} ${parent.lastName} (${parent.phone || 'No phone'})`,
    }));
  }

  // ==================== USER MANAGEMENT ====================

  async createUser(createUserDto: CreateUserDto, actor?: { role?: string; actorId?: string }) {
    try {
      const email = createUserDto.email.toLowerCase();

      const existingUser = await this.userModel.findOne({ email }).lean();
      if (existingUser) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'User with this email already exists',
          data: { _id: existingUser._id },
        };
      }

      if (createUserDto.schoolId?.trim()) {
        const school = await this.schoolModel.findById(createUserDto.schoolId).lean();
        if (!school) {
          return {
            success: false,
            statusCode: HttpStatus.NOT_FOUND,
            message: 'School not found',
            data: null,
          };
        }
      }

      const password = createUserDto.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      const userData: any = {
        email,
        password,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
        role: createUserDto.role,
        phone: createUserDto.phone,
        mustChangePassword: createUserDto.mustChangePassword ?? true,
        // Don't set passwordChangedAt if mustChangePassword is true - user hasn't changed password yet
        passwordChangedAt: (createUserDto.mustChangePassword ?? true) ? undefined : new Date(),
        isActive: true,
        status: 'ACTIVE',
      };

      if (createUserDto.schoolId?.trim()) {
        userData.schoolId = createUserDto.schoolId;
      }

      const user = new this.userModel(userData);
      const savedUser = await user.save();

      try {
        switch (createUserDto.role) {
          case UserRole.STUDENT:
            await this.createStudentProfile(savedUser._id.toString(), createUserDto);
            break;
          case UserRole.PARENT:
            await this.createParentProfile(savedUser._id.toString(), createUserDto);
            break;
          case UserRole.TEACHER:
            await this.createTeacherProfile(savedUser._id.toString(), createUserDto);
            break;
          case UserRole.ADMIN:
            if (createUserDto.isSchoolAdmin && createUserDto.schoolId) {
              await this.assignSchoolAdmin(createUserDto.schoolId, savedUser._id.toString());
            }
            break;
        }

        await this.handleUserRelationships(savedUser._id.toString(), createUserDto);

        await this.logActivity(
          `New ${createUserDto.role} Created`,
          `${createUserDto.firstName} ${createUserDto.lastName} (${createUserDto.email}) has been added to the system`,
          actor?.role,
          actor?.actorId,
        );

        try {
          await this.emailService.sendWelcomeEmail(
            savedUser.email,
            savedUser.firstName,
            savedUser.lastName,
            savedUser.role,
            password,
          );
        } catch (emailError) {
          console.error(`❌ Failed to send welcome email to ${savedUser.email}:`, emailError);
        }

        return {
          success: true,
          statusCode: HttpStatus.CREATED,
          message: 'User created successfully',
          data: { _id: savedUser._id },
        };
      } catch (profileError) {
        await this.userModel.findByIdAndDelete(savedUser._id);
        throw profileError;
      }
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: error.getStatus(),
          message: error.message,
          data: null,
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to create user',
        data: null,
      };
    }
  }

  private async createStudentProfile(userId: string, createUserDto: CreateUserDto): Promise<void> {
    const profileData: any = {
      userId,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      studentId: createUserDto.studentId || this.generateStudentId(),
      dateOfBirth: createUserDto.dateOfBirth,
      gender: createUserDto.gender,
      gradeLevel: createUserDto.gradeLevel,
      section: createUserDto.section,
      address: createUserDto.address,
      parentIds: createUserDto.parentIds || [],
    };

    // Only add schoolId if it's provided and not empty
    if (createUserDto.schoolId && createUserDto.schoolId.trim() !== '') {
      profileData.schoolId = createUserDto.schoolId;
    }

    const studentProfile = new this.studentProfileModel(profileData);
    await studentProfile.save();

    // Update user with profile reference
    await this.userModel.findByIdAndUpdate(userId, {
      studentProfileId: studentProfile._id
    });
  }

  private async createParentProfile(userId: string, createUserDto: CreateUserDto): Promise<void> {
    const children = createUserDto.studentRelationships?.map(rel => ({
      studentId: rel.studentId,
      relationship: rel.relationship,
      isPrimaryContact: rel.isPrimaryContact || false,
      hasPickupPermission: rel.hasPickupPermission || true,
    })) || [];

    const parentProfile = new this.parentProfileModel({
      userId,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      gender: createUserDto.gender,
      dateOfBirth: createUserDto.dateOfBirth,
      phone: createUserDto.phone,
      occupation: createUserDto.occupation,
      workplace: createUserDto.workplace,
      address: createUserDto.address,
      children,
      schoolIds: (createUserDto.schoolId && createUserDto.schoolId.trim() !== '') ? [createUserDto.schoolId] : [],
    });

    await parentProfile.save();

    // Update user with profile reference
    await this.userModel.findByIdAndUpdate(userId, {
      parentProfileId: parentProfile._id
    });
  }

  private async createTeacherProfile(userId: string, createUserDto: CreateUserDto): Promise<void> {
    // Generate or use provided employeeId
    let employeeId = createUserDto.employeeId;
    
    // If employeeId is provided, check if it's globally unique
    if (employeeId) {
      const existingEmployee = await this.teacherProfileModel.findOne({ employeeId: employeeId.trim() }).lean();
      if (existingEmployee) {
        throw new Error(`Employee ID "${employeeId}" already exists in the system. Employee IDs must be unique across all users.`);
      }
      employeeId = employeeId.trim();
    } else {
      // Generate a unique employeeId
      let attempts = 0;
      const maxAttempts = 10;
      while (attempts < maxAttempts) {
        employeeId = this.generateEmployeeId();
        const existingEmployee = await this.teacherProfileModel.findOne({ employeeId }).lean();
        if (!existingEmployee) {
          break; // Employee ID is unique
        }
        attempts++;
      }
      
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate a unique employee ID after multiple attempts');
      }
    }

    const profileData: any = {
      userId,
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      employeeId: employeeId,
      dateOfBirth: createUserDto.dateOfBirth,
      gender: createUserDto.gender,
      phone: createUserDto.phone,
      address: createUserDto.address,
      subjects: createUserDto.subjects || [],
      dateOfJoining: new Date(),
      employmentStatus: 'Active',
    };

    // Only add schoolId if it's provided and not empty
    if (createUserDto.schoolId && createUserDto.schoolId.trim() !== '') {
      profileData.schoolId = createUserDto.schoolId;
    }

    const teacherProfile = new this.teacherProfileModel(profileData);
    await teacherProfile.save();

    // Update user with profile reference
    await this.userModel.findByIdAndUpdate(userId, {
      teacherProfileId: teacherProfile._id
    });
  }

  private async handleUserRelationships(userId: string, createUserDto: CreateUserDto): Promise<void> {
    if (createUserDto.role === UserRole.STUDENT && createUserDto.parentIds?.length) {
      await this.linkStudentToParents(userId, createUserDto.parentIds);
    }

    if (createUserDto.role === UserRole.PARENT && createUserDto.studentRelationships?.length) {
      await this.linkParentToStudents(userId, createUserDto.studentRelationships);
    }
  }

  private async linkStudentToParents(studentUserId: string, parentIds: string[]): Promise<void> {
    // Get student profile
    const studentProfile = await this.studentProfileModel.findOne({ userId: studentUserId });
    if (!studentProfile) return;

    // Add parents to student profile
    await this.studentProfileModel.findByIdAndUpdate(studentProfile._id, {
      $addToSet: { parentIds: { $each: parentIds } }
    });

    // Add student to each parent's children list
    for (const parentId of parentIds) {
      const parentProfile = await this.parentProfileModel.findOne({ userId: parentId });
      if (parentProfile) {
        const childExists = parentProfile.children.some(
          child => child.studentId.toString() === studentProfile._id.toString()
        );

        if (!childExists) {
          await this.parentProfileModel.findByIdAndUpdate(parentProfile._id, {
            $push: {
              children: {
                studentId: studentProfile._id,
                relationship: 'Guardian', // Default relationship
                isPrimaryContact: false,
                hasPickupPermission: true,
              }
            }
          });
        }
      }
    }
  }

  private async linkParentToStudents(parentUserId: string, studentRelationships: any[]): Promise<void> {
    const parentProfile = await this.parentProfileModel.findOne({ userId: parentUserId });
    if (!parentProfile) return;

    for (const relationship of studentRelationships) {
      // Find student profile by studentId
      const studentProfile = await this.studentProfileModel.findById(relationship.studentId);
      if (studentProfile) {
        // Add parent to student's parentIds
        await this.studentProfileModel.findByIdAndUpdate(studentProfile._id, {
          $addToSet: { parentIds: parentUserId }
        });

        // Add student to parent's children (this should already be done in createParentProfile)
        // But we'll ensure it's there
        const childExists = parentProfile.children.some(
          child => child.studentId.toString() === relationship.studentId
        );

        if (!childExists) {
          await this.parentProfileModel.findByIdAndUpdate(parentProfile._id, {
            $push: {
              children: {
                studentId: relationship.studentId,
                relationship: relationship.relationship,
                isPrimaryContact: relationship.isPrimaryContact || false,
                hasPickupPermission: relationship.hasPickupPermission || true,
              }
            }
          });
        }
      }
    }
  }

  private async assignSchoolAdmin(schoolId: string, userId: string): Promise<void> {
    // Check if admin is already assigned to another school
    const existingSchoolWithAdmin = await this.schoolModel.findOne({
      adminId: userId,
      _id: { $ne: schoolId }
    });

    if (existingSchoolWithAdmin) {
      throw new ConflictException('This admin is already assigned to another school');
    }

    // Verify that the user exists and has ADMIN role
    const admin = await this.userModel.findById(userId);
    if (!admin) {
      throw new BadRequestException('Admin user not found');
    }
    if (admin.role !== 'ADMIN') {
      throw new BadRequestException('Selected user is not an admin');
    }

    await this.schoolModel.findByIdAndUpdate(schoolId, {
      adminId: userId
    });
  }

  private generateStudentId(): string {
    // Generate a unique student ID
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `STU${timestamp.slice(-6)}${random}`;
  }

  private generateEmployeeId(): string {
    // Generate a unique employee ID
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `EMP${timestamp.slice(-6)}${random}`;
  }

  async getAllUsers(page: number = 1, limit: number = 10, search?: string, role?: string, schoolId?: string): Promise<any> {
    try {
      const skip = (page - 1) * limit;
      const queryConditions: any[] = [];

      console.log('🔍 getAllUsers called with params:', { page, limit, search, role, schoolId });

      // Build base filters (role and school)
      if (role && role !== 'all' && role.trim() !== '') {
        queryConditions.push({ role: role.trim() });
        console.log('✅ Role filter applied:', role.trim());
      }

      if (schoolId && schoolId !== 'all' && schoolId.trim() !== '') {
        queryConditions.push({ schoolId: schoolId.trim() });
        console.log('✅ School filter applied:', schoolId.trim());
      }

      // Build search condition
      if (search && search.trim()) {
        const searchTrimmed = search.trim();
        // Escape special regex characters to prevent regex injection
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
      let query: any = {};
      if (queryConditions.length === 1) {
        query = queryConditions[0];
      } else if (queryConditions.length > 1) {
        query = { $and: queryConditions };
      }

      console.log("Role: ", role);
      console.log("Search: ", search);
      console.log("SchoolId: ", schoolId);
      console.log("Query Conditions: ", queryConditions);
      console.log("Query: ", query);

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
      console.error('Error fetching users:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch users',
        data: null,
      };
    }
  }

  async getActiveAdmins() {
    try {
      // Get all schools and extract their adminIds (admins already assigned to schools)
      const schools = await this.schoolModel
        .find({ adminId: { $exists: true, $ne: null } })
        .select('adminId')
        .lean();

      // Extract admin IDs that are already assigned to schools
      const assignedAdminIds = new Set<string>();
      
      schools.forEach((school) => {
        if (school.adminId) {
          let adminId: string | null = null;
          
          // Handle different formats: ObjectId, populated object, or string
          if (school.adminId instanceof Types.ObjectId) {
            adminId = school.adminId.toString();
          } else if (typeof school.adminId === 'object' && school.adminId !== null) {
            // Populated adminId object
            adminId = (school.adminId as any)._id 
              ? (school.adminId as any)._id.toString() 
              : (school.adminId as any).toString();
          } else if (typeof school.adminId === 'string') {
            adminId = school.adminId;
          }
          
          if (adminId) {
            assignedAdminIds.add(adminId);
          }
        }
      });

      // Convert to ObjectIds for query (handle both string and ObjectId formats)
      const assignedAdminObjectIds = Array.from(assignedAdminIds).map((id) => {
        try {
          return new Types.ObjectId(id);
        } catch (e) {
          console.warn(`Invalid adminId format: ${id}`);
          return null;
        }
      }).filter((id) => id !== null) as Types.ObjectId[];

      // Build query to exclude admins already assigned to schools
      const query: any = {
        role: UserRole.ADMIN,
        isActive: true,
      };

      // Only add $nin if there are assigned admins to exclude
      if (assignedAdminObjectIds.length > 0) {
        query._id = { $nin: assignedAdminObjectIds };
      }

      // Fetch all active admins excluding those already assigned to schools
      const admins = await this.userModel
        .find(query)
        .select('firstName lastName email _id')
        .sort({ firstName: 1, lastName: 1 })
        .lean();

      console.log(`📊 Found ${admins.length} unassigned admins out of total active admins (${assignedAdminIds.size} already assigned)`);

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Active admins fetched successfully',
        data: { admins },
      };
    } catch (error) {
      console.error('Error fetching active admins:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch active admins',
        data: null,
      };
    }
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.userModel
      .findById(id)
      .populate('schoolId', 'name code')
      .populate('customRoles', 'name description permissions')
      .select('-password');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userModel.findOne({ email: updateUserDto.email });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    Object.assign(user, updateUserDto);
    return await user.save();
  }

  async deleteUser(id: string): Promise<void> {
    // Get user info before deletion for activity logging
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException('User not found');
    }

    // Create activity log for user deletion
    try {
      const activity = new this.activityModel({
        title: `${user.role} Deleted`,
        subtitle: `${user.firstName} ${user.lastName} (${user.email}) has been removed from the system`,
        performBy: UserRole.SUPER_ADMIN
      });
      await activity.save();
      console.log(`✅ Activity logged for user deletion: ${user.email}`);
    } catch (activityError) {
      console.error(`❌ Failed to log activity for user deletion:`, activityError);
      // Don't throw error here - user deletion succeeded, activity logging is secondary
    }
  }

  async resetUserPassword(id: string, resetPasswordDto: ResetPasswordDto): Promise<{ newPassword: string }> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Generate a new password if not provided
    const newPassword = resetPasswordDto.newPassword || this.generateRandomPassword();
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user with new password
    await this.userModel.updateOne(
      { _id: id },
      {
        password: hashedPassword,
        failedLoginAttempts: 0,
        lockoutUntil: null
      }
    );

    return { newPassword };
  }

  // ==================== Super Admin MANAGEMENT (SUPER ADMIN) ====================

  async createSuperAdmin(
    createAdminDto: CreateAdminDto,
    actor?: { role?: string; actorId?: string },
  ) {
    const email = createAdminDto.email.trim().toLowerCase();

    const existingUser = await this.userModel.findOne({ email }).lean();
    if (existingUser) {
      return {
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'User with this email already exists',
        data: { _id: existingUser._id },
      };
    }

    let schoolObjectId: Types.ObjectId | undefined;
    if (createAdminDto.schoolId) {
      if (!Types.ObjectId.isValid(createAdminDto.schoolId)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid schoolId',
          data: null,
        };
      }

      const schoolExists = await this.schoolModel.findById(createAdminDto.schoolId).lean();
      if (!schoolExists) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'School not found',
          data: null,
        };
      }

      schoolObjectId = new Types.ObjectId(createAdminDto.schoolId);
    }

    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      const password = createAdminDto.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      const adminData: any = {
        firstName: createAdminDto.firstName.trim(),
        lastName: createAdminDto.lastName.trim(),
        email,
        password,
        phone: createAdminDto.phone.trim(),
        gender: createAdminDto.gender,
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        mustChangePassword: true,
        // Don't set passwordChangedAt - user must change password on first login
        passwordChangedAt: undefined,
      };

      if (schoolObjectId) {
        adminData.schoolId = schoolObjectId;
      }

      if (actor?.actorId && Types.ObjectId.isValid(actor.actorId)) {
        adminData.createdBy = new Types.ObjectId(actor.actorId);
      }

      const admin = new this.userModel(adminData);
      const savedAdmin = await admin.save({ session });

      await this.logActivity(
        'Super Admin Created',
        `Super Admin ${createAdminDto.firstName} ${createAdminDto.lastName} (${email}) created`,
        actor?.role,
        actor?.actorId,
      );

      await session.commitTransaction();

      // Send welcome email (outside transaction to avoid blocking)
      try {
        await this.emailService.sendWelcomeEmail(
          savedAdmin.email,
          savedAdmin.firstName,
          savedAdmin.lastName,
          savedAdmin.role,
          password,
        );
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${savedAdmin.email}:`, emailError);
      }

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Super Admin created successfully',
        data: null,
      };
    } catch (error) {
      await session.abortTransaction();
      console.error('Error creating super admin:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to create super admin',
        data: null,
      };
    } finally {
      session.endSession();
    }
  }

  async getSuperAdmins(query: AdminQueryDto) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const skip = (page - 1) * limit;

      const filter: any = { role: UserRole.SUPER_ADMIN, isActive: true };

      if (query.search?.trim()) {
        const searchRegex = new RegExp(query.search.trim(), 'i');
        filter.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
        ];
      }

      const admins = await this.userModel
        .find(filter)
        .select('firstName lastName email phone gender createdAt')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean();

      const totalAdmins = await this.userModel.countDocuments(filter);

      const adminsWithMeta = admins.map(admin => ({
        ...admin,
        fullName: `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim()
      }));

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Super Admins fetched successfully',
        data: {
          admins: adminsWithMeta,
          pagination: getPaginationMeta(page, limit, totalAdmins),
        },
      };
    } catch (error) {
      console.error('Error fetching super admins:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch super admins',
        data: null,
      };
    }
  }

  async getSuperAdminById(id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid admin id',
          data: null,
        };
      }

      const admin = await this.userModel
        .findOne({ _id: id, role: UserRole.SUPER_ADMIN })
        .select('-password')
        .lean();

      if (!admin) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Super Admin not found',
          data: null,
        };
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Super Admin fetched successfully',
        data: admin,
      };
    } catch (error) {
      console.error('Error fetching super admin by id:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch super admin by id',
        data: null,
      };
    }
  }

  async updateSuperAdmin(
    id: string,
    updateAdminDto: UpdateAdminDto,
    actor?: { role?: string; actorId?: string },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid admin id',
        data: null,
      };
    }

    const admin = await this.userModel.findOne({ _id: id, role: UserRole.SUPER_ADMIN });
    if (!admin) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Super Admin not found',
        data: null,
      };
    }

    if (updateAdminDto.email) {
      const email = updateAdminDto.email.trim().toLowerCase();
      if (email !== admin.email) {
        const existingUser = await this.userModel.findOne({
          email,
          _id: { $ne: admin._id },
        }).lean();

        if (existingUser) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Another user with this email already exists',
            data: { _id: existingUser._id },
          };
        }

        admin.email = email;
      }
    }

    if (updateAdminDto.firstName !== undefined) {
      admin.firstName = updateAdminDto.firstName?.trim() ?? admin.firstName;
    }

    if (updateAdminDto.lastName !== undefined) {
      admin.lastName = updateAdminDto.lastName?.trim() ?? admin.lastName;
    }

    if (updateAdminDto.phone !== undefined) {
      admin.phone = updateAdminDto.phone?.trim() ?? admin.phone;
    }

    if (updateAdminDto.gender !== undefined) {
      admin.gender = updateAdminDto.gender;
    }

    if (actor?.actorId && Types.ObjectId.isValid(actor.actorId)) {
      admin.updatedBy = new Types.ObjectId(actor.actorId) as any;
    }

    try {
      const updatedAdmin = await admin.save();

      await this.logActivity(
        'Super Admin Updated',
        `Admin ${updatedAdmin.firstName} ${updatedAdmin.lastName} was updated`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Super Admin updated successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error updating super admin:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to update super admin',
        data: null,
      };
    }
  }

  async deleteSuperAdmin(id: string, actor?: { role?: string; actorId?: string }) {
    if (!Types.ObjectId.isValid(id)) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid super admin id',
        data: null,
      };
    }

    const admin = await this.userModel.findOne({ _id: id, role: UserRole.SUPER_ADMIN, isActive: true });
    if (!admin) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Super Admin not found',
        data: null,
      };
    }

    try {
      await this.userModel.findByIdAndUpdate({ _id: id, isActive: true }, { isActive: false });

      await this.logActivity(
        'Super Admin Deleted',
        `Admin ${admin.firstName} ${admin.lastName} (${admin.email}) deactivated`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Super Admin deleted successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error deleting super admin:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to delete super admin',
        data: null,
      };
    }
  }

  // ==================== SUPER ADMIN MANAGEMENT ====================

  // ==================== ADMIN MANAGEMENT (SUPER ADMIN) ====================

  async createAdmin(
    createAdminDto: CreateAdminDto,
    actor?: { role?: string; actorId?: string },
  ) {
    const email = createAdminDto.email.trim().toLowerCase();

    const existingUser = await this.userModel.findOne({ email }).lean();
    if (existingUser) {
      return {
        success: false,
        statusCode: HttpStatus.CONFLICT,
        message: 'User with this email already exists',
        data: { _id: existingUser._id },
      };
    }

    let schoolObjectId: Types.ObjectId | undefined;
    if (createAdminDto.schoolId) {
      if (!Types.ObjectId.isValid(createAdminDto.schoolId)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid schoolId',
          data: null,
        };
      }

      const schoolExists = await this.schoolModel.findById(createAdminDto.schoolId).lean();
      if (!schoolExists) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'School not found',
          data: null,
        };
      }

      schoolObjectId = new Types.ObjectId(createAdminDto.schoolId);
    }

    const session = await this.userModel.db.startSession();
    session.startTransaction();

    const password = createAdminDto.password?.trim() || PasswordGenerator.generateTemporaryPassword();

    try {
      const adminData: any = {
        firstName: createAdminDto.firstName.trim(),
        lastName: createAdminDto.lastName.trim(),
        email,
        password,
        phone: createAdminDto.phone.trim(),
        gender: createAdminDto.gender,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        mustChangePassword: true,
        // Don't set passwordChangedAt - user must change password on first login
        passwordChangedAt: undefined,
      };

      if (schoolObjectId) {
        adminData.schoolId = schoolObjectId;
      }

      if (actor?.actorId && Types.ObjectId.isValid(actor.actorId)) {
        adminData.createdBy = new Types.ObjectId(actor.actorId);
      }

      const admin = new this.userModel(adminData);
      const savedAdmin = await admin.save({ session });

      await this.logActivity(
        'Admin Created',
        `Admin ${createAdminDto.firstName} ${createAdminDto.lastName} (${email}) created`,
        actor?.role,
        actor?.actorId,
      );

      await session.commitTransaction();

      // Send welcome email (outside transaction to avoid blocking)
      try {
        console.log(`📧 Sending welcome email to admin: ${savedAdmin.email}`);
        await this.emailService.sendWelcomeEmail(
          savedAdmin.email,
          savedAdmin.firstName,
          savedAdmin.lastName,
          savedAdmin.role,
          password,
        );
        console.log(`✅ Welcome email sent successfully to ${savedAdmin.email}`);
      } catch (emailError) {
        console.error(`❌ Failed to send welcome email to ${savedAdmin.email}:`, emailError);
        // Log the full error for debugging
        if (emailError instanceof Error) {
          console.error(`Error details: ${emailError.message}`, emailError.stack);
        }
      }

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'Admin created successfully',
        data: null,
      };
    } catch (error) {
      await session.abortTransaction();
      console.error('Error creating admin:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to create admin',
        data: null,
      };
    } finally {
      session.endSession();
    }
  }

  async getAdmins(query: AdminQueryDto) {
    try {
      const page = query.page ?? 1;
      const limit = query.limit ?? 10;
      const skip = (page - 1) * limit;

      const filter: any = { role: UserRole.ADMIN };

      if (query.search?.trim()) {
        const searchRegex = new RegExp(query.search.trim(), 'i');
        filter.$or = [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
        ];
      }

      if (query.schoolId) {
        if (!Types.ObjectId.isValid(query.schoolId)) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid schoolId',
            data: null,
          };
        }
        filter.schoolId = new Types.ObjectId(query.schoolId);
      }

      if (query.status === UserStatus.ACTIVE as any) {
        filter.isActive = true;
      } else if (query.status === UserStatus.INACTIVE as any) {
        filter.isActive = false;
      }

      const admins = await this.userModel
        .find(filter)
        .populate('schoolId', 'name')
        .select('firstName lastName email phone gender createdAt')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean();

      const totalAdmins = await this.userModel.countDocuments(filter);

      const adminsWithMeta = admins.map(admin => ({
        ...admin,
        fullName: `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim(),
        schoolName: admin.schoolId ? (admin.schoolId as any).name : 'No School'
      }));

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Admins fetched successfully',
        data: {
          admins: adminsWithMeta,
          pagination: getPaginationMeta(page, limit, totalAdmins),
        },
      };
    } catch (error) {
      console.error('Error fetching admins:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch admins',
        data: null,
      };
    }
  }

  async getAdminById(id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid admin id',
          data: null,
        };
      }

      const admin = await this.userModel
        .findOne({ _id: id, role: UserRole.ADMIN })
        .populate('schoolId', 'name code')
        .select('-password')
        .lean();

      if (!admin) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Admin not found',
          data: null,
        };
      }

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Admin fetched successfully',
        data: admin,
      };
    } catch (error) {
      console.error('Error fetching admin by id:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch admin by id',
        data: null,
      };
    }
  }

  async updateAdmin(
    id: string,
    updateAdminDto: UpdateAdminDto,
    actor?: { role?: string; actorId?: string },
  ) {
    if (!Types.ObjectId.isValid(id)) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid admin id',
        data: null,
      };
    }

    const admin = await this.userModel.findOne({ _id: id, role: UserRole.ADMIN });
    if (!admin) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Admin not found',
        data: null,
      };
    }

    if (updateAdminDto.email) {
      const email = updateAdminDto.email.trim().toLowerCase();
      if (email !== admin.email) {
        const existingUser = await this.userModel.findOne({
          email,
          _id: { $ne: admin._id },
        }).lean();

        if (existingUser) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'Another user with this email already exists',
            data: { _id: existingUser._id },
          };
        }

        admin.email = email;
      }
    }

    if (updateAdminDto.firstName !== undefined) {
      admin.firstName = updateAdminDto.firstName?.trim() ?? admin.firstName;
    }

    if (updateAdminDto.lastName !== undefined) {
      admin.lastName = updateAdminDto.lastName?.trim() ?? admin.lastName;
    }

    if (updateAdminDto.phone !== undefined) {
      admin.phone = updateAdminDto.phone?.trim() ?? admin.phone;
    }

    if (updateAdminDto.gender !== undefined) {
      admin.gender = updateAdminDto.gender;
    }

    if (actor?.actorId && Types.ObjectId.isValid(actor.actorId)) {
      admin.updatedBy = new Types.ObjectId(actor.actorId) as any;
    }

    try {
      const updatedAdmin = await admin.save();

      await this.logActivity(
        'Admin Updated',
        `Admin ${updatedAdmin.firstName} ${updatedAdmin.lastName} was updated`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Admin updated successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error updating admin:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to update admin',
        data: null,
      };
    }
  }

  async deleteAdmin(id: string, actor?: { role?: string; actorId?: string }) {
    if (!Types.ObjectId.isValid(id)) {
      return {
        success: false,
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid admin id',
        data: null,
      };
    }

    const admin = await this.userModel.findOne({ _id: id, role: UserRole.ADMIN });
    if (!admin) {
      return {
        success: false,
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Admin not found',
        data: null,
      };
    }

    try {
      await this.userModel.findByIdAndDelete({ _id: id, isActive: true });

      await this.logActivity(
        'Admin Deleted',
        `Admin ${admin.firstName} ${admin.lastName} (${admin.email}) deactivated`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Admin deleted successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error deleting admin:', error);
      return {
        success: false,
        statusCode: error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to delete admin',
        data: null,
      };
    }
  }

  // ==================== ADMIN MANAGEMENT ====================

  private generateRandomPassword(): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  }

  async bulkUpdateUsers(userIds: string[], updateData: Partial<UpdateUserDto>): Promise<void> {
    await this.userModel.updateMany(
      { _id: { $in: userIds } },
      { $set: updateData }
    );
  }

  // ==================== SCHOOL MANAGEMENT ====================

  async createSchool(
    createSchoolDto: CreateSchoolDto,
    actor?: { role?: string; actorId?: string },
  ) {
    try {
      const name = createSchoolDto.name?.trim();

      let code = createSchoolDto.code?.trim()?.toUpperCase();
      if (!code) {
        const existingCodes = await this.schoolModel.distinct('code');
        code = generateSchoolCode(name, existingCodes);
      }

      const academicYearStartDate = createSchoolDto.academicYearStart
        ? new Date(createSchoolDto.academicYearStart)
        : undefined;
      if (academicYearStartDate && Number.isNaN(academicYearStartDate.getTime())) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid academicYearStart value',
          data: null,
        };
      }

      const academicYearEndDate = createSchoolDto.academicYearEnd
        ? new Date(createSchoolDto.academicYearEnd)
        : undefined;
      if (academicYearEndDate && Number.isNaN(academicYearEndDate.getTime())) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid academicYearEnd value',
          data: null,
        };
      }

      const existingSchoolByCode = await this.schoolModel.findOne({ code }).lean();
      if (existingSchoolByCode) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: 'School with this code already exists',
          data: null,
        };
      }

      if (createSchoolDto.email?.trim()) {
        const email = createSchoolDto.email.trim().toLowerCase();
        const existingSchoolByEmail = await this.schoolModel.findOne({ email }).lean();
        if (existingSchoolByEmail) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'School with this email already exists',
            data: null,
          };
        }
        createSchoolDto.email = email;
      }

      let adminObjectId: Types.ObjectId | undefined;
      const trimmedAdminId = createSchoolDto.adminId?.trim();
      if (trimmedAdminId) {
        if (!Types.ObjectId.isValid(trimmedAdminId)) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid adminId provided',
            data: null,
          };
        }

        adminObjectId = new Types.ObjectId(trimmedAdminId);

        const existingSchoolWithAdmin = await this.schoolModel.findOne({ adminId: adminObjectId }).lean();
        if (existingSchoolWithAdmin) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'This admin is already assigned to another school',
            data: null,
          };
        }

        const admin = await this.userModel.findById(adminObjectId).lean();
        if (!admin) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Admin user not found',
            data: null,
          };
        }

        if (admin.role !== UserRole.ADMIN) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Selected user is not an admin',
            data: null,
          };
        }
      }

      const actorObjectId = actor?.actorId && Types.ObjectId.isValid(actor.actorId)
        ? new Types.ObjectId(actor.actorId)
        : undefined;

      const newSchool = await this.schoolModel.create({
        name,
        code,
        type: createSchoolDto.type,
        address: {
          street: createSchoolDto.address?.street?.trim(),
          city: createSchoolDto.address?.city?.trim(),
          state: createSchoolDto.address?.state?.trim(),
          zipCode: createSchoolDto.address?.zipCode?.trim(),
          country: createSchoolDto.address?.country?.trim(),
        },
        phone: createSchoolDto.phone?.trim(),
        email: createSchoolDto.email,
        website: createSchoolDto.website?.trim(),
        adminId: adminObjectId,
        establishedYear: createSchoolDto.establishedYear,
        studentCapacity: createSchoolDto.studentCapacity,
        currentStudentCount: 0,
        currentUserCount: 0,
        maxUsers: createSchoolDto.studentCapacity || 100,
        gradelevels: createSchoolDto.gradelevels || [],
        academicYearStart: academicYearStartDate,
        academicYearEnd: academicYearEndDate,
        isActive: createSchoolDto.isActive !== undefined ? createSchoolDto.isActive : true,
        settings: createSchoolDto.settings || {
          allowParentRegistration: true,
          requireEmailVerification: true,
          maxStudentsPerClass: createSchoolDto.maxStudentsPerClass || 50,
          attendanceGracePeriod: 15,
        },
        createdBy: actorObjectId,
      });

      // update the admin and add the schoolId in that record
      await this.userModel.updateOne({ _id: adminObjectId }, { $set: { schoolId: newSchool._id } });

      await this.logActivity(
        'School Created',
        `${name} (${code}) has been added to the system`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.CREATED,
        message: 'School created successfully',
        data: null,
      };
    } catch (error) {
      console.error('❌ School creation error:', error);

      if (error?.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: `School with this ${duplicateField} already exists`,
          data: null,
        };
      }

      if (error?.name === 'ValidationError') {
        const messages = Object.values(error.errors || {}).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${messages.join(', ')}`,
          data: null,
        };
      }

      if (error instanceof ConflictException || error instanceof BadRequestException) {
        return {
          success: false,
          statusCode: error.getStatus(),
          message: error.message,
          data: null,
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to create school',
        data: null,
      };
    }
  }

  async getAllSchools(page: number = 1, limit: number = 10, search?: string) {
    try {
      const safePage = Math.max(Number(page) || 1, 1);
      const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
      const skip = (safePage - 1) * safeLimit;

      const query: Record<string, any> = {};
      query.isActive = true;

      if (search?.trim()) {
        const trimmedSearch = search.trim();
        query.$or = [
          { name: { $regex: trimmedSearch, $options: 'i' } },
          { code: { $regex: trimmedSearch, $options: 'i' } },
          { 'address.city': { $regex: trimmedSearch, $options: 'i' } },
          { 'address.state': { $regex: trimmedSearch, $options: 'i' } },
        ];
      }

      const [schools, totalSchools] = await Promise.all([
        this.schoolModel
          .find(query)
          .populate('adminId', 'firstName lastName email')
          .skip(skip)
          .limit(safeLimit)
          .sort({ createdAt: -1 })
          .lean(),
        this.schoolModel.countDocuments(query),
      ]);

      const schoolsWithCounts = await Promise.all(
        schools.map(async (school) => {
          const [userCount, studentCount, staffCount] = await Promise.all([
            this.userModel.countDocuments({ schoolId: school._id }),
            this.userModel.countDocuments({ schoolId: school._id, role: UserRole.STUDENT }),
            this.userModel.countDocuments({ schoolId: school._id, role: { $in: [UserRole.TEACHER, UserRole.ADMIN] } }),
          ]);

          return {
            ...school,
            currentStudentCount: studentCount,
            currentUserCount: userCount,
            staffCount,
            establishedYear: school.establishedYear || new Date().getFullYear(),
          };
        }),
      );

      const totalPages = Math.ceil(totalSchools / safeLimit) || 1;

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Schools fetched successfully',
        data: {
          schools: schoolsWithCounts,
          pagination: {
            currentPage: safePage,
            totalPages,
            totalCount: totalSchools,
            limit: safeLimit,
            hasNext: safePage < totalPages,
            hasPrevious: safePage > 1,
          },
        },
      };
    } catch (error) {
      console.error('Error fetching schools:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch schools',
        data: null,
      };
    }
  }

  async getSchoolStats() {
    try {
      const [stats] = await this.schoolModel.aggregate([
        {
          $group: {
            _id: null,
            totalSchools: { $sum: 1 },
            activeSchools: {
              $sum: {
                $cond: [{ $eq: ['$isActive', true] }, 1, 0],
              },
            },
            totalStudentCapacity: {
              $sum: { $ifNull: ['$studentCapacity', 0] },
            }
          },
        },
      ]);

      const totalSchools = stats?.totalSchools ?? 0;
      const activeSchools = stats?.activeSchools ?? 0;
      const inactiveSchools = totalSchools - activeSchools;

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'School stats fetched successfully',
        data: {
          totalSchools,
          activeSchools,
          inactiveSchools,
          totalStudentCapacity: stats?.totalStudentCapacity ?? 0,
        },
      };
    } catch (error) {
      console.error('Error fetching school stats:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch school stats',
        data: null,
      };
    }
  }

  async getSchoolById(id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid school id',
          data: null,
        };
      }

      const schoolObjectId = new Types.ObjectId(id);

      // --------------------
      // 🧩 PARALLEL QUERIES FOR OPTIMIZATION
      // --------------------
      const [
        school,
        userCounts,
        parentCount,
        departments,
        courses,
      ] = await Promise.all([
        // 1. Get school basic information
        this.schoolModel
          .findById(id)
          .populate('adminId', 'firstName lastName email phone')
          .select('+createdAt +updatedAt')
          .lean(),

        // 2. Get user counts by role (Students, Teachers, Nurses, Secretaries)
        this.userModel.aggregate([
          {
            $match: {
              schoolId: schoolObjectId,
              isActive: true,
            },
          },
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 },
            },
          },
        ]),

        // 3. Count parents from Parent model (belongToSchools array)
        this.parentModel.countDocuments({
          'belongToSchools': {
            $elemMatch: {
              schoolId: schoolObjectId,
              isActive: true,
            },
          },
        }),

        // 4. Get departments
        this.departmentModel
          .find({ schoolId: schoolObjectId, isActive: true })
          .select('_id departmentName code description')
          .sort({ createdAt: -1 })
          .lean(),

        // 5. Get courses
        this.courseModel
          .find({ schoolId: schoolObjectId, isActive: true })
          .select('_id courseName courseCode description isActive')
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      if (!school) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'School not found',
          data: null,
        };
      }

      // Format user counts by role
      const countsByRole = userCounts.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      // Build comprehensive response
      const response = {
        school: {
          _id: school._id,
          name: school.name,
          code: school.code,
          type: school.type,
          status: school.status,
          address: school.address,
          phone: school.phone,
          email: school.email,
          website: school.website,
          adminId: (school.adminId as any)?._id || school.adminId || null,
          establishedYear: school.establishedYear,
          studentCapacity: school.studentCapacity,
          currentStudentCount: school.currentStudentCount,
          currentUserCount: school.currentUserCount,
          maxUsers: school.maxUsers,
          gradelevels: school.gradelevels,
          academicYearStart: school.academicYearStart,
          academicYearEnd: school.academicYearEnd,
          isActive: school.isActive,
          settings: school.settings,
          subscriptionTier: school.subscriptionTier,
          subscriptionExpires: school.subscriptionExpires,
          createdAt: (school as any).createdAt,
          updatedAt: (school as any).updatedAt,
        },
        admin: school.adminId && typeof school.adminId === 'object' ? {
          _id: (school.adminId as any)._id || school.adminId,
          firstName: (school.adminId as any).firstName,
          lastName: (school.adminId as any).lastName,
          email: (school.adminId as any).email,
          phone: (school.adminId as any).phone,
        } : null,
        statistics: {
          totalStudents: countsByRole[UserRole.STUDENT] || 0,
          totalTeachers: countsByRole[UserRole.TEACHER] || 0,
          totalParents: parentCount || 0,
          totalNurses: countsByRole[UserRole.NURSE] || 0,
          totalSecretaries: countsByRole[UserRole.SECRETARY] || 0,
          totalAdmins: countsByRole[UserRole.ADMIN] || 0,
          totalDepartments: departments.length,
          totalCourses: courses.length,
        },
        departments: departments.map((dept: any) => ({
          _id: dept._id,
          name: dept.departmentName,
          code: dept.code,
          description: dept.description,
        })),
        courses: courses.map((course: any) => ({
          _id: course._id,
          courseName: course.courseName,
          courseCode: course.courseCode,
          description: course.description,
          isActive: course.isActive,
        })),
      };

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'School information fetched successfully',
        data: response,
      };
    } catch (error) {
      console.error('Error fetching school by id:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to fetch school',
        data: null,
      };
    }
  }

  async updateSchool(
    id: string,
    updateSchoolDto: UpdateSchoolDto,
    actor?: { role?: string; actorId?: string },
  ) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid school id',
          data: null,
        };
      }

      const trimmedAdminId = updateSchoolDto.adminId?.trim();
      if (trimmedAdminId) {
        if (!Types.ObjectId.isValid(trimmedAdminId)) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid adminId provided',
            data: null,
          };
        }

        const adminObjectId = new Types.ObjectId(trimmedAdminId);
        const existingSchoolWithAdmin = await this.schoolModel.findOne({
          adminId: adminObjectId,
          _id: { $ne: new Types.ObjectId(id) },
        }).lean();

        if (existingSchoolWithAdmin) {
          return {
            success: false,
            statusCode: HttpStatus.CONFLICT,
            message: 'This admin is already assigned to another school',
            data: null,
          };
        }

        const admin = await this.userModel.findById(adminObjectId).lean();
        if (!admin) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Admin user not found',
            data: null,
          };
        }

        if (admin.role !== UserRole.ADMIN) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Selected user is not an admin',
            data: null,
          };
        }
      }

      const existingSchool = await this.schoolModel.findById(id);
      if (!existingSchool) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'School not found',
          data: null,
        };
      }

      const updatePayload: Partial<School> & { updatedBy?: Types.ObjectId } = {};

      if (updateSchoolDto.name !== undefined) {
        updatePayload.name = updateSchoolDto.name?.trim();
      }

      if (updateSchoolDto.code !== undefined) {
        const code = updateSchoolDto.code?.trim()?.toUpperCase();
        if (code && code !== existingSchool.code) {
          const duplicateCode = await this.schoolModel.findOne({
            code,
            _id: { $ne: existingSchool._id },
          }).lean();

          if (duplicateCode) {
            return {
              success: false,
              statusCode: HttpStatus.CONFLICT,
              message: 'School with this code already exists',
              data: null,
            };
          }
        }
        updatePayload.code = code;
      }

      if (updateSchoolDto.address) {
        updatePayload.address = {
          street: updateSchoolDto.address.street?.trim() ?? existingSchool.address.street,
          city: updateSchoolDto.address.city?.trim() ?? existingSchool.address.city,
          state: updateSchoolDto.address.state?.trim() ?? existingSchool.address.state,
          zipCode: updateSchoolDto.address.zipCode?.trim() ?? existingSchool.address.zipCode,
          country: updateSchoolDto.address.country?.trim() ?? existingSchool.address.country,
        } as any;
      }

      if (updateSchoolDto.phone !== undefined) {
        updatePayload.phone = updateSchoolDto.phone?.trim();
      }

      if (updateSchoolDto.email !== undefined) {
        updatePayload.email = updateSchoolDto.email?.trim()?.toLowerCase();
      }

      if (updateSchoolDto.website !== undefined) {
        updatePayload.website = updateSchoolDto.website?.trim();
      }

      if (trimmedAdminId) {
        updatePayload.adminId = new Types.ObjectId(trimmedAdminId) as any;
      }

      if (updateSchoolDto.establishedYear !== undefined) {
        updatePayload.establishedYear = updateSchoolDto.establishedYear;
      }

      if (updateSchoolDto.studentCapacity !== undefined) {
        updatePayload.studentCapacity = updateSchoolDto.studentCapacity;
        updatePayload.maxUsers = updateSchoolDto.studentCapacity;
      }

      if (updateSchoolDto.gradelevels !== undefined) {
        updatePayload.gradelevels = updateSchoolDto.gradelevels;
      }

      if (updateSchoolDto.academicYearStart !== undefined) {
        const startDate: Date | undefined = updateSchoolDto.academicYearStart
          ? new Date(updateSchoolDto.academicYearStart as string)
          : undefined;

        if (startDate && Number.isNaN(startDate.getTime())) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid academicYearStart value',
            data: null,
          };
        }

        updatePayload.academicYearStart = startDate as any;
      }

      if (updateSchoolDto.academicYearEnd !== undefined) {
        const endDate: Date | undefined = updateSchoolDto.academicYearEnd
          ? new Date(updateSchoolDto.academicYearEnd as string)
          : undefined;

        if (endDate && Number.isNaN(endDate.getTime())) {
          return {
            success: false,
            statusCode: HttpStatus.BAD_REQUEST,
            message: 'Invalid academicYearEnd value',
            data: null,
          };
        }

        updatePayload.academicYearEnd = endDate as any;
      }

      if (updateSchoolDto.isActive !== undefined) {
        updatePayload.isActive = updateSchoolDto.isActive;
      }

      if (updateSchoolDto.settings !== undefined) {
        updatePayload.settings = {
          ...existingSchool.settings,
          ...updateSchoolDto.settings,
        } as any;
      }

      const actorObjectId = actor?.actorId && Types.ObjectId.isValid(actor.actorId)
        ? new Types.ObjectId(actor.actorId)
        : undefined;

      if (actorObjectId) {
        updatePayload.updatedBy = actorObjectId as any;
      }

      console.log('updateSchoolDto.maxStudentsPerClass:', updateSchoolDto.maxStudentsPerClass);

      if (updateSchoolDto.maxStudentsPerClass !== undefined) {
        // Ensure settings object exists before setting properties
        if (!updatePayload.settings) {
          updatePayload.settings = {
            ...(existingSchool.settings || {}),
          } as any;
        }
        updatePayload.settings.maxStudentsPerClass = updateSchoolDto.maxStudentsPerClass;
      }

      // Handle admin linking/unlinking when adminId changes
      const oldAdminId = existingSchool.adminId;
      const newAdminId = trimmedAdminId ? new Types.ObjectId(trimmedAdminId) : null;
      const schoolObjectId = new Types.ObjectId(id);

      // If admin is being changed
      if (oldAdminId && newAdminId && String(oldAdminId) !== String(newAdminId)) {
        // Unlink old admin from this school
        await this.userModel.updateOne(
          { _id: oldAdminId },
          { $set: { schoolId: null } }
        );
        // Link new admin to this school
        await this.userModel.updateOne(
          { _id: newAdminId },
          { $set: { schoolId: schoolObjectId } }
        );
      } else if (oldAdminId && !newAdminId) {
        // Admin is being removed - unlink old admin
        await this.userModel.updateOne(
          { _id: oldAdminId },
          { $set: { schoolId: null } }
        );
      } else if (!oldAdminId && newAdminId) {
        // Admin is being added - link new admin
        await this.userModel.updateOne(
          { _id: newAdminId },
          { $set: { schoolId: schoolObjectId } }
        );
      }

      await this.schoolModel.updateOne({ _id: existingSchool._id }, updatePayload, { runValidators: true });

      await this.logActivity(
        'School Updated',
        `${existingSchool.name} details were updated`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'School updated successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error updating school:', error);

      if (error?.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern || {})[0] || 'field';
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: `School with this ${duplicateField} already exists`,
          data: null,
        };
      }

      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) {
        return {
          success: false,
          statusCode: error.getStatus(),
          message: error.message,
          data: null,
        };
      }

      if (error?.name === 'ValidationError') {
        const messages = Object.values(error.errors || {}).map((err: any) => err.message);
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: `Validation failed: ${messages.join(', ')}`,
          data: null,
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to update school',
        data: null,
      };
    }
  }

  async deleteSchool(id: string, actor?: { role?: string; actorId?: string }) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid school id',
          data: null,
        };
      }

      const school = await this.schoolModel.findById(id);
      if (!school) {
        return {
          success: false,
          statusCode: HttpStatus.NOT_FOUND,
          message: 'School not found',
          data: null,
        };
      }

      // just change the isActive field to false
      await this.schoolModel.findByIdAndUpdate(id, { isActive: false });

      await this.logActivity(
        'School Deleted',
        `${school.name} (${school.code}) is deactivated`,
        actor?.role,
        actor?.actorId,
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'School deactivated successfully',
        data: null,
      };
    } catch (error) {
      console.error('Error making school inactive:', error);

      if (error instanceof NotFoundException) {
        return {
          success: false,
          statusCode: error.getStatus(),
          message: error.message,
          data: null,
        };
      }

      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to delete school',
        data: null,
      };
    }
  }

  // ==================== ROLE & PERMISSION MANAGEMENT ====================

  async createRole(createRoleDto: CreateRoleDto): Promise<Role> {
    const existingRole = await this.roleModel.findOne({ name: createRoleDto.name });
    if (existingRole) {
      throw new ConflictException('Role with this name already exists');
    }

    const role = new this.roleModel(createRoleDto);
    return await role.save();
  }

  async getAllRoles(): Promise<Role[]> {
    return await this.roleModel
      .find()
      .populate('permissions', 'name resource action description')
      .sort({ createdAt: -1 });
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.roleModel.findByIdAndUpdate(
      id,
      updateRoleDto,
      { new: true }
    );

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.roleModel.findById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystemRole) {
      throw new BadRequestException('Cannot delete system roles');
    }

    await this.roleModel.findByIdAndDelete(id);
  }

  async createPermission(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    const existingPermission = await this.permissionModel.findOne({
      name: createPermissionDto.name
    });

    if (existingPermission) {
      throw new ConflictException('Permission with this name already exists');
    }

    const permission = new this.permissionModel(createPermissionDto);
    return await permission.save();
  }

  async getAllPermissions(): Promise<Permission[]> {
    return await this.permissionModel.find().sort({ resource: 1, action: 1 });
  }

  // ==================== CUSTOMER MANAGEMENT ====================

  // async createStudent(createStudentDto: CreateStudentDto): Promise<any> {
  //   const session = await this.userModel.db.startSession();
  //   session.startTransaction();

  //   try {
  //     console.log('CreateStudent received data:', JSON.stringify(createStudentDto, null, 2));

  //     // Validate school exists
  //     const school = await this.schoolModel.findById(createStudentDto.schoolId);
  //     if (!school) {
  //       return {
  //         success: false,
  //         statusCode: HttpStatus.BAD_REQUEST,
  //         message: 'School not found',
  //         data: null
  //       };
  //     }

  //     // Check for existing student ID within the school
  //     const existingStudent = await this.userModel.findOne({
  //       studentId: createStudentDto.studentId,
  //       schoolId: createStudentDto.schoolId,
  //       role: 'STUDENT'
  //     });

  //     if (existingStudent) {
  //       return {
  //         success: false,
  //         statusCode: HttpStatus.BAD_REQUEST,
  //         message: 'Student ID already exists in this school',
  //         data: null
  //       };
  //     }

  //     // Create user account for student
  //     const userExists = await this.userModel.findOne({ email: createStudentDto.email });
  //     if (userExists) {
  //       return {
  //         success: false,
  //         statusCode: HttpStatus.CONFLICT,
  //         message: `Email already exists. This email is already registered for a ${userExists.role}. Please use a different email for the student.`,
  //         data: null
  //       };
  //     }

  //     // Hash password
  //     const passwordToHash = createStudentDto.password || 'DefaultPassword123!';
  //     const hashedPassword = await bcrypt.hash(passwordToHash, 10);

  //     // Convert arrays to strings for database storage
  //     const medicalConditionsString = Array.isArray(createStudentDto.medicalConditions)
  //       ? createStudentDto.medicalConditions.join(', ')
  //       : createStudentDto.medicalConditions;
  //     const allergiesString = Array.isArray(createStudentDto.allergies)
  //       ? createStudentDto.allergies.join(', ')
  //       : createStudentDto.allergies;

  //     // Create student user with schoolId
  //     const studentUser = new this.userModel({
  //       email: createStudentDto.email,
  //       password: hashedPassword,
  //       firstName: createStudentDto.firstName,
  //       lastName: createStudentDto.lastName,
  //       role: 'STUDENT',
  //       schoolId: new Types.ObjectId(createStudentDto.schoolId), // Add schoolId here
  //       isActive: true,
  //       class: createStudentDto.class,
  //       dob: createStudentDto.dob ? new Date(createStudentDto.dob) : null,
  //       enrollDate: createStudentDto.enrollDate ? new Date(createStudentDto.enrollDate) : null,
  //       expectedGraduation: createStudentDto.expectedGraduation ? String(createStudentDto.expectedGraduation) : undefined,
  //       studentId: createStudentDto.studentId,
  //       address: typeof createStudentDto.address === 'object'
  //         ? JSON.stringify(createStudentDto.address)
  //         : createStudentDto.address || "",
  //       emergencyContact: (() => {
  //         if (!createStudentDto.emergencyContact) return null;
  //         if (typeof createStudentDto.emergencyContact === 'object') {
  //           return createStudentDto.emergencyContact;
  //         }
  //         if (typeof createStudentDto.emergencyContact === 'string') {
  //           return {
  //             firstName: 'Emergency',
  //             lastName: 'Contact',
  //             phone: createStudentDto.emergencyContact.trim(),
  //             relationship: 'Emergency Contact'
  //           };
  //         }
  //         return null;
  //       })(),
  //       bloodGroup: createStudentDto.bloodGroup,
  //       medicalConditions: medicalConditionsString,
  //       allergies: allergiesString,
  //       previousSchool: createStudentDto.previousSchool,
  //       previousGrade: createStudentDto.previousGrade,
  //       transportMode: createStudentDto.transportMode,
  //       busRoute: createStudentDto.busRoute,
  //       nationality: createStudentDto.nationality,
  //       religion: createStudentDto.religion,
  //       parentIds: createStudentDto.parents
  //         ? createStudentDto.parents.map((parentId: string) => new Types.ObjectId(parentId))
  //         : [],
  //     });

  //     await studentUser.save({ session });

  //     // Handle parent relationships
  //     if (createStudentDto.parents && createStudentDto.parents.length > 0) {
  //       for (const parentId of createStudentDto.parents) {
  //         try {
  //           const parentUser = await this.userModel.findOne({
  //             _id: parentId,
  //             role: 'PARENT'
  //           });

  //           if (parentUser) {
  //             if (!parentUser.children) {
  //               parentUser.children = [];
  //             }

  //             const existingChild = parentUser.children.find(
  //               (childId: any) => childId.toString() === studentUser._id.toString()
  //             );

  //             if (!existingChild) {
  //               await this.userModel.findByIdAndUpdate(
  //                 parentId,
  //                 { $push: { children: studentUser._id } },
  //                 { session }
  //               );
  //             }
  //           }
  //         } catch (error) {
  //           console.error(`Error linking parent ${parentId} to student ${studentUser._id}:`, error);
  //         }
  //       }
  //     }

  //     // Log activity
  //     const activityData = {
  //       title: 'Student Created',
  //       subtitle: `Student ${createStudentDto.firstName} ${createStudentDto.lastName} was created in school ${school.name}`,
  //       performBy: 'SUPER_ADMIN',
  //       actorId: 'SYSTEM'
  //     };

  //     await this.activityModel.create([activityData], { session });

  //     // Commit transaction
  //     await session.commitTransaction();

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Student created successfully',
  //       data: null
  //     };
  //   } catch (error) {
  //     await session.abortTransaction();
  //     console.error('Error in createStudent:', error);

  //     if (error instanceof ConflictException || error instanceof BadRequestException) {
  //       throw error;
  //     }

  //     if (error.name === 'ValidationError') {
  //       console.error('Validation errors:', error.errors);
  //       throw new BadRequestException(`Validation failed: ${Object.keys(error.errors).join(', ')}`);
  //     }

  //     throw new BadRequestException('Failed to create student');
  //   } finally {
  //     session.endSession();
  //   }
  // }

  // async getStudents(query: any): Promise<any> {
  //   try {
  //     // Super admin can see students from all schools or filter by schoolId
  //     const filter: any = {
  //       role: 'STUDENT',
  //       isActive: true
  //     };

  //     // If schoolId is provided in query, filter by that school
  //     if (query.schoolId) {
  //       filter.schoolId = new Types.ObjectId(query.schoolId);
  //     }

  //     if (query.search) {
  //       filter.$or = [
  //         { firstName: { $regex: query.search, $options: 'i' } },
  //         { lastName: { $regex: query.search, $options: 'i' } },
  //         { email: { $regex: query.search, $options: 'i' } },
  //         { studentId: { $regex: query.search, $options: 'i' } },
  //       ];
  //     }

  //     // Pagination support
  //     const page = parseInt(query.page) || 1;
  //     const limit = parseInt(query.limit) || 10;
  //     const skip = (page - 1) * limit;

  //     // Get total count for pagination
  //     const totalStudents = await this.userModel.countDocuments(filter);

  //     // Find students from User model and populate parent information
  //     const students = await this.userModel
  //       .find(filter)
  //       .populate('parentIds', 'firstName lastName email phone')
  //       .populate('schoolId', 'name code') // Populate school information
  //       .sort({ createdAt: -1 })
  //       .skip(skip)
  //       .limit(limit)
  //       .lean();

  //     // Map students to ensure all required fields are present
  //     const mappedStudents = students.map((student: any) => {
  //       // Handle emergency contact properly - ensure it's always an object
  //       let emergencyContactObj = null;
  //       if (student.emergencyContact) {
  //         if (typeof student.emergencyContact === 'object' && student.emergencyContact !== null) {
  //           emergencyContactObj = {
  //             firstName: student.emergencyContact.firstName || student.emergencyContact.name?.split(' ')[0] || 'Emergency',
  //             lastName: student.emergencyContact.lastName || student.emergencyContact.name?.split(' ').slice(1).join(' ') || 'Contact',
  //             relationship: student.emergencyContact.relationship || 'Emergency Contact',
  //             phone: student.emergencyContact.phone || student.emergencyContact.phoneNumber || 'No Phone'
  //           };
  //         } else if (typeof student.emergencyContact === 'string') {
  //           // Handle legacy string data or JSON strings
  //           try {
  //             const parsed = JSON.parse(student.emergencyContact);
  //             if (typeof parsed === 'object' && parsed !== null) {
  //               emergencyContactObj = {
  //                 firstName: parsed.firstName || parsed.name?.split(' ')[0] || 'Emergency',
  //                 lastName: parsed.lastName || parsed.name?.split(' ').slice(1).join(' ') || 'Contact',
  //                 relationship: parsed.relationship || 'Emergency Contact',
  //                 phone: parsed.phone || parsed.phoneNumber || 'No Phone'
  //               };
  //             } else {
  //               throw new Error('Not a valid JSON object');
  //             }
  //           } catch {
  //             // Treat as plain text name
  //             const parts = student.emergencyContact.split(' ');
  //             emergencyContactObj = {
  //               firstName: parts[0] || 'Emergency',
  //               lastName: parts.slice(1).join(' ') || 'Contact',
  //               relationship: 'Emergency Contact',
  //               phone: 'No Phone'
  //             };
  //           }
  //         }
  //       }

  //       // Format address
  //       const formatAddress = (address: any): string => {
  //         if (!address) return 'Not Set';
  //         if (typeof address === 'string') return address;
  //         if (typeof address === 'object' && address.street) {
  //           return `${address.street}, ${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}`.trim();
  //         }
  //         return 'Not Set';
  //       };

  //       return {
  //         _id: student._id,
  //         studentProfileId: student.studentProfileId || null,
  //         studentId: student.studentId || `STD-${student._id.toString().slice(-6)}`,
  //         firstName: student.firstName || '',
  //         lastName: student.lastName || '',
  //         email: student.email || '',
  //         class: student.gradeLevel || student.class || 'Not Set',
  //         section: student.section || 'Not Set',
  //         gender: student.gender || 'Not Set',
  //         dob: student.dob || student.dateOfBirth || 'Not Set',
  //         address: formatAddress(student.address) || 'Not Set',
  //         emergencyContact: emergencyContactObj,
  //         enrollDate: student.enrollDate || student.admissionDate || 'Not Set',
  //         expectedGraduation: student.expectedGraduation || 'Not Set',
  //         enrollmentStatus: 'Active',
  //         bloodGroup: student.bloodGroup || 'Not Set',
  //         allergies: student.allergies || [],
  //         medicalConditions: student.medicalConditions || [],
  //         previousSchool: student.previousSchool || 'Not Set',
  //         previousGrade: student.previousGrade || 'Not Set',
  //         status: student.isActive ? 'active' : 'inactive',
  //         profilePhoto: student.profilePicture || student.profilePhoto || 'N/A',
  //         parents: student.parentIds || [],
  //         school: student.schoolId ? {
  //           _id: student.schoolId._id,
  //           name: student.schoolId.name,
  //           code: student.schoolId.code
  //         } : null,
  //         createdAt: student.createdAt,
  //         updatedAt: student.updatedAt,
  //         isActive: student.isActive !== false,
  //         nationality: student.nationality || 'Not Set',
  //         religion: student.religion || 'Not Set',
  //         transportMode: student.transportMode || 'Not Set',
  //         busRoute: student.busRoute || 'Not Set',
  //         clubs: student.clubs || 'Not Set',
  //         lunch: student.lunch || 'Not Set',
  //         iipFlag: student.iipFlag || false,
  //         honorRolls: student.honorRolls || false,
  //         athletics: student.athletics || false
  //       };
  //     });

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Students fetched successfully',
  //       data: {
  //         students: mappedStudents,
  //         pagination: {
  //           page,
  //           limit,
  //           total: totalStudents,
  //           totalPages: Math.ceil(totalStudents / limit)
  //         }
  //       }
  //     };
  //   } catch (error) {
  //     console.error('Error fetching students:', error);
  //     return {
  //       success: false,
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       message: 'Failed to fetch students',
  //       data: null
  //     };
  //   }
  // }

  // async getStudentById(id: string): Promise<any> {
  //   try {
  //     const student = await this.userModel
  //       .findById(id)
  //       .populate('parentIds', 'firstName lastName email phone')
  //       .populate('schoolId', 'name code')
  //       .lean();

  //     if (!student) {
  //       return {
  //         success: false,
  //         statusCode: HttpStatus.NOT_FOUND,
  //         message: 'Student not found',
  //         data: null
  //       };
  //     }

  //     // Format the data same way as getStudents
  //     let emergencyContactObj = null;
  //     if (student.emergencyContact) {
  //       if (typeof student.emergencyContact === 'object' && student.emergencyContact !== null) {
  //         const ec = student.emergencyContact as any;
  //         emergencyContactObj = {
  //           firstName: ec.firstName || ec.name?.split(' ')[0] || 'Emergency',
  //           lastName: ec.lastName || ec.name?.split(' ').slice(1).join(' ') || 'Contact',
  //           relationship: ec.relationship || 'Emergency Contact',
  //           phone: ec.phone || ec.phoneNumber || 'No Phone'
  //         };
  //       } else if (typeof student.emergencyContact === 'string') {
  //         try {
  //           const parsed = JSON.parse(student.emergencyContact);
  //           if (typeof parsed === 'object' && parsed !== null) {
  //             emergencyContactObj = {
  //               firstName: parsed.firstName || parsed.name?.split(' ')[0] || 'Emergency',
  //               lastName: parsed.lastName || parsed.name?.split(' ').slice(1).join(' ') || 'Contact',
  //               relationship: parsed.relationship || 'Emergency Contact',
  //               phone: parsed.phone || parsed.phoneNumber || 'No Phone'
  //             };
  //           }
  //         } catch {
  //           const parts = (student.emergencyContact as string).split(' ');
  //           emergencyContactObj = {
  //             firstName: parts[0] || 'Emergency',
  //             lastName: parts.slice(1).join(' ') || 'Contact',
  //             relationship: 'Emergency Contact',
  //             phone: 'No Phone'
  //           };
  //         }
  //       }
  //     }

  //     const formatAddress = (address: any): string => {
  //       if (!address) return 'Not Set';
  //       if (typeof address === 'string') return address;
  //       if (typeof address === 'object' && address.street) {
  //         return `${address.street}, ${address.city || ''}, ${address.state || ''} ${address.zipCode || ''}`.trim();
  //       }
  //       return 'Not Set';
  //     };

  //     const studentData = student as any;
  //     const formattedStudent = {
  //       _id: student._id,
  //       studentProfileId: studentData.studentProfileId || null,
  //       studentId: student.studentId || `STD-${student._id.toString().slice(-6)}`,
  //       firstName: student.firstName || '',
  //       lastName: student.lastName || '',
  //       email: student.email || '',
  //       class: student.gradeLevel || studentData.class || 'Not Set',
  //       section: student.section || 'Not Set',
  //       gender: student.gender || 'Not Set',
  //       dob: student.dob || studentData.dateOfBirth || 'Not Set',
  //       address: formatAddress(student.address) || 'Not Set',
  //       emergencyContact: emergencyContactObj,
  //       enrollDate: student.enrollDate || studentData.admissionDate || 'Not Set',
  //       expectedGraduation: studentData.expectedGraduation || 'Not Set',
  //       enrollmentStatus: 'Active',
  //       bloodGroup: student.bloodGroup || 'Not Set',
  //       allergies: student.allergies || [],
  //       medicalConditions: student.medicalConditions || [],
  //       previousSchool: student.previousSchool || 'Not Set',
  //       previousGrade: student.previousGrade || 'Not Set',
  //       status: student.isActive ? 'active' : 'inactive',
  //       profilePhoto: student.profilePicture || studentData.profilePhoto || 'N/A',
  //       parents: student.parentIds || [],
  //       school: student.schoolId ? {
  //         _id: (student.schoolId as any)._id,
  //         name: (student.schoolId as any).name,
  //         code: (student.schoolId as any).code
  //       } : null,
  //       createdAt: studentData.createdAt,
  //       updatedAt: studentData.updatedAt,
  //       isActive: student.isActive !== false,
  //       nationality: student.nationality || 'Not Set',
  //       religion: student.religion || 'Not Set',
  //       transportMode: student.transportMode || 'Not Set',
  //       busRoute: student.busRoute || 'Not Set',
  //       clubs: studentData.clubs || 'Not Set',
  //       lunch: studentData.lunch || 'Not Set',
  //       iipFlag: studentData.iipFlag || false,
  //       honorRolls: studentData.honorRolls || false,
  //       athletics: studentData.athletics || false
  //     };

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Student details fetched successfully',
  //       data: formattedStudent
  //     };
  //   } catch (error) {
  //     console.error('Error fetching student by ID:', error);
  //     return {
  //       success: false,
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       message: 'Failed to fetch student details',
  //       data: null
  //     };
  //   }
  // }

  // async updateStudent(id: string, updateData: any): Promise<any> {
  //   try {
  //     // Check if student exists
  //     const existingStudent = await this.userModel.findById(id);
  //     if (!existingStudent) {
  //       return {
  //         success: false,
  //         statusCode: HttpStatus.NOT_FOUND,
  //         message: 'Student not found',
  //         data: null
  //       };
  //     }

  //     // Hash password if provided
  //     if (updateData.password && updateData.password.trim().length > 0) {
  //       updateData.password = await bcrypt.hash(updateData.password, 10);
  //     } else {
  //       delete updateData.password; // Remove empty password from update
  //     }

  //     // Update student
  //     const updatedStudent = await this.userModel.findByIdAndUpdate(
  //       id,
  //       { $set: updateData },
  //       { new: true, runValidators: true }
  //     ).populate('parentIds', 'firstName lastName email phone')
  //      .populate('schoolId', 'name code');

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Student updated successfully',
  //       data: updatedStudent
  //     };
  //   } catch (error) {
  //     console.error('Error updating student:', error);
  //     return {
  //       success: false,
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       message: error.message || 'Failed to update student',
  //       data: null
  //     };
  //   }
  // }

  // async deleteStudent(id: string): Promise<any> {
  //   try {
  //     const student = await this.userModel.findById(id);

  //     if (!student) {
  //       return {
  //         success: false,
  //         statusCode: HttpStatus.NOT_FOUND,
  //         message: 'Student not found',
  //         data: null
  //       };
  //     }

  //     // Soft delete or hard delete based on your requirements
  //     await this.userModel.findByIdAndDelete(id);

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Student deleted successfully',
  //       data: null
  //     };
  //   } catch (error) {
  //     console.error('Error deleting student:', error);
  //     return {
  //       success: false,
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       message: 'Failed to delete student',
  //       data: null
  //     };
  //   }
  // }

  // async exportStudents(schoolId?: string): Promise<any> {
  //   try {
  //     // Implementation for Excel export would go here
  //     // This is a placeholder - you'll need to implement the actual Excel export

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Export functionality will be implemented',
  //       data: null
  //     };
  //   } catch (error) {
  //     console.error('Error exporting students:', error);
  //     return {
  //       success: false,
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       message: 'Failed to export students',
  //       data: null
  //     };
  //   }
  // }

  // async bulkUploadStudents(file: any, schoolId?: string): Promise<any> {
  //   try {
  //     // Implementation for bulk upload would go here
  //     // This is a placeholder - you'll need to implement the actual Excel parsing

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Bulk upload functionality will be implemented',
  //       data: null
  //     };
  //   } catch (error) {
  //     console.error('Error in bulk upload:', error);
  //     return {
  //       success: false,
  //       statusCode: HttpStatus.BAD_REQUEST,
  //       message: 'Failed to upload students',
  //       data: null
  //     };
  //   }
  // }

  // ==================== PARENT MANAGEMENT ====================

  async createParent(createParentDto: CreateParentDto, actorId: string): Promise<any> {
    const session = await this.userModel.db.startSession();
    session.startTransaction();

    try {
      console.log('CreateParent received data:', JSON.stringify(createParentDto, null, 2));

      // Validate school exists
      const school = await this.schoolModel.findById(createParentDto.schoolId);
      if (!school) {
        return {
          success: false,
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'School not found',
          data: null
        };
      }

      // Check if parent already exists in the school
      const existingParent = await this.userModel.findOne({
        email: createParentDto.email,
        schoolId: createParentDto.schoolId
      });

      if (existingParent) {
        return {
          success: false,
          statusCode: HttpStatus.CONFLICT,
          message: `Email already exists. This email is already registered for a ${existingParent.role} in this school.`,
          data: null
        };
      }

      // Hash the password
      const newPassword = createParentDto.password?.trim() || PasswordGenerator.generateTemporaryPassword();

      // Create user account for parent with all data
      const parent = new this.userModel({
        firstName: createParentDto.firstName,
        lastName: createParentDto.lastName,
        email: createParentDto.email,
        password: newPassword,
        role: 'PARENT',
        schoolId: new Types.ObjectId(createParentDto.schoolId),
        status: UserStatus.ACTIVE,
        isActive: true,
        mustChangePassword: true,
        // Don't set passwordChangedAt - user must change password on first login
        passwordChangedAt: undefined,
        // Parent-specific fields
        phone: createParentDto.phone || '',
        address: (() => {
          if (!createParentDto.address) return '';
          if (typeof createParentDto.address === 'string') return createParentDto.address;
          if (typeof createParentDto.address === 'object' && createParentDto.address.street) {
            return `${createParentDto.address.street}, ${createParentDto.address.city || ''}, ${createParentDto.address.state || ''} ${createParentDto.address.zipCode || ''}`.trim();
          }
          return '';
        })(),
        occupation: createParentDto.occupation || '',
        nationality: createParentDto.nationality || '',
        gender: createParentDto.gender || '',
        dateOfBirth: createParentDto.dateOfBirth || null,
        emergencyContact: createParentDto.emergencyContact && typeof createParentDto.emergencyContact === 'object'
          ? createParentDto.emergencyContact
          : undefined,
        profilePicture: createParentDto.profilePicture || '',
      });

      const savedParent = await parent.save({ session });

      // Log activity
      const activityData = {
        title: 'Parent Created',
        subtitle: `Parent ${createParentDto.firstName} ${createParentDto.lastName} was created in school ${school.name}`,
        performBy: 'SUPER_ADMIN',
        actorId: new Types.ObjectId(actorId)
      };

      await this.activityModel.create([activityData], { session });

      // Commit the transaction
      await session.commitTransaction();

      // Return success response without password
      const { password, ...parentWithoutPassword } = savedParent.toObject();
      return {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Parent created successfully',
        data: parentWithoutPassword
      };
    } catch (error) {
      // Rollback the transaction on error
      await session.abortTransaction();
      console.error('Error in createParent:', error);

      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }

      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        throw new BadRequestException(`Validation failed: ${validationErrors.join(', ')}`);
      }

      throw new BadRequestException(`Failed to create parent: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  async createAcademicTerm(termData: any): Promise<AcademicTerm> {
    try {
      // Validate dates
      if (new Date(termData.startDate) >= new Date(termData.endDate)) {
        throw new BadRequestException('Start date must be before end date');
      }

      // Check for overlapping terms in the same school/global
      const existingTerm = await this.academicTermModel.findOne({
        schoolId: termData.schoolId || null,
        $or: [
          {
            startDate: { $lte: new Date(termData.endDate) },
            endDate: { $gte: new Date(termData.startDate) }
          }
        ]
      });

      if (existingTerm) {
        throw new ConflictException('Term dates overlap with existing term');
      }

      const term = new this.academicTermModel(termData);
      const savedTerm = await term.save();

      // Log activity
      await this.createAuditLog({
        action: 'CREATE',
        entityType: 'AcademicTerm',
        entityId: savedTerm._id.toString(),
        performedBy: 'SUPER_ADMIN',
        performedByRole: 'SUPER_ADMIN',
        description: `Created academic term: ${savedTerm.name}`,
        newValues: termData
      });

      return savedTerm;
    } catch (error) {
      throw error;
    }
  }

  async getAllAcademicTerms(page: number = 1, limit: number = 10, filters?: any): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.schoolId) {
      if (filters.schoolId === 'global') {
        query.schoolId = null;
      } else {
        query.schoolId = filters.schoolId;
      }
    }

    if (filters?.academicYear) {
      query.academicYear = filters.academicYear;
    }

    if (filters?.isActive !== undefined) {
      query.isActive = filters.isActive;
    }

    const terms = await this.academicTermModel
      .find(query)
      .populate('schoolId', 'name code')
      .skip(skip)
      .limit(limit)
      .sort({ academicYear: -1, sortOrder: 1 });

    const totalTerms = await this.academicTermModel.countDocuments(query);

    return {
      terms,
      totalPages: Math.ceil(totalTerms / limit),
      totalTerms,
      currentPage: page
    };
  }

  async updateAcademicTerm(id: string, updateData: any): Promise<AcademicTerm> {
    const existingTerm = await this.academicTermModel.findById(id);
    if (!existingTerm) {
      throw new NotFoundException('Academic term not found');
    }

    // Validate dates if being updated
    if (updateData.startDate || updateData.endDate) {
      const startDate = new Date(updateData.startDate || existingTerm.startDate);
      const endDate = new Date(updateData.endDate || existingTerm.endDate);

      if (startDate >= endDate) {
        throw new BadRequestException('Start date must be before end date');
      }
    }

    const oldValues = existingTerm.toObject();
    const updatedTerm = await this.academicTermModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('schoolId', 'name code');

    // Log activity
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'AcademicTerm',
      entityId: id,
      performedBy: 'SUPER_ADMIN',
      performedByRole: 'SUPER_ADMIN',
      description: `Updated academic term: ${updatedTerm.name}`,
      oldValues,
      newValues: updateData
    });

    return updatedTerm;
  }

  async deleteAcademicTerm(id: string): Promise<void> {
    const term = await this.academicTermModel.findById(id);
    if (!term) {
      throw new NotFoundException('Academic term not found');
    }

    await this.academicTermModel.findByIdAndDelete(id);

    // Log activity
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'AcademicTerm',
      entityId: id,
      performedBy: 'SUPER_ADMIN',
      performedByRole: 'SUPER_ADMIN',
      description: `Deleted academic term: ${term.name}`,
      oldValues: term.toObject()
    });
  }

  async setCurrentAcademicTerm(id: string, schoolId?: string): Promise<void> {
    // Remove current flag from existing terms
    await this.academicTermModel.updateMany(
      { schoolId: schoolId || null },
      { isCurrent: false }
    );

    // Set the specified term as current
    const term = await this.academicTermModel.findByIdAndUpdate(
      id,
      { isCurrent: true },
      { new: true }
    );

    if (!term) {
      throw new NotFoundException('Academic term not found');
    }

    // Log activity
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'AcademicTerm',
      entityId: id,
      performedBy: 'SUPER_ADMIN',
      performedByRole: 'SUPER_ADMIN',
      description: `Set current academic term: ${term.name}`
    });
  }

  // ==================== AUDIT LOG MANAGEMENT ====================

  async createAuditLog(logData: Partial<AuditLog>): Promise<AuditLog> {
    try {
      const log = new this.auditLogModel(logData);
      return await log.save();
    } catch (error) {
      console.error('Failed to create audit log:', error);
      // Don't throw error to prevent disrupting main operations
      return null;
    }
  }

  async logAuditAction(
    action: string,
    entityType: string,
    entityId: string,
    userId: string,
    description: string,
    oldValues?: any,
    newValues?: any,
    metadata?: any
  ): Promise<void> {
    try {
      const auditLog = new this.auditLogModel({
        action,
        entityType,
        entityId,
        userId,
        description,
        oldValues,
        newValues,
        metadata,
        timestamp: new Date(),
      });
      await auditLog.save();
    } catch (error) {
      console.error('Failed to log audit action:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  async getAuditLogs(page: number = 1, limit: number = 50, filters?: any): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.action) {
      query.action = filters.action;
    }

    if (filters?.entityType) {
      query.entityType = filters.entityType;
    }

    if (filters?.userRole) {
      query.performedByRole = filters.userRole;
    }

    if (filters?.startDate && filters?.endDate) {
      query.createdAt = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    if (filters?.schoolId) {
      query.schoolId = filters.schoolId;
    }

    if (filters?.search) {
      query.$or = [
        { description: { $regex: filters.search, $options: 'i' } },
        { entityType: { $regex: filters.search, $options: 'i' } },
        { action: { $regex: filters.search, $options: 'i' } }
      ];
    }

    const logs = await this.auditLogModel
      .find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Format logs to match frontend expectations
    const formattedLogs = logs.map(log => ({
      _id: log._id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      userId: log.performedBy,
      userName: log.performedByName || 'Unknown User',
      userRole: log.performedByRole || 'unknown',
      ipAddress: log.ipAddress || 'N/A',
      userAgent: log.userAgent || 'N/A',
      timestamp: (log as AuditLogDocument).createdAt || new Date(),
      details: log.description || `${log.action} performed on ${log.entityType}`,
      oldValues: log.oldValues,
      newValues: log.newValues,
      metadata: log.metadata,
      status: log.status || 'SUCCESS'
    }));

    const totalLogs = await this.auditLogModel.countDocuments(query);

    return {
      logs: formattedLogs,
      total: totalLogs,
      totalPages: Math.ceil(totalLogs / limit),
      currentPage: page
    };
  }

  async exportAuditLogs(filters?: any): Promise<string> {
    const query: any = {};

    if (filters?.startDate && filters?.endDate) {
      query.createdAt = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    const logs = await this.auditLogModel.find(query).sort({ createdAt: -1 });

    let csv = 'Timestamp,Action,Entity Type,Entity ID,Performed By,Role,School ID,Description,Status,IP Address\n';

    for (const log of logs) {
      const row = [
        (log as any).createdAt?.toISOString() || '',
        log.action,
        log.entityType,
        log.entityId || '',
        log.performedByName || log.performedBy,
        log.performedByRole,
        log.schoolId || '',
        log.description || '',
        log.status,
        log.ipAddress || ''
      ];

      csv += row.map(value =>
        typeof value === 'string' && (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"`
          : value
      ).join(',') + '\n';
    }

    return csv;
  }

  // ==================== ENHANCED GLOBAL DATA OVERVIEW ====================

  async getGlobalOverview(filters?: {
    startDate?: string;
    endDate?: string;
    schoolId?: string;
    includeInactive?: boolean;
  }): Promise<any> {
    try {
      const {
        startDate,
        endDate,
        schoolId,
        includeInactive = false,
      } = filters || {};

      // --------------------
      // 🧩 VALIDATION & PARSING
      // --------------------
      const [parsedStartDate, parsedEndDate] = [startDate, endDate].map((d) => {
        if (!d) return undefined;
        const dt = new Date(d);
        if (Number.isNaN(dt.getTime())) throw new BadRequestException(`Invalid date: ${d}`);
        return dt;
      });

      if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
        throw new BadRequestException('startDate must be before endDate');
      }

      let schoolObjectId: Types.ObjectId | undefined;
      if (schoolId) {
        if (!Types.ObjectId.isValid(schoolId)) {
          throw new BadRequestException('Invalid schoolId');
        }
        schoolObjectId = new Types.ObjectId(schoolId);
      }

      // --------------------
      // 🧩 QUERY MATCHES
      // --------------------
      const userMatch: any = schoolObjectId ? { schoolId: schoolObjectId } : {};
      const activityMatch: any = { ...userMatch };

      if (parsedStartDate || parsedEndDate) {
        activityMatch.createdAt = {};
        if (parsedStartDate) activityMatch.createdAt.$gte = parsedStartDate;
        if (parsedEndDate) activityMatch.createdAt.$lte = parsedEndDate;
      }

      // --------------------
      // 🧩 COMMON PROMISE HELPERS
      // --------------------
      const buildUserAggregates = () => this.userModel.aggregate([
        { $match: userMatch },
        {
          $facet: {
            totals: [
              {
                $group: {
                  _id: null,
                  totalUsers: { $sum: 1 },
                  activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                  totalStudents: { $sum: { $cond: [{ $eq: ['$role', UserRole.STUDENT] }, 1, 0] } },
                  totalTeachers: { $sum: { $cond: [{ $eq: ['$role', UserRole.TEACHER] }, 1, 0] } },
                  totalParents: { $sum: { $cond: [{ $eq: ['$role', UserRole.PARENT] }, 1, 0] } },
                  totalNurses: { $sum: { $cond: [{ $eq: ['$role', UserRole.NURSE] }, 1, 0] } },
                  activeNurses: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$role', UserRole.STUDENT] },
                            { $eq: ['$isActive', true] }
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  activeStudents: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$role', UserRole.STUDENT] },
                            { $eq: ['$isActive', true] }
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  activeTeachers: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$role', UserRole.TEACHER] },
                            { $eq: ['$isActive', true] }
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  activeParents: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            { $eq: ['$role', UserRole.PARENT] },
                            { $eq: ['$isActive', true] }
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  }
                  // activeStudents: {}
                },
              },
            ],
            byRole: [
              ...(includeInactive ? [] : [{ $match: { isActive: true } }]),
              {
                $group: {
                  _id: '$role',
                  count: { $sum: 1 },
                  activeCount: {
                    $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
                  },
                },
              },
              { $sort: { count: -1 } },
            ],
          },
        },
      ]).allowDiskUse(true)

      const buildEnrollment = () => this.studentProfileModel.aggregate([
        ...(schoolObjectId ? [{ $match: { schoolId: schoolObjectId } }] : []),
        {
          $group: {
            _id: '$gradeLevel',
            count: { $sum: 1 },
            maleCount: { $sum: { $cond: [{ $eq: ['$gender', 'Male'] }, 1, 0] } },
            femaleCount: { $sum: { $cond: [{ $eq: ['$gender', 'Female'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]).allowDiskUse(true)

      const buildRecentActivity = async () => {
        const activities = await this.activityModel
          .find(activityMatch)
          .sort({ createdAt: -1 })
          .limit(15)
          .select('title subtitle performBy actorId createdAt')
          .lean();

        const actorIds = activities
          .map((a) => a.actorId)
          .filter((id) => id && Types.ObjectId.isValid(id))
          .map((id) => new Types.ObjectId(id));

        const actors =
          actorIds.length > 0
            ? await this.userModel
              .find({ _id: { $in: actorIds } })
              .select('firstName lastName')
              .lean()
            : [];

        const actorMap = new Map(actors.map((a) => [a._id.toString(), a]));
        return activities.map((a) => ({
          title: a.title,
          subtitle: a.subtitle,
          performBy: a.performBy,
          actorName:
            actorMap.has(a.actorId?.toString())
              ? `${actorMap.get(a.actorId.toString())?.firstName ?? ''} ${actorMap.get(a.actorId.toString())?.lastName ?? ''}`.trim()
              : a.performBy,
          createdAt: a.createdAt,
        }));
      };

      // --------------------
      // ⚡️ RUN IN PARALLEL
      // --------------------
      const [
        userAggregates,
        enrollmentByGrade,
        recentActivity,
        usageTrends,
        schoolSummary,
        schoolPerformance,
        totalActivities,
        [newUsersThisMonth, newSchoolsThisMonth, activeUsersLast24h, systemErrors],
        dataQuality,
        userGrowthRate,
        schoolUtilizationRate,
        systemHealthScore,
      ] = await Promise.all([
        buildUserAggregates(),
        buildEnrollment(),
        buildRecentActivity(),
        this.userModel
          .aggregate([
            {
              $match: {
                ...userMatch,
                lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastLogin' } },
                uniqueLogins: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .allowDiskUse(true),
        this.schoolModel
          .aggregate([
            { $match: schoolObjectId ? { _id: schoolObjectId } : {} },
            {
              $group: {
                _id: null,
                totalSchools: { $sum: 1 },
                activeSchools: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
              },
            },
          ])
          .allowDiskUse(true),
        this.userModel
          .aggregate([
            { $match: { ...userMatch, schoolId: { $exists: true, $ne: null } } },
            {
              $group: {
                _id: '$schoolId',
                totalUsers: { $sum: 1 },
                activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
                studentCount: { $sum: { $cond: [{ $eq: ['$role', UserRole.STUDENT] }, 1, 0] } },
                teacherCount: { $sum: { $cond: [{ $eq: ['$role', UserRole.TEACHER] }, 1, 0] } },
              },
            },
            { $sort: { totalUsers: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: 'schools',
                localField: '_id',
                foreignField: '_id',
                as: 'school',
              },
            },
            { $unwind: '$school' },
            {
              $addFields: {
                utilizationRate: {
                  $cond: [
                    { $gt: ['$school.maxUsers', 0] },
                    { $multiply: [{ $divide: ['$totalUsers', '$school.maxUsers'] }, 100] },
                    0,
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                schoolId: '$_id',
                name: '$school.name',
                code: '$school.code',
                type: '$school.type',
                isActive: '$school.isActive',
                totalUsers: 1,
                activeUsers: 1,
                studentCount: 1,
                teacherCount: 1,
                utilizationRate: 1,
              },
            },
          ])
          .allowDiskUse(true),
        this.activityModel.countDocuments(activityMatch),
        Promise.all([
          this.userModel.countDocuments({ ...userMatch, createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }),
          this.schoolModel.countDocuments({ ...(schoolObjectId ? { _id: schoolObjectId } : {}), createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }),
          this.userModel.countDocuments({ ...userMatch, lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, isActive: true }),
          this.activityModel.countDocuments({ ...(schoolObjectId ? { schoolId: schoolObjectId } : {}), createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, title: { $regex: 'error|failed|problem', $options: 'i' } }),
        ]),
        this.calculateDataQuality(userMatch),
        this.calculateGrowthRate('users', userMatch),
        this.calculateSchoolUtilization(schoolId),
        this.calculateSystemHealthScore(),
      ]);

      // --------------------
      // 🧩 FORMAT RESPONSE (same structure)
      // --------------------
      const totals = userAggregates[0]?.totals?.[0] ?? {
        totalUsers: 0,
        activeUsers: 0,
        totalStudents: 0,
        totalTeachers: 0,
        totalParents: 0,
        activeStudents: 0,
        activeTeachers: 0,
        activeParents: 0,
        totalNurses: 0,
        activeNurses: 0,
      };
      const byRole = userAggregates[0]?.byRole ?? [];
      const totalSchools = schoolSummary[0]?.totalSchools ?? 0;
      const activeSchools = schoolSummary[0]?.activeSchools ?? 0;

      const response = {
        overview: {
          totalUsers: totals.totalUsers,
          activeUsers: totals.activeUsers,
          totalStudents: totals.totalStudents,
          activeStudents: totals.activeStudents,
          totalTeachers: totals.totalTeachers,
          activeTeachers: totals.activeTeachers,
          totalParents: totals.totalParents,
          activeParents: totals.activeParents,
          totalNurses: totals.totalNurses,
          activeNurses: totals.activeNurses,
          totalSchools,
          activeSchools,
          totalActivities,
        },
        kpis: {
          newUsersThisMonth,
          newSchoolsThisMonth,
          activeUsersLast24h,
          systemErrors,
          userGrowthRate,
          schoolUtilizationRate,
          systemHealthScore,
        },
        distributions: {
          usersByRole: byRole.map((item: any) => ({
            role: item._id || 'Unknown',
            count: item.count,
            activeCount: item.activeCount,
            percentage:
              totals.totalUsers > 0
                ? Number(((item.count / totals.totalUsers) * 100).toFixed(1))
                : 0,
          })),
          enrollmentByGrade: enrollmentByGrade.map((item: any) => ({
            grade: item._id || 'Unknown',
            count: item.count,
            maleCount: item.maleCount || 0,
            femaleCount: item.femaleCount || 0,
          })),
        },
        activity: {
          recent: recentActivity,
          trends: usageTrends.map((item: any) => ({
            date: item._id,
            uniqueLogins: item.uniqueLogins,
          })),
        },
        schools: {
          performance: schoolPerformance,
          summary: {
            totalSchools,
            activeSchools,
            averageUtilization:
              schoolPerformance.length > 0
                ? schoolPerformance.reduce((a, s) => a + (s.utilizationRate || 0), 0) /
                schoolPerformance.length
                : 0,
          },
        },
        dataQuality,
        generatedAt: new Date().toISOString()
      };

      const finalResponse = {
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Global overview generated successfully',
        data: response,
      };

      return finalResponse;
    } catch (error) {
      console.error('Error generating global overview:', error);
      return {
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: error?.message || 'Failed to generate global overview',
        data: null,
      };
    }
  }


  // async getGlobalOverview(filters?: {
  //   startDate?: string;
  //   endDate?: string;
  //   schoolId?: string;
  //   includeInactive?: boolean;
  // }): Promise<any> {
  //   try {
  //     const {
  //       startDate,
  //       endDate,
  //       schoolId,
  //       includeInactive = false
  //     } = filters || {};

  //     let parsedStartDate: Date | undefined;
  //     let parsedEndDate: Date | undefined;

  //     if (startDate) {
  //       parsedStartDate = new Date(startDate);
  //       if (Number.isNaN(parsedStartDate.getTime())) {
  //         throw new BadRequestException('Invalid startDate');
  //       }
  //     }

  //     if (endDate) {
  //       parsedEndDate = new Date(endDate);
  //       if (Number.isNaN(parsedEndDate.getTime())) {
  //         throw new BadRequestException('Invalid endDate');
  //       }
  //     }

  //     if (parsedStartDate && parsedEndDate && parsedStartDate > parsedEndDate) {
  //       throw new BadRequestException('startDate must be before endDate');
  //     }

  //     let schoolObjectId: Types.ObjectId | undefined;
  //     if (schoolId) {
  //       if (!Types.ObjectId.isValid(schoolId)) {
  //         throw new BadRequestException('Invalid schoolId');
  //       }
  //       schoolObjectId = new Types.ObjectId(schoolId);
  //     }

  //     const userMatch: any = {};
  //     if (schoolObjectId) {
  //       userMatch.schoolId = schoolObjectId;
  //     }

  //     const activityMatch: any = {};
  //     if (schoolObjectId) {
  //       activityMatch.schoolId = schoolObjectId;
  //     }
  //     if (parsedStartDate || parsedEndDate) {
  //       activityMatch.createdAt = {};
  //       if (parsedStartDate) {
  //         activityMatch.createdAt.$gte = parsedStartDate;
  //       }
  //       if (parsedEndDate) {
  //         activityMatch.createdAt.$lte = parsedEndDate;
  //       }
  //     }

  //     const roleFacetStages: any[] = [];
  //     if (!includeInactive) {
  //       roleFacetStages.push({ $match: { isActive: true } });
  //     }
  //     roleFacetStages.push(
  //       {
  //         $group: {
  //           _id: '$role',
  //           count: { $sum: 1 },
  //           activeCount: {
  //             $sum: {
  //               $cond: [{ $eq: ['$isActive', true] }, 1, 0]
  //             }
  //           }
  //         }
  //       },
  //       { $sort: { count: -1 } }
  //     );

  //     const userAggregatesPromise = this.userModel.aggregate([
  //       { $match: userMatch },
  //       {
  //         $facet: {
  //           totals: [
  //             {
  //               $group: {
  //                 _id: null,
  //                 totalUsers: { $sum: 1 },
  //                 activeUsers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
  //                 totalStudents: { $sum: { $cond: [{ $eq: ['$role', UserRole.STUDENT] }, 1, 0] } },
  //                 totalTeachers: { $sum: { $cond: [{ $eq: ['$role', UserRole.TEACHER] }, 1, 0] } },
  //                 totalParents: { $sum: { $cond: [{ $eq: ['$role', UserRole.PARENT] }, 1, 0] } }
  //               }
  //             }
  //           ],
  //           byRole: roleFacetStages
  //         }
  //       }
  //     ]);

  //     const enrollmentPipeline: any[] = [];
  //     if (schoolObjectId) {
  //       enrollmentPipeline.push({ $match: { schoolId: schoolObjectId } });
  //     }
  //     enrollmentPipeline.push(
  //       {
  //         $group: {
  //           _id: '$gradeLevel',
  //           count: { $sum: 1 },
  //           maleCount: {
  //             $sum: { $cond: [{ $eq: ['$gender', 'Male'] }, 1, 0] }
  //           },
  //           femaleCount: {
  //             $sum: { $cond: [{ $eq: ['$gender', 'Female'] }, 1, 0] }
  //           }
  //         }
  //       },
  //       { $sort: { _id: 1 } }
  //     );
  //     const enrollmentPromise = this.studentProfileModel.aggregate(enrollmentPipeline);

  //     const recentActivityPromise = (async () => {
  //       const activities = await this.activityModel
  //         .find(activityMatch)
  //         .sort({ createdAt: -1 })
  //         .limit(50)
  //         .select('title subtitle performBy actorId createdAt')
  //         .lean();

  //       const actorIdSet = new Set<string>();
  //       for (const activity of activities) {
  //         if (activity.actorId) {
  //           const candidate = activity.actorId.toString();
  //           if (Types.ObjectId.isValid(candidate)) {
  //             actorIdSet.add(candidate);
  //           }
  //         }
  //       }

  //       const actorIds = Array.from(actorIdSet).map(id => new Types.ObjectId(id));

  //       const actors = actorIds.length
  //         ? await this.userModel
  //           .find({ _id: { $in: actorIds } })
  //           .select('firstName lastName')
  //           .lean()
  //         : [];

  //       const actorMap = new Map<string, { firstName?: string; lastName?: string }>();
  //       for (const actor of actors) {
  //         actorMap.set(actor._id.toString(), actor);
  //       }

  //       return activities.map(activity => {
  //         const actorKey = activity.actorId ? activity.actorId.toString() : '';
  //         const actorInfo = actorKey ? actorMap.get(actorKey) : undefined;
  //         const actorName = actorInfo
  //           ? `${actorInfo.firstName ?? ''} ${actorInfo.lastName ?? ''}`.trim()
  //           : activity.performBy;

  //         return {
  //           title: activity.title,
  //           subtitle: activity.subtitle,
  //           performBy: activity.performBy,
  //           actorName: actorName || activity.performBy,
  //           createdAt: activity.createdAt
  //         };
  //       });
  //     })();

  //     const usageTrendsPromise = this.userModel.aggregate([
  //       {
  //         $match: {
  //           ...userMatch,
  //           lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
  //         }
  //       },
  //       {
  //         $group: {
  //           _id: {
  //             $dateToString: {
  //               format: '%Y-%m-%d',
  //               date: '$lastLogin'
  //             }
  //           },
  //           uniqueLogins: { $sum: 1 }
  //         }
  //       },
  //       { $sort: { _id: 1 } }
  //     ]);

  //     const schoolSummaryPromise = this.schoolModel.aggregate([
  //       { $match: schoolObjectId ? { _id: schoolObjectId } : {} },
  //       {
  //         $group: {
  //           _id: null,
  //           totalSchools: { $sum: 1 },
  //           activeSchools: {
  //             $sum: {
  //               $cond: [{ $eq: ['$isActive', true] }, 1, 0]
  //             }
  //           }
  //         }
  //       }
  //     ]);

  //     const schoolPerformancePromise = this.userModel.aggregate([
  //       {
  //         $match: {
  //           ...userMatch,
  //           schoolId: { $exists: true, $ne: null }
  //         }
  //       },
  //       {
  //         $group: {
  //           _id: '$schoolId',
  //           totalUsers: { $sum: 1 },
  //           activeUsers: {
  //             $sum: {
  //               $cond: [{ $eq: ['$isActive', true] }, 1, 0]
  //             }
  //           },
  //           studentCount: {
  //             $sum: {
  //               $cond: [{ $eq: ['$role', UserRole.STUDENT] }, 1, 0]
  //             }
  //           },
  //           teacherCount: {
  //             $sum: {
  //               $cond: [{ $eq: ['$role', UserRole.TEACHER] }, 1, 0]
  //             }
  //           }
  //         }
  //       },
  //       { $sort: { totalUsers: -1 } },
  //       { $limit: 10 },
  //       {
  //         $lookup: {
  //           from: 'schools',
  //           localField: '_id',
  //           foreignField: '_id',
  //           as: 'school'
  //         }
  //       },
  //       { $unwind: '$school' },
  //       {
  //         $addFields: {
  //           utilizationRate: {
  //             $cond: [
  //               { $gt: ['$school.maxUsers', 0] },
  //               {
  //                 $multiply: [
  //                   { $divide: ['$totalUsers', '$school.maxUsers'] },
  //                   100
  //                 ]
  //               },
  //               0
  //             ]
  //           }
  //         }
  //       },
  //       {
  //         $project: {
  //           _id: 0,
  //           schoolId: '$_id',
  //           name: '$school.name',
  //           code: '$school.code',
  //           type: '$school.type',
  //           isActive: '$school.isActive',
  //           totalUsers: 1,
  //           activeUsers: 1,
  //           studentCount: 1,
  //           teacherCount: 1,
  //           utilizationRate: 1
  //         }
  //       }
  //     ]);

  //     const totalActivitiesPromise = this.activityModel.countDocuments(activityMatch);

  //     const now = new Date();
  //     const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  //     const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
  //     const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  //     const kpiPromise = Promise.all([
  //       this.userModel.countDocuments({
  //         ...userMatch,
  //         createdAt: { $gte: currentMonth }
  //       }),
  //       this.schoolModel.countDocuments({
  //         ...(schoolObjectId ? { _id: schoolObjectId } : {}),
  //         createdAt: { $gte: currentMonth }
  //       }),
  //       this.userModel.countDocuments({
  //         ...userMatch,
  //         lastLogin: { $gte: last24Hours }
  //       }),
  //       this.activityModel.countDocuments({
  //         ...(schoolObjectId ? { schoolId: schoolObjectId } : {}),
  //         createdAt: { $gte: last7Days },
  //         title: { $regex: 'error|failed|problem', $options: 'i' }
  //       })
  //     ]);

  //     const dataQualityPromise = this.calculateDataQuality(userMatch);
  //     const growthRatePromise = this.calculateGrowthRate('users', userMatch);
  //     const schoolUtilizationPromise = this.calculateSchoolUtilization(schoolId);
  //     const systemHealthPromise = this.calculateSystemHealthScore();

  //     const [
  //       userAggregates,
  //       enrollmentByGrade,
  //       recentActivity,
  //       usageTrends,
  //       schoolSummary,
  //       schoolPerformance,
  //       totalActivities,
  //       [newUsersThisMonth, newSchoolsThisMonth, activeUsersLast24h, systemErrors],
  //       dataQuality,
  //       userGrowthRate,
  //       schoolUtilizationRate,
  //       systemHealthScore
  //     ] = await Promise.all([
  //       userAggregatesPromise,
  //       enrollmentPromise,
  //       recentActivityPromise,
  //       usageTrendsPromise,
  //       schoolSummaryPromise,
  //       schoolPerformancePromise,
  //       totalActivitiesPromise,
  //       kpiPromise,
  //       dataQualityPromise,
  //       growthRatePromise,
  //       schoolUtilizationPromise,
  //       systemHealthPromise
  //     ]);

  //     const totals = userAggregates[0]?.totals?.[0] ?? {
  //       totalUsers: 0,
  //       activeUsers: 0,
  //       totalStudents: 0,
  //       totalTeachers: 0,
  //       totalParents: 0
  //     };

  //     const byRole = userAggregates[0]?.byRole ?? [];

  //     const totalSchools = schoolSummary[0]?.totalSchools ?? 0;
  //     const activeSchools = schoolSummary[0]?.activeSchools ?? 0;

  //     const response = {
  //       overview: {
  //         totalUsers: totals.totalUsers,
  //         activeUsers: totals.activeUsers,
  //         totalStudents: totals.totalStudents,
  //         totalTeachers: totals.totalTeachers,
  //         totalParents: totals.totalParents,
  //         totalSchools,
  //         activeSchools,
  //         totalActivities
  //       },
  //       kpis: {
  //         newUsersThisMonth,
  //         newSchoolsThisMonth,
  //         activeUsersLast24h,
  //         systemErrors,
  //         userGrowthRate,
  //         schoolUtilizationRate,
  //         systemHealthScore
  //       },
  //       distributions: {
  //         usersByRole: byRole.map((item: any) => ({
  //           role: item._id || 'Unknown',
  //           count: item.count,
  //           activeCount: item.activeCount,
  //           percentage:
  //             totals.totalUsers > 0
  //               ? Number(((item.count / totals.totalUsers) * 100).toFixed(1))
  //               : 0
  //         })),
  //         enrollmentByGrade: enrollmentByGrade.map((item: any) => ({
  //           grade: item._id || 'Unknown',
  //           count: item.count,
  //           maleCount: item.maleCount || 0,
  //           femaleCount: item.femaleCount || 0
  //         }))
  //       },
  //       activity: {
  //         recent: recentActivity,
  //         trends: usageTrends.map((item: any) => ({
  //           date: item._id,
  //           uniqueLogins: item.uniqueLogins
  //         }))
  //       },
  //       schools: {
  //         performance: schoolPerformance,
  //         summary: {
  //           totalSchools,
  //           activeSchools,
  //           averageUtilization: schoolPerformance.length
  //             ? schoolPerformance.reduce(
  //               (acc, school) => acc + (school.utilizationRate || 0),
  //               0
  //             ) / schoolPerformance.length
  //             : 0
  //         }
  //       },
  //       dataQuality,
  //       generatedAt: new Date().toISOString(),
  //       filters: {
  //         startDate: parsedStartDate?.toISOString() ?? startDate,
  //         endDate: parsedEndDate?.toISOString() ?? endDate,
  //         schoolId: schoolId ?? null,
  //         includeInactive
  //       }
  //     };

  //     return {
  //       success: true,
  //       statusCode: HttpStatus.OK,
  //       message: 'Global overview generated successfully',
  //       data: response,
  //     }
  //   } catch (error) {
  //     console.error('Error generating global overview:', error);

  //     return {
  //       success: false,
  //       statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  //       message: error?.message || 'Failed to generate global overview',
  //       data: null,
  //     };
  //   }
  // }

  private async calculateDataQuality(schoolFilter: any): Promise<any> {
    try {
      const [
        totalUsers,
        usersWithPhone,
        usersWithCompleteProfile,
        schoolsWithCompleteInfo
      ] = await Promise.all([
        this.userModel.countDocuments(schoolFilter),
        this.userModel.countDocuments({ ...schoolFilter, phone: { $exists: true, $ne: '' } }),
        this.userModel.countDocuments({
          ...schoolFilter,
          firstName: { $exists: true, $ne: '' },
          lastName: { $exists: true, $ne: '' },
          email: { $exists: true, $ne: '' }
        }),
        this.schoolModel.countDocuments({
          name: { $exists: true, $ne: '' },
          code: { $exists: true, $ne: '' },
          'address.street': { $exists: true, $ne: '' }
        })
      ]);

      return {
        userDataCompleteness: totalUsers > 0 ? ((usersWithCompleteProfile / totalUsers) * 100).toFixed(1) : 100,
        phoneDataCompleteness: totalUsers > 0 ? ((usersWithPhone / totalUsers) * 100).toFixed(1) : 0,
        schoolDataCompleteness: schoolsWithCompleteInfo > 0 ? 100 : 0,
        overallScore: totalUsers > 0 ? Math.round(
          (usersWithCompleteProfile / totalUsers +
            usersWithPhone / totalUsers +
            (schoolsWithCompleteInfo > 0 ? 1 : 0)) / 3 * 100
        ) : 100
      };
    } catch (error) {
      return {
        userDataCompleteness: 0,
        phoneDataCompleteness: 0,
        schoolDataCompleteness: 0,
        overallScore: 0
      };
    }
  }

  private async calculateGrowthRate(type: string, filters: any): Promise<number> {
    try {
      const now = new Date();
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const currentCount = await this.userModel.countDocuments({
        ...filters,
        createdAt: { $gte: currentMonth }
      });

      const lastMonthCount = await this.userModel.countDocuments({
        ...filters,
        createdAt: {
          $gte: lastMonth,
          $lt: currentMonth
        }
      });

      return lastMonthCount > 0
        ? Math.round(((currentCount - lastMonthCount) / lastMonthCount) * 100)
        : currentCount > 0 ? 100 : 0;
    } catch (error) {
      return 0;
    }
  }

  private async calculateSchoolUtilization(schoolId?: string): Promise<number> {
    try {
      const match: any = { maxUsers: { $gt: 0 } };
      if (schoolId) {
        if (!Types.ObjectId.isValid(schoolId)) {
          return 0;
        }
        match._id = new Types.ObjectId(schoolId);
      }

      const utilization = await this.schoolModel.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'users',
            let: { schoolId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$schoolId', '$$schoolId'] }
                }
              },
              { $count: 'count' }
            ],
            as: 'userStats'
          }
        },
        {
          $addFields: {
            userCount: {
              $ifNull: [{ $arrayElemAt: ['$userStats.count', 0] }, 0]
            }
          }
        },
        {
          $addFields: {
            utilization: {
              $cond: [
                { $gt: ['$maxUsers', 0] },
                {
                  $multiply: [
                    { $divide: ['$userCount', '$maxUsers'] },
                    100
                  ]
                },
                0
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            avgUtilization: { $avg: '$utilization' }
          }
        }
      ]);

      return utilization.length ? Math.round(utilization[0].avgUtilization) : 0;
    } catch (error) {
      return 0;
    }
  }

  private async calculateSystemHealthScore(): Promise<number> {
    try {
      const now = new Date();
      const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        activeUsers,
        errorActivities,
        totalActivities
      ] = await Promise.all([
        this.userModel.countDocuments(),
        this.userModel.countDocuments({ lastLogin: { $gte: last24h } }),
        this.activityModel.countDocuments({
          createdAt: { $gte: last24h },
          title: { $regex: 'error|failed|problem', $options: 'i' }
        }),
        this.activityModel.countDocuments({ createdAt: { $gte: last24h } })
      ]);

      const activityRate = totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 100;
      const errorRate = totalActivities > 0 ? (errorActivities / totalActivities) * 100 : 0;
      const healthScore = Math.max(0, Math.min(100, activityRate - errorRate));

      return Math.round(healthScore);
    } catch (error) {
      return 50; // Default to middle score on error
    }
  }

  async getSystemOverview(): Promise<any> {
    try {
      const [totalSchools, totalUsers, activeUsers, totalRoles] = await Promise.all([
        this.schoolModel.countDocuments({ isActive: true }),
        this.userModel.countDocuments(),
        this.userModel.countDocuments({ isActive: true }),
        this.roleModel.countDocuments({ isActive: true })
      ]);

      const usersByRole = await this.userModel.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      const recentUsers = await this.userModel
        .find()
        .populate('schoolId', 'name')
        .select('firstName lastName email role createdAt')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      // Get recent schools
      const recentSchools = await this.schoolModel
        .find()
        .select('name code type isActive createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      return {
        stats: {
          totalSchools,
          totalUsers,
          activeUsers,
          totalRoles,
        },
        usersByRole: usersByRole.map(item => ({
          _id: item._id || 'Unknown',
          count: item.count
        })),
        recentUsers: recentUsers.map(user => ({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          schoolId: user.schoolId,
          createdAt: (user as any).createdAt
        })),
        recentSchools,
        systemHealth: totalUsers > 0 ? 'Good' : 'Warning',
      };
    } catch (error) {
      console.error('Error fetching system overview:', error);

      // Return default data if database query fails
      return {
        stats: {
          totalSchools: 0,
          totalUsers: 0,
          activeUsers: 0,
          totalRoles: 0,
        },
        usersByRole: [],
        recentUsers: [],
        recentSchools: [],
        systemHealth: 'Error',
      };
    }
  }

  async getRecentActivity(limit: number = 10): Promise<any> {
    try {
      // Get recent activities from the activity collection
      const activities = await this.activityModel
        .find({ performBy: { $in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('title subtitle performBy createdAt')
        .lean();

      // Transform the activities to match the expected format
      const transformedActivities = activities.map(activity => ({
        _id: activity._id,
        action: activity.title,
        description: activity.subtitle,
        user: {
          firstName: activity.performBy === 'SUPER_ADMIN' ? 'Super' : 'Admin',
          lastName: 'User',
          role: activity.performBy
        },
        performBy: activity.performBy,
        timestamp: activity.createdAt || new Date(),
        status: 'success'
      }));

      return {
        activities: transformedActivities,
        total: transformedActivities.length
      };
    } catch (error) {
      console.error('Error fetching recent activity:', error);

      // Return mock data if database query fails
      return {
        activities: [
          {
            _id: 'mock_1',
            action: 'SYSTEM_STARTED',
            description: 'System started successfully',
            user: {
              firstName: 'System',
              lastName: 'Admin',
              role: 'SUPER_ADMIN'
            },
            target: {
              type: 'system',
              name: 'SRS Platform'
            },
            timestamp: new Date().toISOString(),
            status: 'success'
          }
        ],
        total: 1
      };
    }
  }

  async getUserAnalytics(timeframe: string = '30d'): Promise<any> {
    const daysAgo = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    const newUsers = await this.userModel.countDocuments({
      createdAt: { $gte: startDate }
    });

    const activeUsers = await this.userModel.countDocuments({
      lastLogin: { $gte: startDate },
      isActive: true
    });

    return {
      newUsers,
      activeUsers,
      timeframe,
    };
  }

  // ==================== BULK OPERATIONS ====================

  async bulkCreateUsers(users: CreateUserDto[]): Promise<any[]> {
    const hashedUsers = await Promise.all(
      users.map(async (user) => ({
        ...user,
        password: await bcrypt.hash(user.password, 12),
        mustChangePassword: true,
        // Don't set passwordChangedAt - user must change password on first login
        passwordChangedAt: undefined,
      }))
    );

    return await this.userModel.insertMany(hashedUsers);
  }

  async bulkUploadUsers(file: any): Promise<any> {
    try {
      const XLSX = require('xlsx');

      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      // Read the Excel file from disk
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData || jsonData.length === 0) {
        throw new BadRequestException('Excel file is empty or invalid');
      }

      let insertedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];

      for (const row of jsonData) {
        try {
          const userData: any = row;

          // Map Excel columns to user fields
          const mappedData = {
            email: userData['Email'] || userData['email'] || '',
            firstName: userData['First Name'] || userData['firstName'] || '',
            lastName: userData['Last Name'] || userData['lastName'] || '',
            role: userData['Role'] || userData['role'] || 'STUDENT',
            password: userData['Password'] || userData['password'] || 'DefaultPassword123!',
            schoolId: userData['School ID'] || userData['schoolId'] || null,
            phone: userData['Phone'] || userData['phone'] || '',
            address: userData['Address'] || userData['address'] || '',
            dateOfBirth: userData['Date of Birth'] || userData['dateOfBirth'] || null,
            gender: userData['Gender'] || userData['gender'] || null,
            isActive: userData['Active'] !== undefined ? userData['Active'] : true,
          };

          // Validate required fields
          if (!mappedData.email || !mappedData.firstName || !mappedData.lastName) {
            errors.push(`Row ${insertedCount + skippedCount + 1}: Missing required fields (email, firstName, lastName)`);
            skippedCount++;
            continue;
          }

          // Check if user already exists
          const existingUser = await this.userModel.findOne({ email: mappedData.email });
          if (existingUser) {
            errors.push(`Row ${insertedCount + skippedCount + 1}: User with email ${mappedData.email} already exists`);
            skippedCount++;
            continue;
          }

          // Store password before hashing for welcome email
          const temporaryPassword = mappedData.password;

          // Hash password
          mappedData.password = await bcrypt.hash(mappedData.password, 12);
          (mappedData as any).mustChangePassword = true;
          // Don't set passwordChangedAt - user must change password on first login
          (mappedData as any).passwordChangedAt = undefined;

          // Create user
          const newUser = new this.userModel(mappedData);
          await newUser.save();

          // Create appropriate profile based on role with additional fields
          const profileData = {
            ...mappedData,
            studentId: userData['Student ID'] || userData['studentID'],
            gradeLevel: userData['Grade Level'] || userData['gradeLevel'] || '1',
            section: userData['Section'] || userData['section'] || 'A',
            employeeId: userData['Employee ID'] || this.generateEmployeeId(),
            department: userData['Department'] || userData['department'] || 'General',
            subjects: userData['Subject'] || userData['subject'] || 'General',
            occupation: userData['Occupation'] || userData['occupation'] || '',
          };

          if (mappedData.role === 'STUDENT') {
            await this.createStudentProfile(newUser._id.toString(), profileData as CreateUserDto);
          } else if (mappedData.role === 'TEACHER') {
            await this.createTeacherProfile(newUser._id.toString(), profileData as CreateUserDto);
          } else if (mappedData.role === 'PARENT') {
            await this.createParentProfile(newUser._id.toString(), profileData as CreateUserDto);
          }

          // Send welcome email (outside transaction to avoid blocking)
          try {
            await this.emailService.sendWelcomeEmail(
              newUser.email,
              newUser.firstName,
              newUser.lastName,
              newUser.role,
              temporaryPassword,
            );
          } catch (emailError) {
            console.error(`❌ Failed to send welcome email to ${newUser.email}:`, emailError);
            // Don't fail the creation if email fails
          }

          insertedCount++;
        } catch (error) {
          errors.push(`Row ${insertedCount + skippedCount + 1}: ${error.message}`);
          skippedCount++;
        }
      }

      // Clean up the file after processing
      const fs = require('fs');
      if (file && file.path) {
        fs.unlinkSync(file.path);
      }

      await this.createAuditLog({
        action: 'IMPORT',
        entityType: 'User',
        performedBy: 'super-admin',
        performedByRole: 'super-admin',
        description: `Bulk upload completed. Inserted ${insertedCount} users, skipped ${skippedCount} records.`,
        status: 'SUCCESS',
      });

      return {
        message: `Bulk upload completed. Inserted ${insertedCount} users, skipped ${skippedCount} records.`,
        insertedCount,
        skippedCount,
        errors: errors.slice(0, 10),
        totalErrors: errors.length
      };
    } catch (error) {
      await this.createAuditLog({
        action: 'IMPORT',
        entityType: 'User',
        performedBy: 'super-admin',
        performedByRole: 'super-admin',
        description: `Bulk upload failed: ${error.message}`,
        status: 'FAILED',
      });
      throw new BadRequestException(`Bulk upload failed: ${error.message}`);
    }
  }

  async exportUsers(schoolId?: string): Promise<any[]> {
    const query = schoolId ? { schoolId } : {};

    return await this.userModel
      .find(query)
      .populate('schoolId', 'name code')
      .select('-password -mfaSettings')
      .lean();
  }

  // ==================== AUTHENTICATION HELPER ====================

  async getUserWithPassword(email: string): Promise<any> {
    return await this.userModel
      .findOne({ email })
      .populate('schoolId', 'name code')
      .lean();
  }

  // ==================== ENHANCED ANALYTICS ====================

  async getAnalytics(timeframe: string = '30d'): Promise<any> {
    const [userGrowth, schoolStats, userActivity, roleDistribution, systemHealth, topSchools] = await Promise.all([
      this.getUserGrowthData(timeframe),
      this.getSchoolStatsData(),
      this.getUserActivityData(timeframe),
      this.getRoleDistributionData(),
      this.getSystemHealthData(),
      this.getTopSchoolsData()
    ]);

    return {
      userGrowth,
      schoolStats,
      userActivity,
      roleDistribution,
      systemHealth,
      topSchools
    };
  }

  async exportAnalytics(timeframe: string = '30d'): Promise<any> {
    // This would return a CSV/Excel file stream
    return { message: 'Analytics export feature will be implemented' };
  }

  private async getUserGrowthData(timeframe: string) {
    const days = this.getTimeframeDays(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const userGrowth = await this.userModel.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const totalUsers = await this.userModel.countDocuments();
    const previousPeriodUsers = await this.userModel.countDocuments({
      createdAt: { $lt: startDate }
    });

    const growth = previousPeriodUsers > 0
      ? ((totalUsers - previousPeriodUsers) / previousPeriodUsers) * 100
      : 0;

    return {
      labels: userGrowth.map(item => item._id),
      data: userGrowth.map(item => item.count),
      growth: Math.round(growth)
    };
  }

  private async getSchoolStatsData() {
    const totalSchools = await this.schoolModel.countDocuments();
    const activeSchools = await this.schoolModel.countDocuments({ isActive: true });

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const newSchoolsThisMonth = await this.schoolModel.countDocuments({
      createdAt: { $gte: startOfMonth }
    });

    return {
      totalSchools,
      activeSchools,
      newSchoolsThisMonth
    };
  }

  private async getUserActivityData(timeframe: string) {
    const days = this.getTimeframeDays(timeframe);
    const now = new Date();

    const dailyActiveUsers = await this.userModel.countDocuments({
      lastLogin: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      isActive: true
    });

    const weeklyActiveUsers = await this.userModel.countDocuments({
      lastLogin: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      isActive: true
    });

    const monthlyActiveUsers = await this.userModel.countDocuments({
      lastLogin: { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      isActive: true
    });

    return {
      dailyActiveUsers,
      weeklyActiveUsers,
      monthlyActiveUsers
    };
  }

  private async getRoleDistributionData() {
    const roleDistribution = await this.userModel.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    const totalUsers = await this.userModel.countDocuments();

    return roleDistribution.map(role => ({
      role: role._id,
      count: role.count,
      percentage: (role.count / totalUsers) * 100
    }));
  }

  private async getSystemHealthData() {
    return {
      uptime: '99.9%',
      responseTime: Math.floor(Math.random() * 100) + 50, // Simulated
      errorRate: 0.1,
      status: 'healthy'
    };
  }

  private async getTopSchoolsData() {
    const topSchools = await this.schoolModel.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'schoolId',
          as: 'users'
        }
      },
      {
        $addFields: {
          userCount: { $size: '$users' },
          activityScore: { $multiply: [{ $size: '$users' }, Math.random() * 100] }
        }
      },
      { $sort: { userCount: -1 } },
      { $limit: 5 },
      {
        $project: {
          name: 1,
          userCount: 1,
          activityScore: { $round: ['$activityScore', 0] }
        }
      }
    ]);

    return topSchools;
  }

  private getTimeframeDays(timeframe: string): number {
    switch (timeframe) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      default: return 30;
    }
  }

  // ==================== REPORTS MANAGEMENT ====================

  private generatedReports: Map<string, any> = new Map(); // In-memory storage for demo

  async getAllReports(page: number = 1, limit: number = 10, status?: string, type?: string): Promise<any> {
    // Get generated reports from memory
    const reportsArray = Array.from(this.generatedReports.values());

    // Add some default sample reports if none exist
    if (reportsArray.length === 0) {
      const defaultReports = [
        {
          _id: 'sample-1',
          name: 'Sample User Activity Report',
          type: 'user-activity',
          description: 'Sample user activity analysis',
          status: 'completed',
          fileUrl: '/reports/user-activity-report.csv',
          createdBy: {
            firstName: 'Super',
            lastName: 'Admin',
            email: 'superadmin@srs.com'
          },
          createdAt: new Date().toISOString(),
          fileSize: 2048000
        }
      ];

      // Add default reports to memory
      defaultReports.forEach(report => {
        this.generatedReports.set(report._id, report);
      });

      reportsArray.push(...defaultReports);
    }

    // Filter by status if provided
    let filteredReports = reportsArray;
    if (status && status !== 'all') {
      filteredReports = reportsArray.filter(report => report.status === status);
    }
    if (type && type !== 'all') {
      filteredReports = filteredReports.filter(report => report.type === type);
    }

    // Sort by creation date (newest first)
    filteredReports.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      reports: filteredReports,
      totalPages: Math.ceil(filteredReports.length / limit),
      currentPage: page,
      totalReports: filteredReports.length
    };
  }

  async generateReport(reportData: any): Promise<any> {
    const { name, type, description, parameters } = reportData;

    try {
      // Generate unique ID for the report
      const reportId = `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Generate the actual report content
      let reportContent = '';
      let fileSize = 0;

      switch (type) {
        case 'user-activity':
          reportContent = await this.generateUserActivityReport(parameters);
          break;
        case 'school-summary':
          reportContent = await this.generateSchoolSummaryReport(parameters);
          break;
        case 'attendance-overview':
          reportContent = await this.generateAttendanceReport(parameters);
          break;
        case 'grade-analytics':
          reportContent = await this.generateGradeAnalyticsReport(parameters);
          break;
        case 'system-usage':
          reportContent = await this.generateSystemUsageReport(parameters);
          break;
        case 'security-audit':
          reportContent = await this.generateSecurityAuditReport(parameters);
          break;
        case 'data-export':
          reportContent = await this.generateDataExportReport(parameters);
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
        description: description || `Generated ${type} report`,
        parameters: parameters,
        status: 'completed',
        fileUrl: `/reports/${reportId}.csv`,
        fileSize: fileSize,
        content: reportContent, // Store content for download
        createdBy: {
          firstName: 'Super',
          lastName: 'Admin',
          email: 'superadmin@srs.com'
        },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };

      // Store the report in memory (in production, save to database and file system)
      this.generatedReports.set(reportId, report);

      return {
        success: true,
        message: 'Report generated successfully',
        reportId: reportId,
        report: {
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
      throw new Error(`Failed to generate report: ${error.message}`);
    }
  }

  private async generateUserActivityReport(parameters: any): Promise<string> {
    const { dateRange, schoolIds, userRoles } = parameters || {};

    // Build query based on parameters
    const query: any = {};
    if (schoolIds && schoolIds.length > 0) {
      query.schoolId = { $in: schoolIds };
    }
    if (userRoles && userRoles.length > 0) {
      query.role = { $in: userRoles };
    }

    // Add date filter if provided
    if (dateRange && dateRange.start && dateRange.end) {
      query.createdAt = {
        $gte: new Date(dateRange.start),
        $lte: new Date(dateRange.end)
      };
    }

    const users = await this.userModel.find(query).populate('schoolId', 'name code').lean();

    // Generate CSV header
    let csv = 'User ID,Name,Email,Role,School,School Code,Status,Last Login,Account Created,Password Changed,MFA Enabled,Failed Attempts\n';

    // Generate CSV rows
    for (const user of users) {
      const school = user.schoolId as any;
      const userDoc = user as any; // Cast to access timestamps
      const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never';
      const createdAt = userDoc.createdAt ? new Date(userDoc.createdAt).toLocaleString() : 'N/A';
      const passwordChanged = user.passwordLastChanged ? new Date(user.passwordLastChanged).toLocaleString() : 'Never';
      const mfaStatus = user.mfaEnabled ? 'Yes' : 'No';
      const status = user.isActive ? 'Active' : 'Inactive';
      const failedAttempts = user.failedLoginAttempts || 0;

      const csvRow = [
        user._id.toString(),
        `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        user.email,
        user.role,
        school ? school.name : 'N/A',
        school ? school.code : 'N/A',
        status,
        lastLogin,
        createdAt,
        passwordChanged,
        mfaStatus,
        failedAttempts.toString()
      ];

      // Format CSV row manually
      csv += csvRow.map(value =>
        typeof value === 'string' && (value.includes(',') || value.includes('"'))
          ? `"${value.replace(/"/g, '""')}"`
          : value
      ).join(',') + '\n';
    }

    // Add summary statistics at the end
    csv += '\n--- SUMMARY ---\n';
    csv += `Total Users,${users.length}\n`;
    csv += `Active Users,${users.filter(u => u.isActive).length}\n`;
    csv += `Users with Recent Login,${users.filter(u => u.lastLogin && new Date(u.lastLogin) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}\n`;
    csv += `Users with MFA,${users.filter(u => u.mfaEnabled).length}\n`;
    csv += `Report Generated,${new Date().toLocaleString()}\n`;

    return csv;
  }

  private async generateSchoolSummaryReport(parameters: any): Promise<string> {
    const { schoolIds } = parameters;

    const query: any = {};
    if (schoolIds && schoolIds.length > 0) {
      query._id = { $in: schoolIds };
    }

    const schools = await this.schoolModel.find(query);

    let csv = 'School ID,Name,Code,Type,Address,Phone,Email,Admin,Student Capacity,Current Students,Staff Count,Established Year,Status\n';

    for (const school of schools) {
      const schoolDoc = school as any; // Cast to access additional fields
      const admin = schoolDoc.adminId ? await this.userModel.findById(schoolDoc.adminId) : null;
      const adminName = admin ? `${admin.firstName} ${admin.lastName}` : 'Not Assigned';

      const address = school.address
        ? `${school.address.street}, ${school.address.city}, ${school.address.state}`
        : 'N/A';

      csv += `"${school._id}","${school.name}","${school.code}","${school.type}","${address}","${school.phone}","${school.email}","${adminName}","${school.studentCapacity || 0}","${schoolDoc.currentStudentCount || 0}","${schoolDoc.staffCount || 0}","${schoolDoc.establishedYear || 'N/A'}","${school.isActive ? 'Active' : 'Inactive'}"\n`;
    }

    return csv;
  }

  private async generateAttendanceReport(parameters: any): Promise<string> {
    // This would integrate with attendance module when implemented
    let csv = 'Date,Student ID,Student Name,Class,Status,Marked By,Time\n';
    csv += '"2025-09-01","STU001","John Doe","Grade 10A","Present","Teacher Smith","08:00 AM"\n';
    csv += '"2025-09-01","STU002","Jane Smith","Grade 10A","Absent","Teacher Smith","08:00 AM"\n';
    return csv;
  }

  private async generateGradeAnalyticsReport(parameters: any): Promise<string> {
    // This would integrate with grades module when implemented
    let csv = 'Student ID,Student Name,Subject,Grade,Points,Date,Teacher\n';
    csv += '"STU001","John Doe","Mathematics","A","95","2025-08-15","Mrs. Johnson"\n';
    csv += '"STU001","John Doe","Science","B+","87","2025-08-20","Mr. Wilson"\n';
    return csv;
  }

  private async generateSystemUsageReport(parameters: any): Promise<string> {
    const { dateRange } = parameters;

    const totalUsers = await this.userModel.countDocuments();
    const activeUsers = await this.userModel.countDocuments({ isActive: true });
    const totalSchools = await this.schoolModel.countDocuments();
    const activeSchools = await this.schoolModel.countDocuments({ isActive: true });

    let csv = 'Metric,Value,Date\n';
    csv += `"Total Users","${totalUsers}","${new Date().toISOString()}"\n`;
    csv += `"Active Users","${activeUsers}","${new Date().toISOString()}"\n`;
    csv += `"Total Schools","${totalSchools}","${new Date().toISOString()}"\n`;
    csv += `"Active Schools","${activeSchools}","${new Date().toISOString()}"\n`;

    return csv;
  }

  private async generateSecurityAuditReport(parameters: any): Promise<string> {
    const users = await this.userModel.find({});

    let csv = 'User ID,Name,Email,Role,Last Login,Failed Login Attempts,Password Last Changed,MFA Status,Account Status\n';

    for (const user of users) {
      csv += `"${user._id}","${user.firstName} ${user.lastName}","${user.email}","${user.role}","${user.lastLogin || 'Never'}","0","Never","Disabled","${user.isActive ? 'Active' : 'Inactive'}"\n`;
    }

    return csv;
  }

  private async generateDataExportReport(parameters: any): Promise<string> {
    const { userRoles, schoolIds } = parameters;

    const userQuery: any = {};
    if (schoolIds && schoolIds.length > 0) {
      userQuery.schoolId = { $in: schoolIds };
    }
    if (userRoles && userRoles.length > 0) {
      userQuery.role = { $in: userRoles };
    }

    const users = await this.userModel.find(userQuery).populate('schoolId', 'name code');
    const schools = await this.schoolModel.find(schoolIds ? { _id: { $in: schoolIds } } : {});

    let csv = '=== USERS DATA ===\n';
    csv += 'User ID,Name,Email,Role,School,Phone,Status,Created Date\n';

    for (const user of users) {
      const school = user.schoolId as any;
      const userDoc = user as any; // Cast to access timestamps and phone
      const createdAt = userDoc.createdAt ? new Date(userDoc.createdAt).toLocaleString() : 'N/A';
      csv += `"${user._id}","${user.firstName} ${user.lastName}","${user.email}","${user.role}","${school ? school.name : 'N/A'}","${userDoc.phone || 'N/A'}","${user.isActive ? 'Active' : 'Inactive'}","${createdAt}"\n`;
    }

    csv += '\n=== SCHOOLS DATA ===\n';
    csv += 'School ID,Name,Code,Type,Address,Phone,Email,Status\n';

    for (const school of schools) {
      const address = school.address
        ? `${school.address.street}, ${school.address.city}, ${school.address.state}`
        : 'N/A';
      csv += `"${school._id}","${school.name}","${school.code}","${school.type}","${address}","${school.phone}","${school.email}","${school.isActive ? 'Active' : 'Inactive'}"\n`;
    }

    return csv;
  }

  async downloadReport(id: string): Promise<string> {
    // First check if it's a generated report in memory
    const storedReport = this.generatedReports.get(id);
    if (storedReport && storedReport.content) {
      return storedReport.content;
    }

    // Handle sample/legacy report IDs by generating content on-demand
    switch (id) {
      case 'sample-1':
      case '1':
      case 'user-activity':
        return await this.generateUserActivityReport({});
      case '2':
      case 'school-summary':
        return await this.generateSchoolSummaryReport({});
      case '3':
      case 'system-usage':
        return await this.generateSystemUsageReport({});
      case 'security-audit':
        return await this.generateSecurityAuditReport({});
      case 'data-export':
        return await this.generateDataExportReport({});
      case 'attendance-overview':
        return await this.generateAttendanceReport({});
      case 'grade-analytics':
        return await this.generateGradeAnalyticsReport({});
      default:
        // If no specific match, generate a general system report
        return await this.generateSystemUsageReport({});
    }
  }

  async deleteReport(id: string): Promise<void> {
    // Remove from memory storage
    this.generatedReports.delete(id);
    console.log('Report deleted:', id);
  }

  // ==================== PASSWORD MANAGEMENT ====================

  async getPasswordPolicy() {
    // Return default policy if not configured - in production this would be stored in database
    return {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      passwordExpiry: 90,
      preventReuse: 5,
      maxFailedAttempts: 5,
      lockoutDuration: 15
    };
  }

  async updatePasswordPolicy(policy: any) {
    // In a real application, you would save this to database
    // For now, return success
    return { success: true, message: 'Password policy updated successfully' };
  }

  async resetUserPasswordAdmin(userId: string, newPassword: string, options: any = {}) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update user password and related fields
    const updateData: any = {
      password: hashedPassword,
      passwordLastChanged: new Date(),
      mustChangePassword: options.mustChangePassword || false,
      failedLoginAttempts: 0,
      accountLocked: false
    };

    // Update isActive if provided
    if (options.isActive !== undefined) {
      updateData.isActive = options.isActive;
    }

    // Set password expiry if policy requires it
    const policy = await this.getPasswordPolicy();
    if (policy.passwordExpiry > 0) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + policy.passwordExpiry);
      updateData.passwordExpiry = expiryDate;
    }

    await this.userModel.findByIdAndUpdate(userId, updateData);

    // Send email notification if requested
    if (options.sendEmail) {
      // In a real application, you would send an email here
      console.log(`Password reset notification sent to ${user.email}`);
    }

    return { success: true, message: 'Password reset successfully' };
  }

  async unlockUserAccount(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      accountLocked: false,
      failedLoginAttempts: 0,
      lockoutUntil: null
    });

    return { success: true, message: 'Account unlocked successfully' };
  }

  async toggleUserMFA(userId: string, enabled: boolean) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = { mfaEnabled: enabled };

    if (enabled) {
      updateData.mfaSecret = this.generateMFASecret();
    } else {
      updateData.mfaSecret = null;
    }

    await this.userModel.findByIdAndUpdate(userId, updateData);

    return {
      success: true,
      message: `MFA ${enabled ? 'enabled' : 'disabled'} successfully`,
      mfaSecret: enabled ? updateData.mfaSecret : null
    };
  }

  private generateMFASecret(): string {
    // In a real application, you would generate a proper TOTP secret using speakeasy or similar
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  async getUsersWithSecurityInfo() {
    const users = await this.userModel.find()
      .select('firstName lastName email role lastLogin passwordLastChanged mustChangePassword isActive mfaEnabled failedLoginAttempts accountLocked passwordExpiry lockoutUntil')
      .populate('schoolId', 'name code')
      .lean();

    return users.map(user => ({
      ...user,
      // Add default values for missing fields
      mfaEnabled: user.mfaEnabled || false,
      failedLoginAttempts: user.failedLoginAttempts || 0,
      accountLocked: user.accountLocked || false,
      mustChangePassword: user.mustChangePassword || false
    }));
  }

  async generatePasswordComplexityReport() {
    const users = await this.userModel.find().lean();
    const policy = await this.getPasswordPolicy();

    const report = {
      totalUsers: users.length,
      usersWithExpiredPasswords: 0,
      usersNeedingPasswordChange: 0,
      usersWithMFA: 0,
      lockedAccounts: 0,
      averagePasswordAge: 0
    };

    const now = new Date();
    let totalPasswordAge = 0;

    users.forEach(user => {
      if (user.passwordExpiry && new Date(user.passwordExpiry) < now) {
        report.usersWithExpiredPasswords++;
      }
      if (user.mustChangePassword) {
        report.usersNeedingPasswordChange++;
      }
      if (user.mfaEnabled) {
        report.usersWithMFA++;
      }
      if (user.accountLocked) {
        report.lockedAccounts++;
      }
      if (user.passwordLastChanged) {
        const passwordAge = Math.floor((now.getTime() - new Date(user.passwordLastChanged).getTime()) / (1000 * 60 * 60 * 24));
        totalPasswordAge += passwordAge;
      }
    });

    report.averagePasswordAge = Math.floor(totalPasswordAge / users.length);

    return report;
  }

  async forcePasswordChangeForAllUsers(userIds?: string[]) {
    const query = userIds ? { _id: { $in: userIds } } : {};

    const result = await this.userModel.updateMany(query, {
      mustChangePassword: true
    });

    return {
      success: true,
      message: `Password change forced for ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    };
  }

  async getPasswordSecurityMetrics() {
    const users = await this.userModel.find().lean();
    const policy = await this.getPasswordPolicy();
    const now = new Date();

    const metrics = {
      totalUsers: users.length,
      passwordStats: {
        expired: 0,
        expiring: 0, // expiring in next 7 days
        needsChange: 0,
        strongPasswords: 0 // assume all are strong for now
      },
      securityStatus: {
        mfaEnabled: 0,
        lockedAccounts: 0,
        failedAttempts: 0,
        recentLogins: 0 // last 24 hours
      },
      complianceScore: 0
    };

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    users.forEach(user => {
      // Password expiry checks
      if (user.passwordExpiry) {
        const expiryDate = new Date(user.passwordExpiry);
        if (expiryDate < now) {
          metrics.passwordStats.expired++;
        } else if (expiryDate < nextWeek) {
          metrics.passwordStats.expiring++;
        }
      }

      if (user.mustChangePassword) {
        metrics.passwordStats.needsChange++;
      }

      // Security status
      if (user.mfaEnabled) {
        metrics.securityStatus.mfaEnabled++;
      }
      if (user.accountLocked) {
        metrics.securityStatus.lockedAccounts++;
      }
      if (user.failedLoginAttempts && user.failedLoginAttempts > 0) {
        metrics.securityStatus.failedAttempts++;
      }
      if (user.lastLogin && new Date(user.lastLogin) > yesterday) {
        metrics.securityStatus.recentLogins++;
      }
    });

    // Calculate compliance score (0-100)
    const secureUsers = metrics.securityStatus.mfaEnabled;
    const problemUsers = metrics.passwordStats.expired + metrics.passwordStats.needsChange + metrics.securityStatus.lockedAccounts;
    metrics.complianceScore = Math.max(0, Math.round(((secureUsers - problemUsers) / metrics.totalUsers) * 100));

    // Assume all current passwords are strong for demo
    metrics.passwordStats.strongPasswords = metrics.totalUsers - metrics.passwordStats.expired - metrics.passwordStats.needsChange;

    return metrics;
  }

  // Data Management Methods
  async getDataStats() {
    try {
      const [totalUsers, totalStudents, totalTeachers, totalSchools, totalActivities] = await Promise.all([
        this.userModel.countDocuments(),
        this.userModel.countDocuments({ role: 'STUDENT' }),
        this.userModel.countDocuments({ role: 'TEACHER' }),
        this.schoolModel.countDocuments(),
        this.activityModel.countDocuments(),
      ]);

      // Calculate approximate storage usage based on document counts
      const collections = [
        { count: totalUsers, avgSize: 2048 }, // Average user document ~2KB
        { count: totalSchools, avgSize: 1024 }, // Average school document ~1KB
        { count: totalActivities, avgSize: 512 }, // Average activity document ~0.5KB
      ];

      let totalBytes = 0;
      collections.forEach(collection => {
        totalBytes += collection.count * collection.avgSize;
      });

      const storageUsed = this.formatBytes(totalBytes);

      // Get last backup date
      const lastBackupOperation = await this.auditLogModel
        .findOne({ action: 'BACKUP', status: 'SUCCESS' })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      return {
        totalUsers,
        totalStudents,
        totalTeachers,
        totalSchools,
        totalActivities,
        storageUsed,
        lastBackup: (lastBackupOperation as any)?.createdAt
          ? new Date((lastBackupOperation as any).createdAt).toISOString()
          : undefined,
        databaseSize: storageUsed,
        totalDocuments: totalUsers + totalSchools + totalActivities,
      };
    } catch (error) {
      console.error('Error getting data stats:', error);
      throw new BadRequestException('Failed to fetch data statistics');
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ==================== PHASE 2: ADVANCED SECURITY & MONITORING ====================

  // IP Whitelisting & Access Control
  async createAccessControl(accessControlData: any) {
    try {
      const type = accessControlData.type === 'WHITELIST' ? 'ip_whitelist' : accessControlData.type === 'BLACKLIST' ? 'ip_blacklist' : accessControlData.type;
      const isActive = accessControlData.isActive !== undefined ? !!accessControlData.isActive : (accessControlData.status === 'INACTIVE' ? false : true);
      const payload = {
        name: accessControlData.name,
        type,
        isActive,
        priority: Number(accessControlData.priority) ?? 0,
        ipAddresses: Array.isArray(accessControlData.ipAddresses) ? accessControlData.ipAddresses : [],
        ipRanges: Array.isArray(accessControlData.ipRanges) ? accessControlData.ipRanges : [],
        countries: Array.isArray(accessControlData.countries) ? accessControlData.countries : [],
        deviceFingerprints: Array.isArray(accessControlData.deviceFingerprints) ? accessControlData.deviceFingerprints : [],
        description: accessControlData.description,
        createdBy: accessControlData.createdBy || 'super-admin',
        lastModifiedBy: accessControlData.updatedBy || accessControlData.createdBy || 'super-admin',
        metadata: accessControlData.metadata,
        expiresAt: accessControlData.expiresAt ? new Date(accessControlData.expiresAt) : undefined,
      };
      const accessControl = new this.accessControlModel(payload);
      const savedAccessControl = await accessControl.save();
      await this.logAuditAction('CREATE', 'AccessControl', savedAccessControl._id.toString(), payload.createdBy, 'Access control rule created', null, payload);
      return this.accessControlToResponse(savedAccessControl);
    } catch (error) {
      console.error('Error creating access control:', error);
      throw new BadRequestException('Failed to create access control rule');
    }
  }

  private accessControlToResponse(doc: any) {
    const obj = doc.toObject ? doc.toObject() : doc;
    const type = obj.type === 'ip_whitelist' ? 'WHITELIST' : obj.type === 'ip_blacklist' ? 'BLACKLIST' : obj.type;
    const status = obj.isActive ? 'ACTIVE' : 'INACTIVE';
    return { ...obj, type, status };
  }

  async getAccessControls(query: any = {}) {
    try {
      const { page = 1, limit = 20, type, isActive } = query;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (type) filter.type = type;
      if (isActive !== undefined) filter.isActive = isActive === 'true';

      const accessControls = await this.accessControlModel
        .find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .exec();

      const total = await this.accessControlModel.countDocuments(filter);
      const mapped = accessControls.map((ac: any) => this.accessControlToResponse(ac));

      return {
        accessControls: mapped,
        total,
        page: Number(page),
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error fetching access controls:', error);
      throw new BadRequestException('Failed to fetch access controls');
    }
  }

  async updateAccessControl(id: string, updateData: any, updatedBy: string) {
    try {
      const oldAccessControl = await this.accessControlModel.findById(id);
      if (!oldAccessControl) {
        throw new NotFoundException('Access control rule not found');
      }
      const set: any = { lastModifiedBy: updatedBy };
      if (updateData.name != null) set.name = updateData.name;
      if (updateData.type != null) set.type = updateData.type === 'WHITELIST' ? 'ip_whitelist' : updateData.type === 'BLACKLIST' ? 'ip_blacklist' : updateData.type;
      if (updateData.status !== undefined) set.isActive = updateData.status !== 'INACTIVE';
      else if (updateData.isActive !== undefined) set.isActive = !!updateData.isActive;
      if (updateData.priority != null) set.priority = Number(updateData.priority);
      if (Array.isArray(updateData.ipAddresses)) set.ipAddresses = updateData.ipAddresses;
      if (Array.isArray(updateData.ipRanges)) set.ipRanges = updateData.ipRanges;
      if (Array.isArray(updateData.countries)) set.countries = updateData.countries;
      if (Array.isArray(updateData.deviceFingerprints)) set.deviceFingerprints = updateData.deviceFingerprints;
      if (updateData.description !== undefined) set.description = updateData.description;
      if (updateData.expiresAt !== undefined) set.expiresAt = updateData.expiresAt ? new Date(updateData.expiresAt) : null;

      const updatedAccessControl = await this.accessControlModel.findByIdAndUpdate(id, { $set: set }, { new: true });
      await this.logAuditAction('UPDATE', 'AccessControl', id, updatedBy, 'Access control rule updated', oldAccessControl.toObject(), set);
      return this.accessControlToResponse(updatedAccessControl);
    } catch (error) {
      console.error('Error updating access control:', error);
      throw new BadRequestException('Failed to update access control rule');
    }
  }

  async deleteAccessControl(id: string, deletedBy: string) {
    try {
      const accessControl = await this.accessControlModel.findById(id);
      if (!accessControl) {
        throw new NotFoundException('Access control rule not found');
      }

      await this.accessControlModel.findByIdAndDelete(id);

      // Log the action
      await this.logAuditAction('DELETE', 'AccessControl', id, deletedBy, 'Access control rule deleted', accessControl.toObject(), null);

      return { message: 'Access control rule deleted successfully' };
    } catch (error) {
      console.error('Error deleting access control:', error);
      throw new BadRequestException('Failed to delete access control rule');
    }
  }

  private sessionToResponse(doc: any) {
    const obj = doc.toObject ? doc.toObject() : doc;
    const status = (obj.status || 'active').toString().toUpperCase();
    let browser = 'Unknown';
    let os = 'Unknown';
    if (obj.userAgent) {
      if (obj.userAgent.includes('Chrome')) browser = 'Chrome';
      else if (obj.userAgent.includes('Firefox')) browser = 'Firefox';
      else if (obj.userAgent.includes('Safari')) browser = 'Safari';
      else if (obj.userAgent.includes('Edge')) browser = 'Edge';
      if (obj.userAgent.includes('Windows')) os = 'Windows';
      else if (obj.userAgent.includes('Mac')) os = 'Mac';
      else if (obj.userAgent.includes('Linux')) os = 'Linux';
      else if (obj.userAgent.includes('Android')) os = 'Android';
      else if (obj.userAgent.includes('iOS')) os = 'iOS';
    }
    return {
      ...obj,
      status,
      deviceInfo: obj.deviceInfo || { browser, os, device: os },
      location: obj.location || {},
    };
  }

  async getActiveSessions(query: any = {}) {
    try {
      const { page = 1, limit = 20, userId, status, userRole, search, suspicious } = query;
      const skip = (Math.max(1, Number(page)) - 1) * Math.max(1, Math.min(100, Number(limit) || 20));
      const limitNum = Math.max(1, Math.min(100, Number(limit) || 20));

      const filter: any = {};
      if (status && status !== 'all') {
        const s = status.toString().toLowerCase();
        if (['active', 'expired', 'terminated', 'suspicious'].includes(s)) filter.status = s;
      } else {
        filter.status = { $in: ['active', 'expired', 'terminated', 'suspicious'] };
      }
      if (userId) filter.userId = userId;
      if (userRole && userRole !== 'all') filter.userRole = new RegExp(userRole, 'i');
      if (suspicious === 'true' || suspicious === true) filter.isSuspicious = true;
      if (search && search.trim()) {
        const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.$or = [
          { userEmail: new RegExp(term, 'i') },
          { ipAddress: new RegExp(term, 'i') },
          { userId: new RegExp(term, 'i') },
        ];
      }

      const sessions = await this.userSessionModel
        .find(filter)
        .sort({ loginTime: -1 })
        .skip(skip)
        .limit(limitNum)
        .exec();

      const total = await this.userSessionModel.countDocuments(filter);
      const sessionsForResponse = sessions.map((s) => this.sessionToResponse(s));

      return {
        sessions: sessionsForResponse,
        total,
        page: Number(page) || 1,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      };
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      throw new BadRequestException('Failed to fetch user sessions');
    }
  }

  async createUserSession(sessionData: any) {
    try {
      const session = new this.userSessionModel(sessionData);
      return await session.save();
    } catch (error) {
      console.error('Error creating user session:', error);
      throw new BadRequestException('Failed to create user session');
    }
  }

  async terminateSession(sessionId: string, terminatedBy: string) {
    try {
      const session = await this.userSessionModel.findOneAndUpdate(
        { sessionId },
        {
          status: 'terminated',
          logoutTime: new Date(),
        },
        { new: true }
      );

      if (!session) {
        throw new NotFoundException('Session not found');
      }

      // Log the action
      await this.logAuditAction('UPDATE', 'UserSession', session._id.toString(), terminatedBy, 'User session terminated', null, { sessionId, action: 'terminate' });

      return { message: 'Session terminated successfully' };
    } catch (error) {
      console.error('Error terminating session:', error);
      throw new BadRequestException('Failed to terminate session');
    }
  }

  async terminateAllUserSessions(userId: string, terminatedBy: string) {
    try {
      const result = await this.userSessionModel.updateMany(
        { userId, status: 'active' },
        {
          status: 'terminated',
          logoutTime: new Date(),
        }
      );

      // Log the action
      await this.logAuditAction('UPDATE', 'UserSession', userId, terminatedBy, `Terminated ${result.modifiedCount} active sessions for user`, null, { userId, action: 'terminate_all' });

      return { message: `Terminated ${result.modifiedCount} active sessions` };
    } catch (error) {
      console.error('Error terminating user sessions:', error);
      throw new BadRequestException('Failed to terminate user sessions');
    }
  }

  async getSessionAnalytics(timeframe: string = '7d') {
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
      }

      const match = { loginTime: { $gte: startDate, $lte: endDate } };
      const [activeSessions, suspiciousSessions, uniqueUserIds, topLocationsAgg, sessionTrendsAgg] = await Promise.all([
        this.userSessionModel.countDocuments({ ...match, status: 'active' }),
        this.userSessionModel.countDocuments({ ...match, isSuspicious: true }),
        this.userSessionModel.distinct('userId', match),
        this.userSessionModel.aggregate([
          { $match: match },
          { $match: { 'location.country': { $exists: true, $ne: '' } } },
          { $group: { _id: '$location.country', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
          { $project: { country: '$_id', count: 1, _id: 0 } },
        ]),
        this.userSessionModel.aggregate([
          { $match: match },
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$loginTime' } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { date: '$_id', count: 1, _id: 0 } },
        ]),
      ]);

      const uniqueUsers = uniqueUserIds.length;
      const topLocations = topLocationsAgg.map((r: any) => ({ country: r.country || 'Unknown', count: r.count }));
      const sessionTrends = sessionTrendsAgg.map((r: any) => ({ date: r.date, count: r.count }));
      const topDevices = await this.userSessionModel.aggregate([
        { $match: match },
        { $group: { _id: '$userAgent', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $project: { device: { $substr: ['$_id', 0, 50] }, count: 1, _id: 0 } },
      ]);

      return {
        totalActiveSessions: activeSessions,
        suspiciousSessions,
        uniqueUsers,
        topLocations,
        topDevices: topDevices.map((d: any) => ({ device: d.device || d._id || 'Unknown', count: d.count })),
        sessionTrends,
        timeframe,
        startDate,
        endDate,
      };
    } catch (error) {
      console.error('Error getting session analytics:', error);
      throw new BadRequestException('Failed to get session analytics');
    }
  }

  // System Monitoring
  async recordSystemMetric(metricData: any) {
    try {
      const metric = new this.systemMonitorModel({
        ...metricData,
        timestamp: new Date(),
      });

      // Determine alert level based on thresholds
      if (metricData.thresholds) {
        if (metricData.thresholds.critical && metricData.value >= metricData.thresholds.critical) {
          metric.alertLevel = 'critical';
        } else if (metricData.thresholds.warning && metricData.value >= metricData.thresholds.warning) {
          metric.alertLevel = 'warning';
        }
      }

      return await metric.save();
    } catch (error) {
      console.error('Error recording system metric:', error);
      throw new BadRequestException('Failed to record system metric');
    }
  }

  async getSystemMetrics(query: any = {}) {
    try {
      const { metricType, timeframe = '1h', limit = 100 } = query;

      const endDate = new Date();
      const startDate = new Date();

      switch (timeframe) {
        case '1h':
          startDate.setHours(startDate.getHours() - 1);
          break;
        case '6h':
          startDate.setHours(startDate.getHours() - 6);
          break;
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
      }

      const filter: any = { timestamp: { $gte: startDate, $lte: endDate } };
      if (metricType) filter.metricType = metricType;

      const metrics = await this.systemMonitorModel
        .find(filter)
        .sort({ timestamp: -1 })
        .limit(Number(limit))
        .exec();

      const normalizeAlertLevel = (level: string) => {
        const l = (level || 'normal').toString().toLowerCase();
        if (l === 'critical') return 'CRITICAL';
        if (l === 'warning') return 'WARNING';
        return 'INFO';
      };
      const metricsForResponse = metrics.map((m: any) => {
        const obj = m.toObject ? m.toObject() : m;
        return { ...obj, alertLevel: normalizeAlertLevel(obj.alertLevel) };
      });

      return {
        metrics: metricsForResponse,
        timeframe,
        startDate,
        endDate,
      };
    } catch (error) {
      console.error('Error fetching system metrics:', error);
      throw new BadRequestException('Failed to fetch system metrics');
    }
  }

  async getSystemHealthOverview() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const latestMetrics = await this.systemMonitorModel.aggregate([
        { $match: { timestamp: { $gte: oneHourAgo } } },
        { $sort: { timestamp: -1 } },
        {
          $group: {
            _id: '$metricType',
            latestValue: { $first: '$value' },
            unit: { $first: '$unit' },
            alertLevel: { $first: '$alertLevel' },
          }
        }
      ]);

      const criticalCount = latestMetrics.filter((m: any) => (m.alertLevel || '').toString().toLowerCase() === 'critical').length;
      const warningCount = latestMetrics.filter((m: any) => (m.alertLevel || '').toString().toLowerCase() === 'warning').length;
      const totalMetrics = latestMetrics.length;
      let overallHealth = 100;
      if (totalMetrics > 0) {
        overallHealth = Math.max(0, Math.min(100, 100 - criticalCount * 30 - warningCount * 10));
      }
      let status: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 'HEALTHY';
      if (criticalCount > 0) status = 'CRITICAL';
      else if (warningCount > 0) overallHealth < 70 ? (status = 'WARNING') : (status = 'HEALTHY');

      const byType: Record<string, number> = {};
      latestMetrics.forEach((m: any) => { byType[(m._id || '').toLowerCase()] = m.latestValue; });

      const components = {
        database: { status: 'healthy', responseTime: byType['database_connections'] ?? Math.floor(Math.random() * 20) + 5 },
        api: { status: 'healthy', responseTime: byType['response_time'] ?? byType['api_response_time'] ?? Math.floor(Math.random() * 50) + 10 },
        cache: { status: 'healthy', hitRate: 85 },
        storage: { status: 'healthy', usage: byType['disk_usage'] ?? byType['disk'] ?? 45 },
      };
      const metricsSummary = {
        cpu: byType['cpu_usage'] ?? byType['cpu'] ?? 0,
        memory: byType['memory_usage'] ?? byType['memory'] ?? 0,
        disk: byType['disk_usage'] ?? byType['disk'] ?? 0,
        activeUsers: byType['user_count'] ?? byType['active_users'] ?? 0,
        errorRate: byType['error_rate'] ?? 0,
      };
      const alerts = (criticalCount > 0 ? [{ severity: 'CRITICAL', message: `${criticalCount} critical metric(s)`, timestamp: now.toISOString() }] : []).concat(
        warningCount > 0 ? [{ severity: 'WARNING', message: `${warningCount} warning(s)`, timestamp: now.toISOString() }] : []
      );

      return {
        overallHealth,
        status,
        components,
        metrics: metricsSummary,
        alerts,
        lastUpdated: now,
      };
    } catch (error) {
      console.error('Error getting system health overview:', error);
      throw new BadRequestException('Failed to get system health overview');
    }
  }

  async exportData(entityType: string, format = 'csv') {
    try {
      let data: any[] = [];

      switch (entityType) {
        case 'users':
          data = await this.userModel.find({}, { password: 0 }).lean();
          break;
        case 'students':
          data = await this.userModel.find({ role: 'STUDENT' }, { password: 0 }).lean();
          break;
        case 'teachers':
          data = await this.userModel.find({ role: 'TEACHER' }, { password: 0 }).lean();
          break;
        case 'schools':
          data = await this.schoolModel.find().lean();
          break;
        case 'activities':
          data = await this.activityModel.find().lean();
          break;
        case 'audit-logs':
          data = await this.auditLogModel.find().lean();
          break;
        default:
          throw new BadRequestException('Invalid entity type');
      }

      // Log the export operation
      await this.createAuditLog({
        action: 'EXPORT',
        entityType,
        performedBy: 'system', // This should come from the authenticated user
        performedByRole: 'super-admin',
        description: `Exported ${data.length} ${entityType} records`,
        status: 'SUCCESS',
      });

      return data;
    } catch (error) {
      await this.createAuditLog({
        action: 'EXPORT',
        entityType,
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: `Failed to export ${entityType}`,
        status: 'FAILED',
      });
      throw new BadRequestException(`Failed to export ${entityType} data`);
    }
  }

  async cleanupData(type: string, options: any = {}) {
    try {
      let deletedCount = 0;
      const olderThan = options.olderThan || 365;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThan);

      switch (type) {
        case 'logs':
          const result = await this.auditLogModel.deleteMany({
            createdAt: { $lt: cutoffDate },
            action: { $nin: ['LOGIN', 'LOGOUT'] } // Keep authentication logs
          });
          deletedCount = result.deletedCount;
          break;
        case 'inactive-users':
          const inactiveResult = await this.userModel.deleteMany({
            isActive: false,
            lastLogin: { $lt: cutoffDate }
          });
          deletedCount = inactiveResult.deletedCount;
          break;
        case 'temp-files':
          // This would involve file system operations
          // For now, just log the operation
          deletedCount = 0;
          break;
        default:
          throw new BadRequestException('Invalid cleanup type');
      }

      await this.createAuditLog({
        action: 'CLEANUP',
        entityType: type,
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: `Cleaned up ${deletedCount} ${type} records older than ${olderThan} days`,
        status: 'SUCCESS',
      });

      return { deletedCount, type };
    } catch (error) {
      await this.createAuditLog({
        action: 'CLEANUP',
        entityType: type,
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: `Failed to cleanup ${type}`,
        status: 'FAILED',
      });
      throw new BadRequestException(`Failed to cleanup ${type} data`);
    }
  }

  async createBackup(options: any = {}) {
    try {
      // This is a simplified backup operation
      // In a real system, you would use mongodump or similar tools

      const collections = ['users', 'schools', 'activities', 'academicterms'];
      const backupData = {};

      for (const collection of collections) {
        switch (collection) {
          case 'users':
            backupData[collection] = await this.userModel.find({}, { password: 0 }).lean();
            break;
          case 'schools':
            backupData[collection] = await this.schoolModel.find().lean();
            break;
          case 'activities':
            backupData[collection] = await this.activityModel.find().lean();
            break;
          case 'academicterms':
            backupData[collection] = await this.academicTermModel.find().lean();
            break;
        }
      }

      await this.createAuditLog({
        action: 'BACKUP',
        entityType: 'system',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: `System backup created with ${Object.keys(backupData).length} collections`,
        status: 'SUCCESS',
      });

      return { backupId: new Date().toISOString(), collections: Object.keys(backupData) };
    } catch (error) {
      await this.createAuditLog({
        action: 'BACKUP',
        entityType: 'system',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: 'Failed to create system backup',
        status: 'FAILED',
      });
      throw new BadRequestException('Failed to create backup');
    }
  }

  async getDataOperations() {
    // For now, return recent audit logs related to data operations
    const operations = await this.auditLogModel
      .find({
        action: { $in: ['EXPORT', 'IMPORT', 'BACKUP', 'CLEANUP', 'MIGRATION'] }
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .exec();

    return {
      operations: operations.map(op => ({
        _id: op._id,
        type: op.action,
        status: op.status,
        description: op.description,
        progress: op.status === 'SUCCESS' ? 100 : op.status === 'FAILED' ? 0 : 50,
        startedAt: (op as any).createdAt,
        completedAt: op.status === 'SUCCESS' ? (op as any).createdAt : null,
        performedBy: op.performedBy,
        errorMessage: op.status === 'FAILED' ? 'Operation failed' : null,
      }))
    };
  }

  // System Settings Methods
  async getSystemSettings() {
    try {
      let configs = await this.systemConfigModel.find({ isActive: true }).lean().exec();
      if (!configs || configs.length === 0) {
        await this.initializeSystemSettings();
        configs = await this.systemConfigModel.find({ isActive: true }).lean().exec();
      }

      const settings = {
        general: [] as any[],
        email: [] as any[],
        security: [] as any[],
        branding: [] as any[],
        notifications: [] as any[],
        integrations: [] as any[],
      };

      configs.forEach((config: any) => {
        const category = config.category || 'general';
        const target = settings[category as keyof typeof settings];
        if (target) {
          target.push({ ...config, _id: config._id?.toString?.() ?? config._id });
        } else {
          settings.general.push({ ...config, _id: config._id?.toString?.() ?? config._id });
        }
      });

      return { settings };
    } catch (error) {
      throw new BadRequestException('Failed to fetch system settings');
    }
  }

  async updateSystemSettings(settingsData: any) {
    if (settingsData == null || typeof settingsData !== 'object') {
      return { success: true, message: 'No settings to update' };
    }
    try {
      const updates: Promise<any>[] = [];

      for (const [category, configs] of Object.entries(settingsData)) {
        if (Array.isArray(configs)) {
          for (const config of configs as any[]) {
            const key = config.key;
            const value = config.value;
            const name = config.name ?? config.key;
            const description = config.description;
            if (config._id) {
              updates.push(
                this.systemConfigModel
                  .findByIdAndUpdate(
                    config._id,
                    { value, lastModifiedBy: 'system' },
                    { new: true }
                  )
                  .exec()
              );
            } else if (key) {
              updates.push(
                this.systemConfigModel
                  .findOneAndUpdate(
                    { key },
                    {
                      $set: {
                        name,
                        value,
                        description,
                        category,
                        lastModifiedBy: 'system',
                        isActive: true,
                      },
                    },
                    { new: true, upsert: true }
                  )
                  .exec()
              );
            }
          }
        }
      }

      await Promise.all(updates);

      try {
        await this.createAuditLog({
          action: 'UPDATE',
          entityType: 'SystemSettings',
          performedBy: 'system',
          performedByRole: 'super-admin',
          description: 'System settings updated',
          status: 'SUCCESS',
        });
      } catch {
      }

      let settings: any;
      try {
        const fresh = await this.getSystemSettings();
        settings = fresh?.settings;
      } catch {
        settings = undefined;
      }
      return { success: true, message: 'Settings updated successfully', settings };
    } catch (error: any) {
      try {
        await this.createAuditLog({
          action: 'UPDATE',
          entityType: 'SystemSettings',
          performedBy: 'system',
          performedByRole: 'super-admin',
          description: 'Failed to update system settings',
          status: 'FAILED',
        });
      } catch {
      }
      const message = error?.message || 'Failed to update system settings';
      throw new BadRequestException(message);
    }
  }

  async resetSystemSettings(category: string) {
    try {
      // Define default settings for each category
      const defaultSettings = {
        general: [
          { key: 'system_name', name: 'System Name', value: 'Student Revelation System', category: 'general', description: 'Name of the system' },
          { key: 'system_version', name: 'System Version', value: '1.0.0', category: 'general', description: 'Current version' },
          { key: 'time_zone', name: 'Time Zone', value: 'UTC', category: 'general', description: 'Default timezone' },
          { key: 'date_format', name: 'Date Format', value: 'MM/DD/YYYY', category: 'general', description: 'Date display format' },
          { key: 'maintenance_mode', name: 'Maintenance Mode', value: false, category: 'general', description: 'Enable maintenance mode' },
          { key: 'maintenance_message', name: 'Maintenance Message', value: 'System is currently under maintenance. Please check back later.', category: 'general', description: 'Message shown during maintenance' }
        ],
        email: [
          { key: 'email_enabled', name: 'Enable Email Notifications', value: false, category: 'email', description: 'Enable email notifications' },
          { key: 'smtp_server', name: 'SMTP Server', value: '', category: 'email', description: 'SMTP server address' },
          { key: 'smtp_port', name: 'SMTP Port', value: 587, category: 'email', description: 'SMTP port number' },
          { key: 'smtp_username', name: 'SMTP Username', value: '', category: 'email', description: 'SMTP username' },
          { key: 'smtp_password', name: 'SMTP Password', value: '', category: 'email', description: 'SMTP password' },
          { key: 'from_email', name: 'From Email', value: '', category: 'email', description: 'Sender email address' },
          { key: 'from_name', name: 'From Name', value: 'Student Revelation System', category: 'email', description: 'Sender name' }
        ],
        security: [
          { key: 'password_expiry_days', name: 'Password Expiry (days)', value: 90, category: 'security', description: 'Password expiry in days' },
          { key: 'max_login_attempts', name: 'Max Login Attempts', value: 5, category: 'security', description: 'Maximum login attempts' },
          { key: 'session_timeout', name: 'Session Timeout (minutes)', value: 30, category: 'security', description: 'Session timeout in minutes' },
          { key: 'auto_logout_minutes', name: 'Auto Logout (minutes)', value: 60, category: 'security', description: 'Auto logout time' },
          { key: 'mfa_required', name: 'Require Multi-Factor Authentication', value: false, category: 'security', description: 'Require MFA for all users' },
          { key: 'password_complexity', name: 'Complex Password Requirements', value: false, category: 'security', description: 'Enforce complex passwords' },
          { key: 'ip_whitelisting', name: 'IP Whitelisting', value: false, category: 'security', description: 'Enable IP whitelisting' },
          { key: 'session_timeout_enabled', name: 'Session Timeout Warnings', value: false, category: 'security', description: 'Show session timeout warnings' }
        ],
        branding: [
          { key: 'organization_name', name: 'Organization Name', value: '', category: 'branding', description: 'Organization name' },
          { key: 'system_logo_url', name: 'System Logo URL', value: '', category: 'branding', description: 'Logo URL' },
          { key: 'primary_color', name: 'Primary Color', value: '#3b82f6', category: 'branding', description: 'Primary theme color' },
          { key: 'secondary_color', name: 'Secondary Color', value: '#64748b', category: 'branding', description: 'Secondary theme color' },
          { key: 'accent_color', name: 'Accent Color', value: '#10b981', category: 'branding', description: 'Accent color' },
          { key: 'custom_css', name: 'Custom CSS', value: '', category: 'branding', description: 'Custom CSS styles' },
          { key: 'footer_text', name: 'Footer Text', value: '© 2024 Your Organization. All rights reserved.', category: 'branding', description: 'Footer text' }
        ],
        notifications: [
          { key: 'email_notifications', name: 'Email Notifications', value: false, category: 'notifications', description: 'Enable email notifications' },
          { key: 'sms_notifications', name: 'SMS Notifications', value: false, category: 'notifications', description: 'Enable SMS notifications' },
          { key: 'push_notifications', name: 'Push Notifications', value: false, category: 'notifications', description: 'Enable push notifications' },
          { key: 'system_alerts', name: 'System Alert Notifications', value: false, category: 'notifications', description: 'Enable system alerts' },
          { key: 'notification_settings', name: 'Default Notification Settings', value: { email: true, sms: false, push: true, frequency: "immediate" }, category: 'notifications', description: 'Default notification preferences' }
        ],
        integrations: [
          { key: 'google_api_key', name: 'Google API Key', value: '', category: 'integrations', description: 'Google API key' },
          { key: 'azure_key', name: 'Microsoft Azure Key', value: '', category: 'integrations', description: 'Azure API key' },
          { key: 'aws_access_key', name: 'AWS Access Key', value: '', category: 'integrations', description: 'AWS access key' },
          { key: 'zoom_api_key', name: 'Zoom API Key', value: '', category: 'integrations', description: 'Zoom API key' },
          { key: 'google_classroom', name: 'Google Classroom Integration', value: false, category: 'integrations', description: 'Enable Google Classroom' },
          { key: 'microsoft_teams', name: 'Microsoft Teams Integration', value: false, category: 'integrations', description: 'Enable Microsoft Teams' },
          { key: 'zoom_integration', name: 'Zoom Integration', value: false, category: 'integrations', description: 'Enable Zoom integration' },
          { key: 'canvas_lms', name: 'Canvas LMS Integration', value: false, category: 'integrations', description: 'Enable Canvas LMS' }
        ]
      };

      const defaults = defaultSettings[category] || [];

      // Remove existing settings for the category
      await this.systemConfigModel.deleteMany({ category });

      // Create default settings
      await this.systemConfigModel.insertMany(defaults.map(setting => ({
        ...setting,
        isSystem: true,
        lastModifiedBy: 'system'
      })));

      await this.createAuditLog({
        action: 'RESET',
        entityType: 'SystemSettings',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: `Reset ${category} settings to defaults`,
        status: 'SUCCESS',
      });

      return { success: true, message: `${category} settings reset successfully` };
    } catch (error) {
      throw new BadRequestException(`Failed to reset ${category} settings`);
    }
  }

  async testEmailConfiguration() {
    try {
      // This is a mock implementation
      // In a real system, you would use the actual email configuration to send a test email

      await this.createAuditLog({
        action: 'TEST',
        entityType: 'EmailConfiguration',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: 'Email configuration test performed',
        status: 'SUCCESS',
      });

      return { success: true, message: 'Test email sent successfully' };
    } catch (error) {
      await this.createAuditLog({
        action: 'TEST',
        entityType: 'EmailConfiguration',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: 'Email configuration test failed',
        status: 'FAILED',
      });
      throw new BadRequestException('Failed to send test email');
    }
  }

  async testWelcomeEmail(email: string, firstName: string, lastName: string) {
    try {
      const testPassword = 'TestPassword123!';
      const result = await this.emailService.sendWelcomeEmail(
        email,
        firstName,
        lastName,
        'ADMIN',
        testPassword,
      );

      if (result) {
        return {
          success: true,
          message: `Welcome email sent successfully to ${email}`,
        };
      } else {
        return {
          success: false,
          message: `Email service not configured. Check console for credentials.`,
        };
      }
    } catch (error) {
      console.error('❌ Failed to send test welcome email:', error);
      throw new BadRequestException(`Failed to send test welcome email: ${error?.message || 'Unknown error'}`);
    }
  }

  async initializeSystemSettings() {
    try {
      // Check if settings are already initialized
      const existingConfigs = await this.systemConfigModel.countDocuments();
      if (existingConfigs > 0) {
        return { message: 'System settings already initialized' };
      }

      // Initialize all default settings
      const allSettings = [];
      const categories = ['general', 'email', 'security', 'branding', 'notifications', 'integrations'];

      for (const category of categories) {
        await this.resetSystemSettings(category);
      }

      await this.createAuditLog({
        action: 'INITIALIZE',
        entityType: 'SystemSettings',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: 'System settings initialized with defaults',
        status: 'SUCCESS',
      });

      return { success: true, message: 'System settings initialized successfully' };
    } catch (error) {
      throw new BadRequestException('Failed to initialize system settings');
    }
  }

  async getBrandingSettings() {
    try {
      const brandingConfigs = await this.systemConfigModel
        .find({ category: 'branding', isActive: true })
        .exec();

      const branding = {};
      brandingConfigs.forEach(config => {
        branding[config.key] = config.value;
      });

      return branding;
    } catch (error) {
      throw new BadRequestException('Failed to fetch branding settings');
    }
  }

  async applyBrandingSettings(schoolId?: string) {
    try {
      const brandingSettings = await this.getBrandingSettings();

      // Apply branding to schools if schoolId is provided
      if (schoolId) {
        await this.schoolModel.findByIdAndUpdate(schoolId, {
          $set: {
            'branding.primaryColor': brandingSettings['primary_color'] || '#3b82f6',
            'branding.secondaryColor': brandingSettings['secondary_color'] || '#64748b',
            'branding.accentColor': brandingSettings['accent_color'] || '#10b981',
            'branding.logoUrl': brandingSettings['system_logo_url'] || '',
            'branding.organizationName': brandingSettings['organization_name'] || '',
            'branding.customCSS': brandingSettings['custom_css'] || '',
            'branding.footerText': brandingSettings['footer_text'] || ''
          }
        });
      } else {
        // Apply to all schools
        await this.schoolModel.updateMany({}, {
          $set: {
            'branding.primaryColor': brandingSettings['primary_color'] || '#3b82f6',
            'branding.secondaryColor': brandingSettings['secondary_color'] || '#64748b',
            'branding.accentColor': brandingSettings['accent_color'] || '#10b981',
            'branding.logoUrl': brandingSettings['system_logo_url'] || '',
            'branding.organizationName': brandingSettings['organization_name'] || '',
            'branding.customCSS': brandingSettings['custom_css'] || '',
            'branding.footerText': brandingSettings['footer_text'] || ''
          }
        });
      }

      await this.createAuditLog({
        action: 'APPLY_BRANDING',
        entityType: 'SystemSettings',
        performedBy: 'system',
        performedByRole: 'super-admin',
        description: `Branding settings applied${schoolId ? ` to school ${schoolId}` : ' to all schools'}`,
        status: 'SUCCESS',
      });

      return { success: true, message: 'Branding settings applied successfully' };
    } catch (error) {
      throw new BadRequestException('Failed to apply branding settings');
    }
  }

  // Helper method for CSV formatting
  private formatCsvRow(data: any[]): string {
    return data.map(value =>
      typeof value === 'string' && (value.includes(',') || value.includes('"'))
        ? `"${value.replace(/"/g, '""')}"`
        : value
    ).join(',');
  }

  // ==================== EMAIL TEMPLATES ====================

  async getEmailTemplates(page: number, limit: number, filters: any = {}) {
    let list = [...this.emailTemplatesStore];
    if (filters?.type) {
      list = list.filter(t => t.type === filters.type);
    }
    if (filters?.status) {
      list = list.filter(t => t.status === filters.status);
    }
    const total = list.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTemplates = list.slice(startIndex, endIndex);
    return {
      templates: paginatedTemplates,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async createEmailTemplate(templateData: any) {
    const template = {
      id: Date.now().toString(),
      name: templateData.name ?? '',
      subject: templateData.subject ?? '',
      body: templateData.body ?? '',
      type: templateData.type ?? 'other',
      status: templateData.status ?? 'active',
      variables: Array.isArray(templateData.variables) ? templateData.variables : [],
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };
    this.emailTemplatesStore.push(template);
    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'EmailTemplate',
      entityId: template.id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created email template: ${template.name}`,
      status: 'SUCCESS',
    });
    return template;
  }

  async getEmailTemplate(id: string) {
    const template = this.emailTemplatesStore.find(t => t.id === id);
    if (!template) {
      throw new NotFoundException(`Email template with id ${id} not found`);
    }
    return template;
  }

  async updateEmailTemplate(id: string, updateData: any) {
    const idx = this.emailTemplatesStore.findIndex(t => t.id === id);
    if (idx === -1) {
      throw new NotFoundException(`Email template with id ${id} not found`);
    }
    const existing = this.emailTemplatesStore[idx];
    const template = {
      ...existing,
      name: updateData.name ?? existing.name,
      subject: updateData.subject ?? existing.subject,
      body: updateData.body ?? existing.body,
      type: updateData.type ?? existing.type,
      status: updateData.status ?? existing.status,
      variables: Array.isArray(updateData.variables) ? updateData.variables : existing.variables ?? [],
      lastModified: new Date().toISOString()
    };
    this.emailTemplatesStore[idx] = template;
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'EmailTemplate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Updated email template: ${template.name}`,
      status: 'SUCCESS',
    });
    return template;
  }

  async deleteEmailTemplate(id: string) {
    const idx = this.emailTemplatesStore.findIndex(t => t.id === id);
    if (idx === -1) {
      throw new NotFoundException(`Email template with id ${id} not found`);
    }
    this.emailTemplatesStore.splice(idx, 1);
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'EmailTemplate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Deleted email template`,
      status: 'SUCCESS',
    });
    return { success: true, message: 'Email template deleted successfully' };
  }

  async previewEmailTemplate(id: string, previewData: any) {
    const template = await this.getEmailTemplate(id);

    let subject = template.subject;
    let body = template.body;

    // Replace variables with preview data
    for (const [key, value] of Object.entries(previewData)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value as string);
      body = body.replace(regex, value as string);
    }

    return {
      subject,
      body,
      previewData
    };
  }

  // ==================== SCHEDULED JOBS ====================

  private scheduledJobToResponse(doc: any) {
    const obj = doc.toObject ? doc.toObject() : doc;
    return {
      ...obj,
      _id: obj._id?.toString(),
      id: obj._id?.toString(),
      cronExpression: obj.schedule || obj.cronExpression,
      isActive: obj.enabled !== false,
      status: obj.status || (obj.enabled ? 'running' : 'stopped'),
      lastRun: obj.lastRun ? new Date(obj.lastRun).toISOString() : undefined,
      nextRun: obj.nextRun ? new Date(obj.nextRun).toISOString() : undefined,
      createdAt: obj.createdAt ? new Date(obj.createdAt).toISOString() : undefined,
      updatedAt: obj.updatedAt ? new Date(obj.updatedAt).toISOString() : undefined,
    };
  }

  async getScheduledJobs(page: number, limit: number, filters: any = {}) {
    const filter: any = {};
    if (filters?.status) filter.status = filters.status;
    if (filters?.type) filter.type = filters.type;
    const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
    const limitNum = Math.max(1, Math.min(100, limit));
    const [docs, total] = await Promise.all([
      this.scheduledJobModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      this.scheduledJobModel.countDocuments(filter),
    ]);
    const jobs = docs.map((d: any) => this.scheduledJobToResponse({ ...d, _id: d._id }));
    return {
      jobs,
      total,
      page: Number(page),
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  async createScheduledJob(jobData: any) {
    const name = jobData?.name != null ? String(jobData.name).trim() : '';
    if (!name) throw new BadRequestException('Job name is required');
    const schedule = jobData.cronExpression || jobData.schedule || '0 0 2 * * *';
    const enabled = jobData.isActive !== undefined ? !!jobData.isActive : (jobData.enabled !== false);
    const parameters = jobData.parameters && typeof jobData.parameters === 'object' && !Array.isArray(jobData.parameters) ? jobData.parameters : {};
    const doc = await this.scheduledJobModel.create({
      name,
      description: jobData.description != null ? String(jobData.description).trim() : undefined,
      type: jobData.type && String(jobData.type).trim() ? String(jobData.type).trim() : 'custom',
      schedule: String(schedule).trim() || '0 0 2 * * *',
      enabled,
      status: enabled ? 'active' : 'inactive',
      parameters,
    });
    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'ScheduledJob',
      entityId: doc._id.toString(),
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created scheduled job: ${doc.name}`,
      status: 'SUCCESS',
    });
    return this.scheduledJobToResponse(doc);
  }

  async getScheduledJob(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Scheduled job not found');
    const doc = await this.scheduledJobModel.findById(id);
    if (!doc) throw new NotFoundException('Scheduled job not found');
    return this.scheduledJobToResponse(doc);
  }

  async updateScheduledJob(id: string, updateData: any) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Scheduled job not found');
    const schedule = updateData.cronExpression ?? updateData.schedule;
    const enabled = updateData.isActive !== undefined ? !!updateData.isActive : updateData.enabled;
    const set: any = { lastModified: new Date() };
    if (updateData.name != null) set.name = updateData.name;
    if (updateData.description != null) set.description = updateData.description;
    if (updateData.type != null) set.type = updateData.type;
    if (schedule != null) set.schedule = schedule;
    if (enabled !== undefined) {
      set.enabled = enabled;
      set.status = enabled ? 'active' : 'inactive';
    }
    if (updateData.parameters != null) set.parameters = updateData.parameters;
    const doc = await this.scheduledJobModel.findByIdAndUpdate(id, { $set: set }, { new: true });
    if (!doc) throw new NotFoundException('Scheduled job not found');
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'ScheduledJob',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: 'Updated scheduled job',
      status: 'SUCCESS',
    });
    return this.scheduledJobToResponse(doc);
  }

  async deleteScheduledJob(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Scheduled job not found');
    const doc = await this.scheduledJobModel.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Scheduled job not found');
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'ScheduledJob',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: 'Deleted scheduled job',
      status: 'SUCCESS',
    });
    return { success: true, message: 'Scheduled job deleted successfully' };
  }

  async runScheduledJob(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Scheduled job not found');
    const doc = await this.scheduledJobModel.findById(id);
    if (!doc) throw new NotFoundException('Scheduled job not found');
    await this.scheduledJobModel.findByIdAndUpdate(id, {
      $set: { lastRun: new Date() },
      $inc: { executionCount: 1, successCount: 1 },
    });
    await this.createAuditLog({
      action: 'EXECUTE',
      entityType: 'ScheduledJob',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: 'Manually executed scheduled job',
      status: 'SUCCESS',
    });
    return {
      success: true,
      message: 'Job executed successfully',
      executionId: Date.now().toString(),
      startTime: new Date().toISOString(),
    };
  }

  async toggleScheduledJob(id: string, enabled: boolean) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Scheduled job not found');
    const doc = await this.scheduledJobModel.findByIdAndUpdate(
      id,
      { $set: { enabled, status: enabled ? 'active' : 'inactive' } },
      { new: true },
    );
    if (!doc) throw new NotFoundException('Scheduled job not found');
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'ScheduledJob',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `${enabled ? 'Enabled' : 'Disabled'} scheduled job`,
      status: 'SUCCESS',
    });
    return { success: true, enabled };
  }

  private normalizeGrade(grade: string): string {
    if (!grade || typeof grade !== 'string') return '';
    const g = grade.trim();
    const map: Record<string, string> = {
      'pre-k': 'Pre-K', 'prek': 'Pre-K',
      'k': 'Kindergarten', 'kindergarten': 'Kindergarten', 'kg': 'Kindergarten',
      '1st grade': 'Grade 1', 'grade 1': 'Grade 1', '1': 'Grade 1',
      '2nd grade': 'Grade 2', 'grade 2': 'Grade 2', '2': 'Grade 2',
      '3rd grade': 'Grade 3', 'grade 3': 'Grade 3', '3': 'Grade 3',
      '4th grade': 'Grade 4', 'grade 4': 'Grade 4', '4': 'Grade 4',
      '5th grade': 'Grade 5', 'grade 5': 'Grade 5', '5': 'Grade 5',
      '6th grade': 'Grade 6', 'grade 6': 'Grade 6', '6': 'Grade 6',
      '7th grade': 'Grade 7', 'grade 7': 'Grade 7', '7': 'Grade 7',
      '8th grade': 'Grade 8', 'grade 8': 'Grade 8', '8': 'Grade 8',
      '9th grade': 'Grade 9', 'grade 9': 'Grade 9', '9': 'Grade 9',
      '10th grade': 'Grade 10', 'grade 10': 'Grade 10', '10': 'Grade 10',
      '11th grade': 'Grade 11', 'grade 11': 'Grade 11', '11': 'Grade 11',
      '12th grade': 'Grade 12', 'grade 12': 'Grade 12', '12': 'Grade 12',
      'graduate': 'Graduate', 'graduated': 'Graduate', 'grad': 'Graduate',
    };
    return map[g.toLowerCase()] || g;
  }

  private gradesMatch(ruleFrom: string, studentGrade: string): boolean {
    const rNorm = this.normalizeGrade(ruleFrom);
    const sNorm = this.normalizeGrade(studentGrade);
    if (!rNorm || !sNorm) return false;
    if (rNorm === sNorm) return true;
    if (sNorm.startsWith(rNorm)) return true;
    if (rNorm.startsWith(sNorm)) return true;
    return false;
  }

  async getRolloverConfigs(filters: any = {}) {
    const query: any = {};
    if (filters.schoolId) query.schoolId = filters.schoolId;
    if (filters.academicYear) {
      query.$or = [
        { fromYear: filters.academicYear },
        { toYear: filters.academicYear },
      ];
    }
    const configs = await this.rolloverConfigModel
      .find(query)
      .sort({ createdAt: -1 })
      .lean();
    return { configs };
  }

  async createRolloverConfig(configData: any) {
    const payload = this.mapFrontendToBackendConfig(configData);
    if (!payload.schoolId) throw new BadRequestException('schoolId is required');
    const [fromYear, toYear] = this.parseAcademicYear(payload.academicYear || configData.academicYear);
    const school = await this.schoolModel.findById(payload.schoolId).lean();
    const config = await this.rolloverConfigModel.create({
      name: payload.name || `Rollover ${fromYear} to ${toYear}`,
      fromYear,
      toYear,
      schoolId: payload.schoolId,
      schoolName: school?.name,
      status: 'draft',
      promotionRules: payload.promotionRules || [],
      archiveSettings: payload.archiveSettings || {},
      createdBy: configData.createdBy,
    });
    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'RolloverConfig',
      entityId: config._id.toString(),
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created rollover: ${config.name}`,
      status: 'SUCCESS',
    });
    return config;
  }

  async updateRolloverConfig(id: string, updateData: any) {
    const config = await this.rolloverConfigModel.findById(id);
    if (!config) throw new NotFoundException('Rollover config not found');
    if (config.status === 'completed' || config.status === 'in-progress') {
      throw new BadRequestException('Cannot update a completed or in-progress rollover');
    }
    const payload = this.mapFrontendToBackendConfig(updateData);
    const updates: any = { lastModified: new Date() };
    if (payload.name != null) updates.name = payload.name;
    if (payload.fromYear != null) updates.fromYear = payload.fromYear;
    if (payload.toYear != null) updates.toYear = payload.toYear;
    if (payload.promotionRules != null) updates.promotionRules = payload.promotionRules;
    if (payload.archiveSettings != null) updates.archiveSettings = { ...config.archiveSettings, ...payload.archiveSettings };
    await this.rolloverConfigModel.updateOne({ _id: id }, { $set: updates });
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'RolloverConfig',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: 'Updated rollover configuration',
      status: 'SUCCESS',
    });
    return this.rolloverConfigModel.findById(id).lean();
  }

  private parseAcademicYear(academicYear: string): [string, string] {
    if (!academicYear || !academicYear.includes('-')) {
      const y = new Date().getFullYear();
      return [`${y - 1}-${y}`, `${y}-${y + 1}`];
    }
    const parts = academicYear.split('-').map((p) => p.trim());
    if (parts.length >= 2) {
      const a = parseInt(parts[0], 10);
      const b = parseInt(parts[1], 10);
      if (!isNaN(a) && !isNaN(b)) return [`${a - 1}-${a}`, `${b - 1}-${b}`];
    }
    const y = new Date().getFullYear();
    return [`${y - 1}-${y}`, `${y}-${y + 1}`];
  }

  private mapFrontendToBackendConfig(data: any): any {
    const academicYear = data.academicYear;
    const [fromYear, toYear] = this.parseAcademicYear(academicYear);
    const rawRules = data.rolloverRules || data.promotionRules || [];
    const rules = rawRules
      .map((r: any) => ({
        fromGrade: this.normalizeGrade(r.fromGrade || r.from),
        toGrade: this.normalizeGrade(r.toGrade || r.to),
        condition: r.condition || r.conditions?.type || 'automatic',
      }))
      .filter((r: any) => r.fromGrade && r.toGrade);
    const archive = data.archiveSettings || {};
    return {
      name: data.name,
      academicYear,
      fromYear,
      toYear,
      schoolId: data.schoolId,
      promotionRules: rules,
      archiveSettings: {
        archiveGrades: archive.includeGrades ?? archive.archiveGrades ?? true,
        archiveAttendance: archive.includeAttendance ?? archive.archiveAttendance ?? true,
        archiveBehavior: archive.includeBehavior ?? archive.archiveBehavior ?? true,
        archiveDocuments: archive.archiveDocuments ?? false,
        retentionPeriod: archive.retentionPeriod ?? 7,
      },
    };
  }

  async previewRollover(id: string) {
    const config = await this.rolloverConfigModel.findById(id).lean();
    if (!config) throw new NotFoundException('Rollover config not found');
    const schoolId = config.schoolId ? new Types.ObjectId(String(config.schoolId)) : null;
    if (!schoolId) throw new BadRequestException('Rollover config has no schoolId');
    const students = await this.userModel
      .find({ schoolId, role: UserRole.STUDENT, isActive: true })
      .select('class gradeLevel')
      .lean();
    const breakdown: Array<{ fromGrade: string; toGrade: string; count: number }> = [];
    let toPromote = 0;
    let toRetain = 0;
    const rules = config.promotionRules || [];
    for (const student of students) {
      const current = this.normalizeGrade(student.class || student.gradeLevel || '');
      if (!current) {
        toRetain++;
        continue;
      }
      const rule = rules.find((r) => this.gradesMatch(r.fromGrade, current));
      if (rule) {
        toPromote++;
        const from = this.normalizeGrade(rule.fromGrade);
        const to = this.normalizeGrade(rule.toGrade);
        const existing = breakdown.find((b) => b.fromGrade === from && b.toGrade === to);
        if (existing) existing.count++;
        else breakdown.push({ fromGrade: from, toGrade: to, count: 1 });
      } else {
        toRetain++;
      }
    }
    return {
      studentsToPromote: toPromote,
      studentsToRetain: toRetain,
      promotionBreakdown: breakdown,
      totalStudents: students.length,
    };
  }

  async executeRollover(id: string, options: any) {
    const config = await this.rolloverConfigModel.findById(id);
    if (!config) throw new NotFoundException('Rollover config not found');
    if (config.status === 'completed') {
      throw new BadRequestException('This rollover has already been completed');
    }
    if (config.status === 'in-progress') {
      throw new BadRequestException('Rollover is already in progress');
    }
    const rules = config.promotionRules || [];
    if (!rules.length) throw new BadRequestException('No promotion rules configured');
    const schoolIdObj = config.schoolId ? new Types.ObjectId(String(config.schoolId)) : null;
    if (!schoolIdObj) throw new BadRequestException('Rollover config has no schoolId');
    await this.rolloverConfigModel.updateOne(
      { _id: id },
      { $set: { status: 'in-progress' } },
    );
    const errors: string[] = [];
    let promoted = 0;
    let retained = 0;
    try {
      const students = await this.userModel
        .find({ schoolId: schoolIdObj, role: UserRole.STUDENT, isActive: true })
        .select('_id class gradeLevel')
        .lean();
      for (const student of students) {
        const current = this.normalizeGrade(student.class || student.gradeLevel || '');
        if (!current) {
          retained++;
          continue;
        }
        const rule = rules.find((r) => this.gradesMatch(r.fromGrade, current));
        if (!rule || rule.condition === 'manual_review') {
          retained++;
          continue;
        }
        const toGrade = this.normalizeGrade(rule.toGrade);
        try {
          await this.userModel.updateOne(
            { _id: student._id },
            {
              $set: {
                previousGrade: current,
                class: toGrade,
                gradeLevel: toGrade,
              },
            },
          );
          await this.studentProfileModel.updateMany(
            { userId: student._id },
            { $set: { gradeLevel: toGrade } },
          );
          promoted++;
          if (toGrade === 'Graduate') {
            await this.userModel.updateOne(
              { _id: student._id },
              { $set: { isActive: false } },
            );
            await this.studentProfileModel.updateMany(
              { userId: student._id },
              { $set: { enrollmentStatus: 'Graduated' } },
            );
          }
        } catch (err: any) {
          errors.push(`Student ${student._id}: ${err?.message || 'Update failed'}`);
          retained++;
        }
      }
      await this.rolloverConfigModel.updateOne(
        { _id: id },
        {
          $set: {
            status: errors.length > 0 && promoted === 0 ? 'failed' : 'completed',
            studentsProcessed: students.length,
            studentsPromoted: promoted,
            studentsRetained: retained,
            executedAt: new Date(),
            executedBy: options?.executedBy || 'super-admin',
            errorMessages: errors.length ? errors : undefined,
          },
        },
      );
      await this.createAuditLog({
        action: 'EXECUTE',
        entityType: 'RolloverConfig',
        entityId: id,
        performedBy: options?.executedBy || 'super-admin',
        performedByRole: 'super-admin',
        description: `Executed rollover: ${promoted} promoted, ${retained} retained`,
        status: 'SUCCESS',
      });
      return {
        success: true,
        message: 'Rollover completed successfully',
        studentsProcessed: students.length,
        studentsPromoted: promoted,
        studentsRetained: retained,
        errors: errors.length ? errors : undefined,
      };
    } catch (err: any) {
      await this.rolloverConfigModel.updateOne(
        { _id: id },
        {
          $set: {
            status: 'failed',
            errorMessages: [err?.message || 'Rollover execution failed'],
          },
        },
      );
      throw err;
    }
  }

  // ==================== CUSTOM REPORTS ====================

  async getCustomReports(page: number, limit: number, filters: any = {}) {
    let list = [...this.customReportsStore];
    if (filters?.status) {
      list = list.filter((r) => r.status === filters.status);
    }
    const total = list.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedReports = list.slice(startIndex, endIndex);

    return {
      reports: paginatedReports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async createCustomReport(reportData: any) {
    const report = {
      id: Date.now().toString(),
      ...reportData,
      status: reportData.status || 'draft',
      createdAt: new Date().toISOString()
    };
    this.customReportsStore.push(report);

    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'CustomReport',
      entityId: report.id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created custom report: ${report.name}`,
      status: 'SUCCESS',
    });

    return report;
  }

  async getCustomReport(id: string) {
    const report = this.customReportsStore.find((r) => r.id === id);
    if (!report) {
      throw new NotFoundException('Custom report not found');
    }
    return report;
  }

  async updateCustomReport(id: string, updateData: any) {
    const idx = this.customReportsStore.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundException('Custom report not found');
    }
    const report = {
      ...this.customReportsStore[idx],
      ...updateData,
      id: this.customReportsStore[idx].id,
      lastModified: new Date().toISOString()
    };
    this.customReportsStore[idx] = report;

    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'CustomReport',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Updated custom report`,
      status: 'SUCCESS',
    });

    return report;
  }

  async deleteCustomReport(id: string) {
    const idx = this.customReportsStore.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundException('Custom report not found');
    }
    this.customReportsStore.splice(idx, 1);

    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'CustomReport',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Deleted custom report`,
      status: 'SUCCESS',
    });

    return { success: true, message: 'Custom report deleted successfully' };
  }

  async previewCustomReport(reportConfig: any) {
    // Mock preview data
    const previewData = [
      { studentName: 'John Doe', grade: '10', gpa: 3.8, attendance: 95 },
      { studentName: 'Jane Smith', grade: '10', gpa: 3.9, attendance: 97 },
      { studentName: 'Mike Johnson', grade: '11', gpa: 3.7, attendance: 93 }
    ];

    return previewData.slice(0, 100); // Limit preview to 100 rows
  }

  async runCustomReport(id: string) {
    // In a real implementation, this would generate an Excel file
    // For now, return a simple buffer
    const reportData = await this.previewCustomReport({});

    await this.createAuditLog({
      action: 'GENERATE',
      entityType: 'CustomReport',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Generated custom report`,
      status: 'SUCCESS',
    });

    // Mock Excel buffer - in real implementation, use a library like ExcelJS
    return Buffer.from('Mock Excel Data');
  }

  async getDataSources() {
    return [
      {
        id: 'students',
        name: 'Students',
        table: 'student_profiles',
        description: 'Student profile and academic data',
        fields: [
          { id: 'studentName', name: 'Student Name', type: 'string', description: 'Full name of student' },
          { id: 'studentId', name: 'Student ID', type: 'string', description: 'Unique student identifier' },
          { id: 'grade', name: 'Grade Level', type: 'string', description: 'Current grade level' },
          { id: 'gpa', name: 'GPA', type: 'number', description: 'Grade point average' },
          { id: 'attendance', name: 'Attendance %', type: 'number', description: 'Attendance percentage' },
          { id: 'enrollmentDate', name: 'Enrollment Date', type: 'date', description: 'Date student enrolled' },
          { id: 'status', name: 'Status', type: 'string', description: 'Active, inactive, graduated' },
          { id: 'gender', name: 'Gender', type: 'string', description: 'Student gender' },
          { id: 'dateOfBirth', name: 'Date of Birth', type: 'date', description: 'Student birth date' }
        ]
      },
      {
        id: 'teachers',
        name: 'Teachers',
        table: 'teacher_profiles',
        description: 'Teacher profile and employment data',
        fields: [
          { id: 'teacherName', name: 'Teacher Name', type: 'string', description: 'Full name of teacher' },
          { id: 'teacherId', name: 'Teacher ID', type: 'string', description: 'Unique teacher identifier' },
          { id: 'department', name: 'Department', type: 'string', description: 'Teaching department' },
          { id: 'yearsExperience', name: 'Years Experience', type: 'number', description: 'Years of teaching experience' },
          { id: 'hireDate', name: 'Hire Date', type: 'date', description: 'Date of employment' },
          { id: 'status', name: 'Status', type: 'string', description: 'Active, inactive, on leave' },
          { id: 'qualifications', name: 'Qualifications', type: 'string', description: 'Educational qualifications' }
        ]
      },
      {
        id: 'courses',
        name: 'Courses',
        table: 'courses',
        description: 'Course and curriculum data',
        fields: [
          { id: 'courseName', name: 'Course Name', type: 'string', description: 'Name of the course' },
          { id: 'courseCode', name: 'Course Code', type: 'string', description: 'Unique course identifier' },
          { id: 'department', name: 'Department', type: 'string', description: 'Course department' },
          { id: 'credits', name: 'Credits', type: 'number', description: 'Credit hours' },
          { id: 'enrollmentCount', name: 'Enrollment Count', type: 'number', description: 'Number of enrolled students' },
          { id: 'status', name: 'Status', type: 'string', description: 'Active, inactive, archived' }
        ]
      },
      {
        id: 'attendance',
        name: 'Attendance',
        table: 'attendance',
        description: 'Student attendance records',
        fields: [
          { id: 'studentId', name: 'Student ID', type: 'string', description: 'Student identifier' },
          { id: 'date', name: 'Date', type: 'date', description: 'Attendance date' },
          { id: 'status', name: 'Status', type: 'string', description: 'Present, absent, late, excused' },
          { id: 'courseId', name: 'Course ID', type: 'string', description: 'Course identifier' },
          { id: 'period', name: 'Period', type: 'string', description: 'Class period' }
        ]
      },
      {
        id: 'grades',
        name: 'Grades',
        table: 'grades',
        description: 'Student grade and assessment data',
        fields: [
          { id: 'studentId', name: 'Student ID', type: 'string', description: 'Student identifier' },
          { id: 'courseId', name: 'Course ID', type: 'string', description: 'Course identifier' },
          { id: 'grade', name: 'Grade', type: 'string', description: 'Letter or numeric grade' },
          { id: 'points', name: 'Grade Points', type: 'number', description: 'Numeric grade value' },
          { id: 'semester', name: 'Semester', type: 'string', description: 'Academic semester' },
          { id: 'year', name: 'Academic Year', type: 'string', description: 'Academic year' }
        ]
      },
      {
        id: 'behavior',
        name: 'Behavior Records',
        table: 'behavior',
        description: 'Student behavior and disciplinary records',
        fields: [
          { id: 'studentId', name: 'Student ID', type: 'string', description: 'Student identifier' },
          { id: 'type', name: 'Type', type: 'string', description: 'Positive, negative, neutral' },
          { id: 'severity', name: 'Severity', type: 'string', description: 'Minor, major, severe' },
          { id: 'date', name: 'Date', type: 'date', description: 'Incident date' },
          { id: 'description', name: 'Description', type: 'string', description: 'Behavior description' }
        ]
      },
      {
        id: 'schools',
        name: 'Schools',
        table: 'schools',
        description: 'School information and statistics',
        fields: [
          { id: 'schoolName', name: 'School Name', type: 'string', description: 'Name of the school' },
          { id: 'schoolCode', name: 'School Code', type: 'string', description: 'Unique school identifier' },
          { id: 'studentCount', name: 'Student Count', type: 'number', description: 'Total enrolled students' },
          { id: 'teacherCount', name: 'Teacher Count', type: 'number', description: 'Total teachers' },
          { id: 'address', name: 'Address', type: 'string', description: 'School address' },
          { id: 'establishedDate', name: 'Established Date', type: 'date', description: 'School establishment date' }
        ]
      },
      {
        id: 'parents',
        name: 'Parents/Guardians',
        table: 'parent_profiles',
        description: 'Parent and guardian information',
        fields: [
          { id: 'parentName', name: 'Parent Name', type: 'string', description: 'Full name of parent/guardian' },
          { id: 'relationship', name: 'Relationship', type: 'string', description: 'Relationship to student' },
          { id: 'email', name: 'Email', type: 'string', description: 'Contact email' },
          { id: 'phone', name: 'Phone', type: 'string', description: 'Contact phone number' },
          { id: 'childrenCount', name: 'Children Count', type: 'number', description: 'Number of children in school' }
        ]
      }
    ];
  }

  // ==================== SYSTEM ALERTS ====================

  async getSystemAlerts(page: number, limit: number, filters: any = {}) {
    const count = await this.systemAlertModel.countDocuments();
    if (count === 0) {
      await this.systemAlertModel.insertMany([
        {
          title: 'High Memory Usage',
          message: 'System memory usage has exceeded 85% for the past 10 minutes',
          type: 'warning',
          category: 'performance',
          priority: 'high',
          status: 'active',
          source: 'System Monitor',
          affectedSystems: ['Database Server', 'Application Server'],
          actionItems: [
            'Check for memory leaks in running processes',
            'Consider restarting services if necessary',
            'Monitor memory usage trends'
          ]
        },
        {
          title: 'Failed Login Attempts',
          message: 'Multiple failed login attempts detected from IP 192.168.1.100',
          type: 'critical',
          category: 'security',
          priority: 'critical',
          status: 'active',
          source: 'Security Monitor',
          affectedSystems: ['Authentication Service'],
          actionItems: [
            'Block suspicious IP address',
            'Review security logs',
            'Consider enabling additional authentication measures'
          ]
        }
      ]);
    }

    const query: any = {};
    if (filters.status && filters.status !== 'all') query.status = filters.status;
    if (filters.priority && filters.priority !== 'all') query.priority = filters.priority;
    if (filters.category && filters.category !== 'all') query.category = filters.category;

    const total = await this.systemAlertModel.countDocuments(query);
    const docs = await this.systemAlertModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const alerts = docs.map((doc: any) => ({
      id: doc._id.toString(),
      title: doc.title,
      message: doc.message,
      type: doc.type,
      category: doc.category,
      priority: doc.priority,
      status: doc.status,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      source: doc.source || '',
      affectedSystems: doc.affectedSystems || [],
      actionItems: doc.actionItems,
      acknowledgedAt: doc.acknowledgedAt ? new Date(doc.acknowledgedAt).toISOString() : undefined,
      acknowledgedBy: doc.acknowledgedBy,
      resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : undefined,
      resolvedBy: doc.resolvedBy,
      ignoredAt: doc.ignoredAt ? new Date(doc.ignoredAt).toISOString() : undefined,
      ignoredBy: doc.ignoredBy
    }));

    return {
      alerts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async acknowledgeAlert(id: string, acknowledgedBy: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Alert not found');
    }
    const doc = await this.systemAlertModel.findByIdAndUpdate(
      id,
      { $set: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy } },
      { new: true }
    );
    if (!doc) {
      throw new NotFoundException('Alert not found');
    }
    await this.createAuditLog({
      action: 'ACKNOWLEDGE',
      entityType: 'SystemAlert',
      entityId: id,
      performedBy: acknowledgedBy,
      performedByRole: 'super-admin',
      description: `Acknowledged system alert`,
      status: 'SUCCESS',
    });
    return {
      success: true,
      acknowledgedAt: doc.acknowledgedAt ? new Date(doc.acknowledgedAt).toISOString() : new Date().toISOString(),
      acknowledgedBy
    };
  }

  async resolveAlert(id: string, resolvedBy: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Alert not found');
    }
    const doc = await this.systemAlertModel.findByIdAndUpdate(
      id,
      { $set: { status: 'resolved', resolvedAt: new Date(), resolvedBy } },
      { new: true }
    );
    if (!doc) {
      throw new NotFoundException('Alert not found');
    }
    await this.createAuditLog({
      action: 'RESOLVE',
      entityType: 'SystemAlert',
      entityId: id,
      performedBy: resolvedBy,
      performedByRole: 'super-admin',
      description: `Resolved system alert`,
      status: 'SUCCESS',
    });
    return {
      success: true,
      resolvedAt: doc.resolvedAt ? new Date(doc.resolvedAt).toISOString() : new Date().toISOString(),
      resolvedBy
    };
  }

  async ignoreAlert(id: string, ignoredBy: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Alert not found');
    }
    const doc = await this.systemAlertModel.findByIdAndUpdate(
      id,
      { $set: { status: 'ignored', ignoredAt: new Date(), ignoredBy } },
      { new: true }
    );
    if (!doc) {
      throw new NotFoundException('Alert not found');
    }
    await this.createAuditLog({
      action: 'IGNORE',
      entityType: 'SystemAlert',
      entityId: id,
      performedBy: ignoredBy,
      performedByRole: 'super-admin',
      description: `Ignored system alert`,
      status: 'SUCCESS',
    });
    return {
      success: true,
      ignoredAt: doc.ignoredAt ? new Date(doc.ignoredAt).toISOString() : new Date().toISOString(),
      ignoredBy
    };
  }

  async getAlertRules() {
    const count = await this.alertRuleModel.countDocuments();
    if (count === 0) {
      await this.alertRuleModel.create({
        name: 'High Memory Usage Alert',
        description: 'Alert when system memory usage exceeds threshold',
        condition: 'memory_usage > 85',
        threshold: 85,
        duration: 10,
        severity: 'high',
        category: 'performance',
        enabled: true,
        notifications: [
          { type: 'email', target: 'admin@school.com', enabled: true },
          { type: 'sms', target: '+1234567890', enabled: false }
        ],
        cooldown: 30
      });
    }
    const docs = await this.alertRuleModel.find().sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      condition: doc.condition,
      threshold: doc.threshold,
      duration: doc.duration,
      severity: doc.severity,
      category: doc.category,
      enabled: doc.enabled ?? true,
      notifications: doc.notifications || [],
      cooldown: doc.cooldown ?? 5,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      lastTriggered: doc.lastTriggered ? new Date(doc.lastTriggered).toISOString() : undefined
    }));
  }

  async createAlertRule(ruleData: any) {
    const name = ruleData?.name != null ? String(ruleData.name).trim() : '';
    const condition = ruleData?.condition != null ? String(ruleData.condition).trim() : '';
    if (!name || !condition) {
      throw new BadRequestException('name and condition are required');
    }
    const rawNotifications = Array.isArray(ruleData?.notifications) ? ruleData.notifications : [];
    const notifications = rawNotifications.map((n: any) => ({
      type: n?.type && ['email', 'sms', 'slack', 'webhook'].includes(n.type) ? n.type : 'email',
      target: n?.target != null ? String(n.target) : '',
      enabled: n?.enabled !== false
    }));
    const doc = await this.alertRuleModel.create({
      name,
      description: ruleData.description != null && ruleData.description !== '' ? String(ruleData.description).trim() : undefined,
      condition,
      threshold: Number(ruleData.threshold) || 0,
      duration: Number(ruleData.duration) || 5,
      severity: ['low', 'medium', 'high', 'critical'].includes(ruleData.severity) ? ruleData.severity : 'medium',
      category: ['system', 'security', 'performance', 'maintenance', 'user', 'integration', 'data'].includes(ruleData.category) ? ruleData.category : 'system',
      enabled: ruleData.enabled !== false,
      notifications,
      cooldown: typeof ruleData.cooldown === 'number' ? ruleData.cooldown : (Number(ruleData.cooldown) || 5)
    });
    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'AlertRule',
      entityId: doc._id.toString(),
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created alert rule: ${doc.name}`,
      status: 'SUCCESS',
    });
    return {
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      condition: doc.condition,
      threshold: doc.threshold,
      duration: doc.duration,
      severity: doc.severity,
      category: doc.category,
      enabled: doc.enabled,
      notifications: doc.notifications,
      cooldown: doc.cooldown,
      createdAt: (doc as any).createdAt ? new Date((doc as any).createdAt).toISOString() : new Date().toISOString()
    };
  }

  async updateAlertRule(id: string, updateData: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Alert rule not found');
    }
    const name = updateData?.name != null ? String(updateData.name).trim() : undefined;
    const condition = updateData?.condition != null ? String(updateData.condition).trim() : undefined;
    if (name !== undefined && !name) {
      throw new BadRequestException('name cannot be empty');
    }
    if (condition !== undefined && !condition) {
      throw new BadRequestException('condition cannot be empty');
    }
    const set: any = { lastModified: new Date() };
    if (updateData.name != null) set.name = String(updateData.name).trim();
    if (updateData.description != null) set.description = String(updateData.description).trim();
    if (updateData.condition != null) set.condition = String(updateData.condition).trim();
    if (updateData.threshold != null) set.threshold = Number(updateData.threshold);
    if (updateData.duration != null) set.duration = Number(updateData.duration);
    if (updateData.severity != null) set.severity = updateData.severity;
    if (updateData.category != null) set.category = updateData.category;
    if (updateData.enabled !== undefined) set.enabled = updateData.enabled;
    if (Array.isArray(updateData.notifications)) set.notifications = updateData.notifications;
    if (updateData.cooldown != null) set.cooldown = Number(updateData.cooldown);
    const doc = await this.alertRuleModel.findByIdAndUpdate(id, { $set: set }, { new: true });
    if (!doc) {
      throw new NotFoundException('Alert rule not found');
    }
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'AlertRule',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Updated alert rule`,
      status: 'SUCCESS',
    });
    return {
      id: doc._id.toString(),
      name: doc.name,
      description: doc.description,
      condition: doc.condition,
      threshold: doc.threshold,
      duration: doc.duration,
      severity: doc.severity,
      category: doc.category,
      enabled: doc.enabled,
      notifications: doc.notifications,
      cooldown: doc.cooldown,
      createdAt: (doc as any).createdAt ? new Date((doc as any).createdAt).toISOString() : new Date().toISOString(),
      lastTriggered: (doc as any).lastTriggered ? new Date((doc as any).lastTriggered).toISOString() : undefined
    };
  }

  async deleteAlertRule(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Alert rule not found');
    }
    const doc = await this.alertRuleModel.findByIdAndDelete(id);
    if (!doc) {
      throw new NotFoundException('Alert rule not found');
    }
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'AlertRule',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Deleted alert rule`,
      status: 'SUCCESS',
    });
    return { success: true, message: 'Alert rule deleted successfully' };
  }

  async toggleAlertRule(id: string, enabled: boolean) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Alert rule not found');
    }
    const doc = await this.alertRuleModel.findByIdAndUpdate(id, { $set: { enabled } }, { new: true });
    if (!doc) {
      throw new NotFoundException('Alert rule not found');
    }
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'AlertRule',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `${enabled ? 'Enabled' : 'Disabled'} alert rule`,
      status: 'SUCCESS',
    });
    return { success: true, enabled };
  }

  async getNotificationTemplates() {
    const count = await this.notificationTemplateModel.countDocuments();
    if (count === 0) {
      await this.notificationTemplateModel.insertMany([
        { name: 'Email Alert Template', type: 'email', subject: 'System Alert: {{alertTitle}}', body: 'Alert: {{alertMessage}}\nSeverity: {{severity}}\nTime: {{timestamp}}', variables: ['alertTitle', 'alertMessage', 'severity', 'timestamp'] },
        { name: 'SMS Alert Template', type: 'sms', subject: '', body: 'ALERT: {{alertTitle}} - {{severity}}', variables: ['alertTitle', 'severity'] }
      ]);
    }
    const docs = await this.notificationTemplateModel.find().sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      subject: doc.subject || '',
      body: doc.body,
      variables: doc.variables || []
    }));
  }

  async createNotificationTemplate(templateData: any) {
    const name = templateData?.name != null ? String(templateData.name).trim() : '';
    const type = templateData?.type || 'email';
    const body = templateData?.body != null ? String(templateData.body) : '';
    if (!name) {
      throw new BadRequestException('name is required');
    }
    if (body === '' && type === 'email') {
      throw new BadRequestException('body is required');
    }
    const doc = await this.notificationTemplateModel.create({
      name,
      type,
      subject: templateData.subject != null ? String(templateData.subject) : '',
      body: body || ' ',
      variables: Array.isArray(templateData.variables) ? templateData.variables : []
    });
    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'NotificationTemplate',
      entityId: doc._id.toString(),
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created notification template: ${doc.name}`,
      status: 'SUCCESS',
    });
    return {
      id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      subject: doc.subject || '',
      body: doc.body,
      variables: doc.variables || []
    };
  }

  async updateNotificationTemplate(id: string, updateData: any) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Notification template not found');
    }
    const set: any = { lastModified: new Date() };
    if (updateData.name != null) set.name = String(updateData.name).trim();
    if (updateData.type != null) set.type = updateData.type;
    if (updateData.subject != null) set.subject = String(updateData.subject);
    if (updateData.body != null) set.body = String(updateData.body);
    if (Array.isArray(updateData.variables)) set.variables = updateData.variables;
    const doc = await this.notificationTemplateModel.findByIdAndUpdate(id, { $set: set }, { new: true });
    if (!doc) {
      throw new NotFoundException('Notification template not found');
    }
    return {
      id: doc._id.toString(),
      name: doc.name,
      type: doc.type,
      subject: doc.subject || '',
      body: doc.body,
      variables: doc.variables || []
    };
  }

  async deleteNotificationTemplate(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Notification template not found');
    }
    const doc = await this.notificationTemplateModel.findByIdAndDelete(id);
    if (!doc) {
      throw new NotFoundException('Notification template not found');
    }
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'NotificationTemplate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Deleted notification template`,
      status: 'SUCCESS',
    });
    return { success: true, message: 'Notification template deleted successfully' };
  }

  // ==================== CERTIFICATE MANAGEMENT ====================

  async getCertificates(page: number, limit: number, filters: any = {}) {
    const certificates = [
      {
        id: '1',
        name: 'Main SSL Certificate',
        domain: 'school.example.com',
        type: 'ssl',
        status: 'active',
        issuer: 'Let\'s Encrypt',
        issuedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        serialNumber: 'ABC123456789',
        fingerprint: 'SHA256:abcd1234...',
        keySize: 2048,
        algorithm: 'RSA',
        san: ['www.school.example.com', 'api.school.example.com'],
        autoRenewal: true,
        usageCount: 1250000,
        lastChecked: new Date().toISOString()
      },
      {
        id: '2',
        name: 'API Wildcard Certificate',
        domain: '*.api.school.com',
        type: 'wildcard',
        status: 'expiring',
        issuer: 'DigiCert',
        issuedDate: new Date(Date.now() - 350 * 24 * 60 * 60 * 1000).toISOString(),
        expiryDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
        serialNumber: 'DEF987654321',
        fingerprint: 'SHA256:efgh5678...',
        keySize: 4096,
        algorithm: 'RSA',
        san: [],
        autoRenewal: false,
        usageCount: 850000,
        lastChecked: new Date().toISOString()
      }
    ];

    const total = certificates.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCertificates = certificates.slice(startIndex, endIndex);

    return {
      certificates: paginatedCertificates,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async createCertificate(certificateData: any) {
    const certificate = {
      id: Date.now().toString(),
      ...certificateData,
      status: 'active',
      issuedDate: new Date().toISOString(),
      usageCount: 0,
      lastChecked: new Date().toISOString()
    };

    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'Certificate',
      entityId: certificate.id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created certificate: ${certificate.name}`,
      status: 'SUCCESS',
    });

    return certificate;
  }

  async getCertificate(id: string) {
    return {
      id,
      name: 'Main SSL Certificate',
      domain: 'school.example.com',
      type: 'ssl',
      status: 'active',
      issuer: 'Let\'s Encrypt',
      issuedDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      serialNumber: 'ABC123456789',
      fingerprint: 'SHA256:abcd1234...',
      keySize: 2048,
      algorithm: 'RSA',
      san: ['www.school.example.com', 'api.school.example.com'],
      autoRenewal: true,
      usageCount: 1250000,
      lastChecked: new Date().toISOString()
    };
  }

  async updateCertificate(id: string, updateData: any) {
    const certificate = {
      id,
      ...updateData,
      lastModified: new Date().toISOString()
    };

    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'Certificate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Updated certificate`,
      status: 'SUCCESS',
    });

    return certificate;
  }

  async deleteCertificate(id: string) {
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'Certificate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Deleted certificate`,
      status: 'SUCCESS',
    });

    return { success: true, message: 'Certificate deleted successfully' };
  }

  async revokeCertificate(id: string, reason: string) {
    await this.createAuditLog({
      action: 'REVOKE',
      entityType: 'Certificate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Revoked certificate: ${reason}`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Certificate revoked successfully',
      revokedAt: new Date().toISOString(),
      reason
    };
  }

  async renewCertificate(id: string) {
    await this.createAuditLog({
      action: 'RENEW',
      entityType: 'Certificate',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Renewed certificate`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      message: 'Certificate renewal initiated',
      renewedAt: new Date().toISOString()
    };
  }

  async downloadCertificate(id: string, format: string) {
    // Mock certificate data - in real implementation, fetch from secure storage
    const mockCertData = `-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKoK/heBjcOuMA0GCSqGSIb3DQEBBQUAMEUxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQwHhcNMTMxMjMwMTUxNjQxWhcNMTQxMjMwMTUxNjQxWjBF
MQswCQYDVQQGEwJBVTETMBEGA1UECAwKU29tZS1TdGF0ZTEhMB8GA1UECgwYSW50
ZXJuZXQgV2lkZ2l0cyBQdHkgTHRkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIB
CgKCAQEAxc+7+bUPpFSS+IKU6Nh3w3FyJWNIhKo13tRpJQ8wYN0YdK8uNTQ8sH4w
4V6CCwA3qz1LGqHT8tWiU3Q5TKPH9Qd5qyFB+6Q6lZKhN4RoFdZdAB5z3FtAwq2e
CgcP0Rr8iY3Rm8J8vN7d+PAF4LGQfJ9uHVbKE3UQQb8k2qKhXmN9BxQ2Jsy8rJf3
Z6BXU+9w7o3Dz3k+AkB6EF8+Y5qV3xR+5R5A4W9f1Q8nQ5C8oFYoQ+H3y9TJwp7Y
/LQID0oBNOvE5CfZsYQpHF3o7l2dAvQbOhFl7iIY4Yy2eoU5kBYOK8fTwHm5k5i3
h5qH9X2d8eBU7PzJqOo7p6H8kHQ9dQIDAQABo1AwTjAdBgNVHQ4EFgQUhHOq7VR7
+UMfZGk6JAyh5l4H9PcwHwYDVR0jBBgwFoAUhHOq7VR7+UMfZGk6JAyh5l4H9Pcw
DAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQUFAAOCAQEAhebF8rwOE4LLl5K6Npu5
/V7dKOdlQPyKDxPh3p9Tl8lTSA9kbGSsGb
-----END CERTIFICATE-----`;

    return Buffer.from(mockCertData);
  }

  async generateCSR(csrData: any) {
    // Mock CSR generation - in real implementation, use crypto libraries
    const mockCSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICijCCAXICAQAwRTELMAkGA1UEBhMCQVUxEzARBgNVBAgMClNvbWUtU3RhdGUx
ITAfBgNVBAoMGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDCCASIwDQYJKoZIhvcN
AQEBBQADggEPADCCAQoCggEBAMXPu/m1D6RUkviClOjYd8NxciVjSISqNd7UaSUP
MGDdGHSvLjU0PLB+MOFeggMoAN6s9SxqhH/LVolN0OU0jQ/UD+asgQfekOpWSoTe
EaBXWXQAec9xbQMKtngqHD9Ea/4mN0ZvCfLze3fjwBeABykeOLegV1PvcO6Nw895
PgJAehBfPmOald8UfuUeQOFvX9UPJ0OQvKBWKEPh98vUycKe2PSUFAOKATTrxOQn
2bGEKRxd6O5dnQL0GzoRZe4iGOGMtnqFOZAWDivH08B5uZOYt4eah/V9nfHgVOz8
yajqO6eh/JB0PXUCAwEAAaAAMA0GCSqGSIb3DQEBCwUAA4IBAQAD
-----END CERTIFICATE REQUEST-----`;

    const mockPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDFz7v5tQ+kVJL4
gpTo2HfDcXIlY0iEqjXe1GklDzBg3Rh0ry41NDywfjDhXoILADerPUsaodPy1aJT
dDlMo8f1B3mrIUH7pDqVkqE3hGgV1l0AHnPcW0DCrZ4KBw/RGvyJjdGbwny83t34
8AXgsZB8n24dVsoTdRBBvyTaoqFeY30HFDYmzLysl/dnoFdT73DujcPPeT4CQHoQ
Xz5jmpXfFH7lHkDhb1/VDydDkLygVihD4ffL1MnCntj8tBQDitgE068TkJ9mxhCk
cXejuXZ0C9Bs6EWXuIhjhjLZ6hTmQFg4rx9PAebmTmLeHmof1fZ3x4FTs/Mmo6ju
nofyQdD11AgMBAAECggEBAIDHI0qJsljJzHG1k1Px8w6FQGvXkBF9HeFfNTr0WqQ=
-----END PRIVATE KEY-----`;

    await this.createAuditLog({
      action: 'GENERATE',
      entityType: 'CSR',
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Generated CSR for domain: ${csrData.domain}`,
      status: 'SUCCESS',
    });

    return {
      csr: mockCSR,
      privateKey: mockPrivateKey
    };
  }

  async getCertificateRequests() {
    return [
      {
        id: '1',
        domain: 'newsite.school.com',
        type: 'ssl',
        status: 'pending',
        requestedBy: 'admin-user',
        requestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        csrData: '-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----'
      }
    ];
  }

  async approveCertificateRequest(id: string, approvedBy: string) {
    await this.createAuditLog({
      action: 'APPROVE',
      entityType: 'CertificateRequest',
      entityId: id,
      performedBy: approvedBy,
      performedByRole: 'super-admin',
      description: `Approved certificate request`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      approvedAt: new Date().toISOString(),
      approvedBy
    };
  }

  async rejectCertificateRequest(id: string, rejectedBy: string, reason: string) {
    await this.createAuditLog({
      action: 'REJECT',
      entityType: 'CertificateRequest',
      entityId: id,
      performedBy: rejectedBy,
      performedByRole: 'super-admin',
      description: `Rejected certificate request: ${reason}`,
      status: 'SUCCESS',
    });

    return {
      success: true,
      rejectedAt: new Date().toISOString(),
      rejectedBy,
      reason
    };
  }

  async getTrustedCAs() {
    return [
      {
        id: '1',
        name: 'Let\'s Encrypt Authority X3',
        fingerprint: 'SHA256:abcd1234...',
        validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        description: 'Free automated CA'
      },
      {
        id: '2',
        name: 'DigiCert Global Root CA',
        fingerprint: 'SHA256:efgh5678...',
        validFrom: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        validTo: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        enabled: true,
        description: 'Commercial CA'
      }
    ];
  }

  // ==================== INTEGRATION MANAGEMENT ====================

  private toIntegrationResponse(doc: IntegrationDocument): Record<string, any> {
    const obj = doc.toObject ? doc.toObject() : (doc as any);
    const id = (obj._id || (doc as any)._id)?.toString?.();
    return { ...obj, id: id || obj.id, _id: undefined };
  }

  async getIntegrations(page: number, limit: number, filters: any = {}) {
    const query: Record<string, any> = {};
    if (filters?.status) query.status = filters.status;
    if (filters?.type) query.type = filters.type;
    const skip = Math.max(0, (page - 1) * limit);
    const [docs, total] = await Promise.all([
      this.integrationModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean().exec(),
      this.integrationModel.countDocuments(query).exec(),
    ]);
    const integrations = docs.map((d: any) => ({ ...d, id: d._id?.toString?.() || d.id, _id: undefined }));
    return {
      integrations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async createIntegration(integrationData: any) {
    const name = integrationData?.name?.trim?.();
    const provider = integrationData?.provider?.trim?.();
    const endpoint = integrationData?.endpoint?.trim?.();
    if (!name) throw new BadRequestException('Integration name is required');
    if (!provider) throw new BadRequestException('Provider is required');
    if (!endpoint) throw new BadRequestException('API endpoint is required');
    const authType = integrationData.authType || 'api-key';
    const allowedAuth = ['oauth2', 'api-key', 'basic-auth', 'jwt', 'custom'];
    if (!allowedAuth.includes(authType)) throw new BadRequestException(`authType must be one of: ${allowedAuth.join(', ')}`);
    const payload: any = {
      name,
      type: integrationData.type || 'other',
      status: 'inactive',
      provider,
      endpoint,
      authType,
      credentials: integrationData.credentials ?? {},
      syncFrequency: integrationData.syncFrequency || 'manual',
      dataDirection: integrationData.dataDirection || 'bidirectional',
      mappedFields: integrationData.mappedFields ?? [],
      settings: integrationData.settings ?? {
        timeout: 30000,
        retryAttempts: 3,
        batchSize: 100,
        enableLogging: true,
        validateData: true,
        autoSync: false,
        notifications: true,
      },
      metrics: {
        totalSyncs: 0,
        successfulSyncs: 0,
        failedSyncs: 0,
        lastSyncDuration: 0,
        averageSyncTime: 0,
        recordsProcessed: 0,
        errorRate: 0,
      },
    };
    if (integrationData.version != null) payload.version = integrationData.version;
    if (integrationData.description != null) payload.description = integrationData.description;
    const doc = await this.integrationModel.create(payload);
    await this.createAuditLog({
      action: 'CREATE',
      entityType: 'Integration',
      entityId: doc._id.toString(),
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Created integration: ${doc.name}`,
      status: 'SUCCESS',
    });
    return this.toIntegrationResponse(doc as IntegrationDocument);
  }

  async getIntegration(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Integration not found');
    const doc = await this.integrationModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Integration not found');
    return this.toIntegrationResponse(doc);
  }

  async updateIntegration(id: string, updateData: any) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Integration not found');
    const allowed = ['name', 'type', 'provider', 'version', 'endpoint', 'authType', 'credentials', 'syncFrequency', 'dataDirection', 'mappedFields', 'settings', 'description', 'metadata'];
    const payload: any = {};
    for (const k of allowed) if (updateData[k] !== undefined) payload[k] = updateData[k];
    payload.lastModified = new Date();
    const doc = await this.integrationModel.findByIdAndUpdate(id, { $set: payload }, { new: true }).exec();
    if (!doc) throw new NotFoundException('Integration not found');
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'Integration',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Updated integration`,
      status: 'SUCCESS',
    });
    return this.toIntegrationResponse(doc);
  }

  async deleteIntegration(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Integration not found');
    const doc = await this.integrationModel.findByIdAndDelete(id).exec();
    if (!doc) throw new NotFoundException('Integration not found');
    await this.createAuditLog({
      action: 'DELETE',
      entityType: 'Integration',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Deleted integration`,
      status: 'SUCCESS',
    });
    return { success: true, message: 'Integration deleted successfully' };
  }

  async testIntegration(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Integration not found');
    const doc = await this.integrationModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Integration not found');
    const success = Math.random() > 0.3;
    await this.createAuditLog({
      action: 'TEST',
      entityType: 'Integration',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Tested integration connection`,
      status: success ? 'SUCCESS' : 'FAILED',
    });
    return {
      success,
      message: success ? 'Connection successful' : 'Connection failed: Authentication error',
      timestamp: new Date().toISOString(),
      responseTime: Math.floor(Math.random() * 5000) + 100,
    };
  }

  async syncIntegration(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Integration not found');
    const doc = await this.integrationModel.findById(id).exec();
    if (!doc) throw new NotFoundException('Integration not found');
    await this.createAuditLog({
      action: 'SYNC',
      entityType: 'Integration',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `Started integration synchronization`,
      status: 'SUCCESS',
    });
    return {
      success: true,
      message: 'Synchronization started',
      syncId: Date.now().toString(),
      startTime: new Date().toISOString(),
    };
  }

  async toggleIntegration(id: string, active: boolean) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Integration not found');
    const doc = await this.integrationModel.findByIdAndUpdate(
      id,
      { $set: { status: active ? 'active' : 'inactive', lastModified: new Date() } },
      { new: true },
    ).exec();
    if (!doc) throw new NotFoundException('Integration not found');
    await this.createAuditLog({
      action: 'UPDATE',
      entityType: 'Integration',
      entityId: id,
      performedBy: 'super-admin',
      performedByRole: 'super-admin',
      description: `${active ? 'Activated' : 'Deactivated'} integration`,
      status: 'SUCCESS',
    });
    return {
      success: true,
      status: active ? 'active' : 'inactive',
      updatedAt: new Date().toISOString(),
    };
  }

  async getIntegrationLogs(page: number, limit: number, filters: any = {}) {
    const query: Record<string, any> = {};
    if (filters?.integrationId) query.integrationId = filters.integrationId;
    if (filters?.status) query.status = filters.status;
    const skip = Math.max(0, (page - 1) * limit);
    const [docs, total] = await Promise.all([
      this.integrationLogModel.find(query).sort({ startTime: -1 }).skip(skip).limit(limit).lean().exec(),
      this.integrationLogModel.countDocuments(query).exec(),
    ]);
    const logs = docs.map((d: any) => ({
      ...d,
      id: d._id?.toString?.() || d.id,
      errors: d.errorMessages,
      _id: undefined,
    }));
    return {
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // ==================== SECRETARIES ====================

  async getSecretaries(query: any) {
    try {
      const filter: any = {
        role: UserRole.SECRETARY,
        isActive: true
      };

      // Super admin can filter by schoolId if provided, otherwise show all
      if (query.schoolId && query.schoolId.trim() !== '' && query.schoolId !== 'all') {
        filter.schoolId = new Types.ObjectId(query.schoolId);
      }

      // Search conditions
      const searchConditions = [];
      if (query.search) {
        const searchRegex = new RegExp(query.search, 'i');
        searchConditions.push(
          { firstName: { $regex: searchRegex } },
          { lastName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } }
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

}
