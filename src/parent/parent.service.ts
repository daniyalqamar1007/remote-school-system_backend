import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Parent, ParentDocument } from './schema/parent.schema';
import { CreateParentDto } from './dto/create-parent.dto';
import { Student } from '../student/schema/student.schema';
import { ParentLoginDto } from './dto/parent-login.dto';
import * as bcrypt from 'bcrypt';

// Import unified auth schemas
import { User, UserDocument } from '../auth/schemas/user.schema';
import { ParentProfile, ParentProfileDocument } from '../auth/schemas/parent-profile.schema';
import { StudentProfile, StudentProfileDocument } from '../auth/schemas/student-profile.schema';
import { Alert, AlertDocument } from '../alert/schema/alert.schema';

@Injectable()
export class ParentService {
  constructor(
    @InjectModel(Parent.name) private parentModel: Model<ParentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(ParentProfile.name) private parentProfileModel: Model<ParentProfileDocument>,
    @InjectModel(StudentProfile.name) private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
  ) {}

  async create(createParentDto: CreateParentDto): Promise<Parent> {
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(createParentDto.password, salt);

    const createdParent = new this.parentModel({
      ...createParentDto,
      password: hashedPassword,
    });
    return createdParent.save();
  }

  async getChildrenFull(parentId: string, schoolId?: string): Promise<any[]> {
    console.log('🔍 getChildrenFull called with parentId:', parentId, 'schoolId:', schoolId);
    
    try {
      // First try the unified auth system
      const parentProfile = await this.parentProfileModel.findOne({ userId: parentId }).exec();
      
      if (parentProfile && parentProfile.children && parentProfile.children.length > 0) {
        console.log('✅ Found parent profile with children:', parentProfile.children.length);
        
        // Get student profile IDs from the children array
        const studentProfileIds = parentProfile.children.map((child: any) => child.studentId);
        
        // Get student profiles
        const studentProfiles = await this.studentProfileModel.find({
          _id: { $in: studentProfileIds }
        }).exec();
        
        console.log('✅ Found student profiles:', studentProfiles.length);
        
        // Transform to match expected format
        let children = studentProfiles.map(profile => ({
          _id: profile._id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          studentId: profile.studentId,
          email: profile.userId ? `${profile.firstName.toLowerCase()}.${profile.lastName.toLowerCase()}@defaultschool.edu` : 'N/A',
          phone: profile.phone || 'N/A',
          dob: profile.dateOfBirth,
          address: profile.address ? `${profile.address.street}, ${profile.address.city}, ${profile.address.state} ${profile.address.zipCode}` : 'N/A',
          class: profile.gradeLevel,
          section: profile.section,
          enrollDate: profile.admissionDate,
          expectedGraduation: new Date('2026-06-15'), // Default since not in schema
          emergencyContact: profile.emergencyContact?.phone || 'N/A',
          profilePhoto: 'N/A',
          parents: [parentId]
        }));
        
        console.log('✅ Transformed children:', children);
        return children;
      }
      
      // Fallback: Get children from User model using parentIds array
      console.log('⚠️ No parent profile found, trying to get children from User model...');
      const parentDoc = await this.parentModel.findById(parentId).lean();
      if (!parentDoc || !parentDoc.userId) return [];

      // Build query
      const query: any = {
        role: 'STUDENT',
        isActive: true,
        status: 'ACTIVE',
        parentIds: parentDoc.userId
      };

      // If schoolId is provided, filter by school to prevent cross-school access
      if (schoolId) {
        query.schoolId = new Types.ObjectId(schoolId);
      }

      // Find all STUDENT role users where this parent's userId is in their parentIds array
      // Only get active, non-deleted students
      const children = await this.userModel.find(query).lean();

      if (!children || children.length === 0) return [];

      // Remove duplicates based on _id
      const uniqueChildrenMap = new Map();
      children.forEach((student: any) => {
        if (!uniqueChildrenMap.has(student._id.toString())) {
          uniqueChildrenMap.set(student._id.toString(), student);
        }
      });
      const uniqueChildren = Array.from(uniqueChildrenMap.values());

      // Map to consistent format
      const childrenFormatted = uniqueChildren.map((student: any) => ({
        _id: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        studentId: student.studentId,
        email: student.email || 'N/A',
        phone: student.phone || 'N/A',
        dob: student.dob,
        address: typeof student.address === 'string' ? student.address : JSON.stringify(student.address || {}),
        class: student.class,
        section: student.section,
        enrollDate: student.enrollDate,
        expectedGraduation: student.expectedGraduation,
        emergencyContact: student.emergencyContact?.phone || 'N/A',
        profilePhoto: student.profilePicture || 'N/A',
        parents: [parentDoc.userId]
      }));
      return childrenFormatted;
      
    } catch (error) {
      console.error('❌ Error in getChildrenFull:', error);
      return [];
    }
  }

  async findAll(): Promise<Parent[]> {
    return this.parentModel.find().exec();
  }

  async findOne(id: string): Promise<Parent> {
    return this.parentModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<any | null> {
    if (!email || typeof email !== 'string') {
      return null;
    }
    
    // Normalize email: lowercase and trim (emails are stored in lowercase in the database)
    // Note: URL decoding is handled in the controller
    const normalizedEmail = email.toLowerCase().trim();
    
    // Search for parent by email (exact match since emails are normalized)
    const user = await this.userModel.findOne({ 
      email: normalizedEmail,
      role: 'PARENT' 
    }).lean();
    
    if (!user) {
      return null;
    }
    
    // Find parent profile to get additional info
    const parentProfile = await this.parentModel.findOne({
      userId: user._id
    }).lean();
    
    // Return complete parent object with ID
    // Note: Parent schema doesn't have address field, so we only use user's address
    // Use type assertion to access fields that might not be in TypeScript types when using .lean()
    const userWithAny = user as any;
    const parentProfileWithAny = parentProfile as any;
    
    return {
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      address: userWithAny?.address || undefined,
      schoolId: user.schoolId,
      belongToSchools: parentProfileWithAny?.belongToSchools || []
    };
  }

  async validateParent(loginDto: ParentLoginDto): Promise<Parent | null> {
    const user = await this.findByEmail(loginDto.email);
    if (!user) return null;
    const passwordValid = await bcrypt.compare(loginDto.password, (user as any).password);
    return passwordValid ? (user as unknown as Parent) : null;
  }

  async getChildrenIds(parentId: string, schoolId?: string): Promise<string[]> {
    const parent = await this.parentModel.findById(parentId).lean();
    if (!parent || !parent.userId) return [];

    // Find all STUDENT role users where this parent's userId is in their parentIds array
    const query: any = {
      role: 'STUDENT',
      isActive: true,
      parentIds: parent.userId
    };

    // If schoolId is provided, filter by school to prevent cross-school access
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const children = await this.userModel.find(query).select('_id').lean();

    return children.map((child: any) => child._id.toString()) || [];
  }

  async resetPassword(parentId: string, newPassword: string) {
    const parent = await this.parentModel.findById(parentId).lean();
    if (!parent) throw new NotFoundException("Parent not found");
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.userModel.updateOne({ _id: parent.userId }, { $set: { password: hashed } });
    return { status: 200, msg: "Password reset successfully." };
  }

  /**
   * Get alerts for a parent with pagination, search, and filtering
   */
  async getAlerts(
    parentUserId: string,
    options: { page?: number; limit?: number; search?: string; studentId?: string }
  ): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
    const { page = 1, limit = 20, search, studentId } = options;
    const skip = (page - 1) * limit;

    // Build filter
    const filter: any = {
      parentId: new Types.ObjectId(parentUserId)
    };

    // Filter by student if provided
    if (studentId) {
      filter.studentId = new Types.ObjectId(studentId);
    }

    // Search filter
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Get total count
    const total = await this.alertModel.countDocuments(filter);

    // Get alerts sorted by createdAt (newest first)
    const alerts = await this.alertModel
      .find(filter)
      .populate('studentId', 'firstName lastName')
      .populate('gradeId', 'score totalMarks markingType courseId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return {
      data: alerts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get unread alert count for a parent
   */
  async getUnreadAlertCount(parentUserId: string, studentId?: string): Promise<number> {
    const filter: any = {
      parentId: new Types.ObjectId(parentUserId),
      read: false
    };

    if (studentId) {
      filter.studentId = new Types.ObjectId(studentId);
    }

    return await this.alertModel.countDocuments(filter);
  }

  /**
   * Mark alerts as read
   */
  async markAlertsAsRead(parentUserId: string, alertIds?: string[], studentId?: string): Promise<{ updated: number }> {
    const filter: any = {
      parentId: new Types.ObjectId(parentUserId),
      read: false
    };

    // If specific alert IDs provided, mark only those
    if (alertIds && alertIds.length > 0) {
      filter._id = { $in: alertIds.map(id => new Types.ObjectId(id)) };
    }

    // If studentId provided, mark only alerts for that student
    if (studentId) {
      filter.studentId = new Types.ObjectId(studentId);
    }

    const result = await this.alertModel.updateMany(filter, { $set: { read: true } });

    return { updated: result.modifiedCount };
  }

  /**
   * Mark a single alert as read
   */
  async markAlertAsRead(alertId: string, parentUserId: string): Promise<AlertDocument> {
    const alert = await this.alertModel.findOne({
      _id: new Types.ObjectId(alertId),
      parentId: new Types.ObjectId(parentUserId)
    });

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    alert.read = true;
    return await alert.save();
  }
}
