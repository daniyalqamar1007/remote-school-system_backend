import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole, UserStatus } from './schemas/user.schema';
import { School, SchoolDocument } from './schemas/school.schema';
import { StudentProfile, StudentProfileDocument } from './schemas/student-profile.schema';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { ParentProfile, ParentProfileDocument } from './schemas/parent-profile.schema';
import { Parent, ParentDocument } from '../parent/schema/parent.schema';
import { EmailService } from '../email/email.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  schoolId?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    roles: UserRole[];
    roleIds?: Record<string, string>;
    schoolId?: string;
    mustChangePassword?: boolean;
    profile?: any;
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    @InjectModel(StudentProfile.name) private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(TeacherProfile.name) private teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(ParentProfile.name) private parentProfileModel: Model<ParentProfileDocument>,
    @InjectModel(Parent.name) private parentModel: Model<ParentDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) { }

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.userModel.findOne({
        email: email.toLowerCase(),
        $or: [
          { status: UserStatus.ACTIVE },
          { status: 'ACTIVE' }, // Handle string version
          { status: { $exists: false } } // Handle missing status field
        ]
      }).exec();

      console.log('🔑 User found:', user);

      if (!user) {
        return null;
      }

      // Check if account is locked (handle both schema method and property)
      const isLocked = typeof user.isLocked === 'boolean' ? user.isLocked :
        (user.lockoutUntil && new Date(user.lockoutUntil) > new Date());

      if (isLocked) {
        throw new UnauthorizedException('Account is locked due to too many failed login attempts');
      }

      // Compare password - handle both schema method and direct bcrypt comparison
      let isPasswordValid = false;

      console.log('🔑 Is locked:', isLocked);

      try {
        if (typeof user.comparePassword === 'function') {
          isPasswordValid = await user.comparePassword(password);
        } else {
          // Fallback to direct bcrypt comparison for migrated users
          isPasswordValid = await bcrypt.compare(password, user.password);
        }
      } catch (error) {
        // If comparePassword fails, fallback to bcrypt
        isPasswordValid = await bcrypt.compare(password, user.password);
      }

      console.log('🔑 Is password valid:', isPasswordValid);

      if (!isPasswordValid) {
        // Increment failed login attempts if method exists
        if (typeof user.incLoginAttempts === 'function') {
          await user.incLoginAttempts();
        }
        console.log('🔑 User not found:', null);
        return null;
      }

      // Reset login attempts if method exists
      if (typeof user.resetLoginAttempts === 'function') {
        await user.resetLoginAttempts();
      }

      // Check if MFA is enabled for this user
      if (user.mfaEnabled) {
        // Return user with MFA flag to indicate MFA verification is needed
        console.log('🔑 User requires MFA');
        return { ...user.toObject(), requiresMFA: true };
      }

      return user;
    } catch (error) {
      console.log('🔑 Error in validateUser:', error);
      if (error instanceof UnauthorizedException) throw error;
      return null;
    }
  }

  async login(user: any): Promise<any> {
    // If user requires MFA, return a special response
    if (user.requiresMFA) {
      console.log('🔑 User requires MFA');
      // Generate a temporary MFA code (6 digits)
      const mfaCode = Math.floor(100000 + Math.random() * 900000).toString();

      console.log('🔑 Generated MFA code for user:', user.email, 'Code:', mfaCode);

      // Store the MFA code temporarily (expires in 10 minutes)
      const updateResult = await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            mfaTempCode: mfaCode,
            mfaTempCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
          }
        }
      );

      console.log('📝 MFA code stored in database:', updateResult.modifiedCount > 0 ? 'Success' : 'Failed');

      // Get school name for email template
      let schoolName = 'School Portal';
      if (user.schoolId) {
        const school = await this.schoolModel.findById(user.schoolId).lean();
        schoolName = school?.name || 'School Portal';
      }

      // Send MFA code via email
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
      await this.emailService.sendMFACode(user.email, mfaCode, userName, schoolName);

      return {
        success: true,
        statusCode: 200,
        message: 'MFA code sent to email',
        data: {
          requiresMFA: true,
        },
      } as any;
    }

    console.log('🔑 User does not require MFA or OTP - generating tokens directly');

    // Update last login
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    // Create JWT payload
    const payload: JwtPayload = {
      email: user.email,
      sub: user._id.toString(),
      role: user.role,
      schoolId: user.schoolId?.toString(),
    };

    // Create tokens
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Store refresh token in database
    await this.userModel.updateOne(
      { _id: user._id },
      { $push: { refreshTokens: refreshToken } }
    );

    const profile = await this.getUserProfile(user._id.toString(), user.role);

    const { roles, roleIds } = await this.buildRolesFromSameEmail(user.email);

    return {
      success: true,
      statusCode: 200,
      message: 'Login successful',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          roles,
          roleIds: Object.keys(roleIds).length ? roleIds : undefined,
          schoolId: user.schoolId?.toString(),
          mustChangePassword: user.mustChangePassword || false,
          profile,
        },
      },
    } as any;
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      // Remove specific refresh token (logout from single device)
      await this.userModel.updateOne(
        { _id: userId },
        { $pull: { refreshTokens: refreshToken } }
      );
    } else {
      // Remove all refresh tokens (logout from all devices)
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { refreshTokens: [] } }
      );
    }
  }

  async verifyMFAByCode(mfaCode: string): Promise<LoginResponse> {
    console.log('🔍 Verifying MFA code:', mfaCode);

    const user = await this.userModel.findOne({
      mfaTempCode: mfaCode,
      mfaTempCodeExpiry: { $gt: new Date() }
    }).exec();

    console.log('📝 User found with MFA code:', user ? {
      id: user._id,
      email: user.email,
      mfaTempCode: user.mfaTempCode,
      expiry: user.mfaTempCodeExpiry
    } : 'No user found');

    if (!user) {
      // Let's also check if there's a user with this code but expired
      const expiredUser = await this.userModel.findOne({
        mfaTempCode: mfaCode
      }).exec();

      if (expiredUser) {
        console.log('❌ Found expired MFA code for user:', expiredUser.email);
        throw new UnauthorizedException('MFA code has expired. Please request a new one.');
      }

      throw new UnauthorizedException('Invalid or expired MFA code');
    }

    // Clear the temporary MFA code
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $unset: { mfaTempCode: '', mfaTempCodeExpiry: '' },
        $set: { lastLogin: new Date() }
      }
    );

    console.log('✅ MFA verification successful for user:', user.email);

    const payload: JwtPayload = {
      email: user.email,
      sub: user._id.toString(),
      role: user.role,
      schoolId: user.schoolId?.toString(),
    };

    // Create tokens
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Store refresh token in database
    await this.userModel.updateOne(
      { _id: user._id },
      { $push: { refreshTokens: refreshToken } }
    );

    // Get user profile based on role
    const profile = await this.getUserProfile(user._id.toString(), user.role);

    const roles = this.buildRolesArray(user);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        roles: roles,
        schoolId: user.schoolId?.toString(),
        isActive: user.isActive,
        mfaEnabled: user.mfaEnabled,
        profile: profile,
        ...((user as any).firstName && { firstName: (user as any).firstName }),
        ...((user as any).lastName && { lastName: (user as any).lastName }),
        ...((user as any).profilePhoto && { profilePhoto: (user as any).profilePhoto })
      } as any
    };
  }

  async verifyMFA(email: string, mfaCode: string): Promise<LoginResponse> {
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
      mfaTempCode: mfaCode,
      mfaTempCodeExpiry: { $gt: new Date() }
    }).exec();

    if (!user) {
      throw new UnauthorizedException('Invalid or expired MFA code');
    }

    // Clear the temporary MFA code
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $unset: { mfaTempCode: '', mfaTempCodeExpiry: '' },
        $set: { lastLogin: new Date() }
      }
    );

    const payload: JwtPayload = {
      email: user.email,
      sub: user._id.toString(),
      role: user.role,
      schoolId: user.schoolId?.toString(),
    };

    // Create tokens
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Store refresh token in database
    await this.userModel.updateOne(
      { _id: user._id },
      { $push: { refreshTokens: refreshToken } }
    );

    const profile = await this.getUserProfile(user._id.toString(), user.role);

    const { roles, roleIds } = await this.buildRolesFromSameEmail(user.email);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        roles,
        roleIds: Object.keys(roleIds).length ? roleIds : undefined,
        schoolId: user.schoolId?.toString(),
        mustChangePassword: user.mustChangePassword || false,
        profile,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.userModel.findOne({
        _id: payload.sub,
        refreshTokens: refreshToken
      }).exec();

      if (!user) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Generate new tokens
      const newPayload: JwtPayload = {
        email: user.email,
        sub: user._id.toString(),
        role: user.role,
        schoolId: user.schoolId?.toString(),
      };

      const newAccessToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      // Replace old refresh token with new one
      await this.userModel.updateOne(
        { _id: user._id },
        {
          $pull: { refreshTokens: refreshToken },
          $push: { refreshTokens: newRefreshToken },
        }
      );

      const profile = await this.getUserProfile(user._id.toString(), user.role);

      const { roles, roleIds } = await this.buildRolesFromSameEmail(user.email);

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          roles,
          roleIds: Object.keys(roleIds).length ? roleIds : undefined,
          schoolId: user.schoolId?.toString(),
          profile,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getUserProfile(userId: string, role: UserRole): Promise<any> {
    try {
      // Use unified User schema instead of separate profile models
      const user = await this.userModel.findById(userId).exec();

      if (!user) {
        return null;
      }

      // Return user data formatted for the specific role
      switch (role) {
        case UserRole.STUDENT:
          return {
            // Student-specific fields from User schema
            studentId: user.studentId,
            class: user.class,
            section: user.section,
            dob: user.dob,
            dateOfBirth: user.dob, // Alias for compatibility
            enrollDate: user.enrollDate,
            enrollmentDate: user.enrollDate, // Alias for compatibility
            admissionDate: user.enrollDate, // Alias for compatibility
            expectedGraduation: user.expectedGraduation,
            emergencyContact: user.emergencyContact,
            address: user.address,
            profilePhoto: user.profilePicture,
            profilePicture: user.profilePicture, // Alias for compatibility
            phone: user.phone,
            phoneNumber: user.phone, // Alias for compatibility
            parentIds: user.parentIds,
            // Additional student fields
            bloodGroup: user.bloodGroup,
            medicalConditions: user.medicalConditions,
            allergies: user.allergies,
            nationality: user.nationality,
            religion: user.religion,
            transportMode: user.transportMode,
            busRoute: user.busRoute,
            // Common fields
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            isActive: user.isActive,
          };
        case UserRole.TEACHER:
          return {
            // Teacher-specific fields from User schema
            subjects: user.subject, // Note: field is 'subject' not 'subjects'
            subject: user.subject,
            qualifications: user.qualifications,
            experience: user.experienceYears, // Note: field is 'experienceYears' not 'experience'
            experienceYears: user.experienceYears,
            specialization: user.specialization,
            department: user.department,
            phone: user.phone,
            address: user.address,
            profilePhoto: user.profilePicture,
            // Common fields
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            isActive: user.isActive,
          };
        case UserRole.PARENT:
          return {
            // Parent-specific fields from User schema
            children: user.children,
            phone: user.phone,
            address: user.address,
            occupation: user.occupation,
            profilePhoto: user.profilePicture,
            // Common fields
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            isActive: user.isActive,
          };
        default:
          return {
            // Basic user profile for other roles
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
            schoolId: user.schoolId,
            isActive: user.isActive,
            phone: user.phone,
            address: user.address,
            profilePhoto: user.profilePicture,
          };
      }
    } catch (error) {
      console.error('Error in getUserProfile:', error);
      return null;
    }
  }

  async getParentChildren(parentUserId: string): Promise<any[]> {
    try {
      console.log('🔍 getParentChildren called for parentUserId:', parentUserId);

      // Get parent user from unified User schema
      const parentUser = await this.userModel.findById(parentUserId).exec();

      if (!parentUser || parentUser.role !== 'PARENT') {
        console.log('❌ Parent user not found or invalid role:', parentUser?.role);
        return [];
      }

      // Get parent profile to get relationship information and children
      let parentProfile = null;
      if (parentUser.parentProfileId) {
        parentProfile = await this.parentProfileModel.findById(parentUser.parentProfileId).exec();
      } else {
        // Try to find parent profile by userId as fallback
        parentProfile = await this.parentProfileModel.findOne({ userId: parentUserId }).exec();
      }

      let childrenIds: string[] = [];
      if (parentUser.children && parentUser.children.length > 0) {
        childrenIds = parentUser.children.map((id: any) => id.toString());
        console.log('🔍 Parent children IDs from User schema:', childrenIds);
      }
      if (parentProfile && parentProfile.children && Array.isArray(parentProfile.children)) {
        const fromProfile = parentProfile.children
          .map((child: any) => (child.studentId ? child.studentId.toString() : null))
          .filter((id: string | null) => id !== null) as string[];
        fromProfile.forEach(id => {
          if (!childrenIds.includes(id)) childrenIds.push(id);
        });
        if (fromProfile.length) console.log('🔍 Parent children IDs from ParentProfile:', fromProfile.length);
      }
      const parentObjId = typeof parentUserId === 'string' ? new Types.ObjectId(parentUserId) : parentUserId;
      const studentsLinkedByParentIds = await this.userModel.find({
        role: 'STUDENT',
        isActive: true,
        status: UserStatus.ACTIVE,
        parentIds: parentObjId
      }).select('_id').lean();
      studentsLinkedByParentIds.forEach((s: any) => {
        const id = s._id.toString();
        if (!childrenIds.includes(id)) childrenIds.push(id);
      });
      if (studentsLinkedByParentIds.length) {
        console.log('🔍 Children from student parentIds (any school):', studentsLinkedByParentIds.length);
      }
      if (childrenIds.length === 0) {
        console.log('❌ Parent has no children in User schema, ParentProfile, or student parentIds');
        return [];
      }

      // Get student users from unified User schema - only active, non-deleted students
      const studentUsers = await this.userModel.find({
        _id: { $in: childrenIds },
        role: 'STUDENT',
        isActive: true,
        status: UserStatus.ACTIVE
      }).exec();

      console.log('🔍 Found student users:', studentUsers.length);

      // Remove duplicates based on _id (in case same student appears multiple times)
      const uniqueStudentMap = new Map();
      studentUsers.forEach(student => {
        if (!uniqueStudentMap.has(student._id.toString())) {
          uniqueStudentMap.set(student._id.toString(), student);
        }
      });
      const uniqueStudentUsers = Array.from(uniqueStudentMap.values());

      console.log('🔍 Unique student users after deduplication:', uniqueStudentUsers.length);

      // Transform to match expected format for frontend
      const children = uniqueStudentUsers.map(student => {
        // Handle address - keep as object if it's an object, otherwise string
        let addressData: any = 'N/A';
        if (student.address) {
          if (typeof student.address === 'string') {
            addressData = student.address;
          } else if (typeof student.address === 'object') {
            addressData = student.address;
          }
        }

        // Handle emergency contact - keep as object if it's an object, otherwise string
        let emergencyContactData: any = 'N/A';
        if (student.emergencyContact) {
          if (typeof student.emergencyContact === 'string') {
            emergencyContactData = student.emergencyContact;
          } else if (typeof student.emergencyContact === 'object') {
            emergencyContactData = student.emergencyContact;
          }
        }

        // Get relationship info from parent profile
        let relationship = null;
        let isPrimaryContact = null;
        let hasPickupPermission = null;

        if (parentProfile && parentProfile.children && Array.isArray(parentProfile.children)) {
          const childInfo = parentProfile.children.find(
            (child: any) => child.studentId && child.studentId.toString() === student._id.toString()
          );
          if (childInfo) {
            relationship = childInfo.relationship || null;
            isPrimaryContact = childInfo.isPrimaryContact !== undefined ? childInfo.isPrimaryContact : null;
            hasPickupPermission = childInfo.hasPickupPermission !== undefined ? childInfo.hasPickupPermission : null;
          }
        }

        return {
          _id: student._id,
          firstName: student.firstName,
          lastName: student.lastName,
          studentId: student.studentId,
          email: student.email,
          phone: student.phone || 'N/A',
          dob: student.dob ? student.dob.toISOString().split('T')[0] : 'N/A',
          address: addressData,
          class: student.class,
          section: student.section,
          enrollDate: student.enrollDate ? student.enrollDate.toISOString().split('T')[0] : 'N/A',
          expectedGraduation: typeof (student as any).expectedGraduation === 'string'
            ? (student as any).expectedGraduation
            : ((student as any).expectedGraduation ? (student as any).expectedGraduation.toISOString().split('T')[0] : 'N/A'),
          emergencyContact: emergencyContactData,
          profilePhoto: student.profilePicture || 'N/A',
          // Additional fields from User schema
          bloodGroup: student.bloodGroup || null,
          medicalConditions: student.medicalConditions || [],
          allergies: student.allergies || [],
          previousSchool: student.previousSchool || null,
          gender: student.gender || null,
          transportMode: student.transportMode || null,
          busRoute: student.busRoute || null,
          religion: student.religion || null,
          // Relationship information
          relationship: relationship,
          isPrimaryContact: isPrimaryContact,
          hasPickupPermission: hasPickupPermission,
          parents: [parentUserId]
        };
      });

      console.log('✅ Returning children data:', children.length, 'children');
      return children;
    } catch (error) {
      console.error('❌ Error in getParentChildren:', error);
      return [];
    }
  }

  async getParentProfileDocument(userId: string): Promise<ParentProfileDocument | null> {
    try {
      if (!userId) return null;
      return await this.parentProfileModel.findOne({ userId }).exec();
    } catch (error) {
      console.error('Error fetching parent profile document:', error);
      return null;
    }
  }

  async getParentDocument(userId: string): Promise<ParentDocument | null> {
    try {
      if (!userId) return null;
      return await this.parentModel.findOne({ userId }).lean();
    } catch (error) {
      console.error('Error fetching parent document:', error);
      return null;
    }
  }

  async findUserById(userId: string): Promise<UserDocument> {
    return await this.userModel.findById(userId).exec();
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { lastLoginAt: new Date() }
    );
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password
    let isCurrentPasswordValid = false;
    try {
      if (typeof user.comparePassword === 'function') {
        isCurrentPasswordValid = await user.comparePassword(currentPassword);
      } else {
        isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      }
    } catch (error) {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    }

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate new password strength
    if (newPassword.length < 6) {
      throw new UnauthorizedException('New password must be at least 6 characters long');
    }

    // Check if new password is the same as current password
    let isSamePassword = false;
    try {
      if (typeof user.comparePassword === 'function') {
        isSamePassword = await user.comparePassword(newPassword);
      } else {
        isSamePassword = await bcrypt.compare(newPassword, user.password);
      }
    } catch (error) {
      isSamePassword = await bcrypt.compare(newPassword, user.password);
    }

    if (isSamePassword) {
      throw new UnauthorizedException('New password cannot be the same as your current password');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear mustChangePassword flag - use $set to ensure proper update
    const updateResult = await this.userModel.updateOne(
      { _id: userId },
      {
        $set: {
          password: hashedNewPassword,
          mustChangePassword: false,
          passwordLastChanged: new Date()
        }
      }
    );

    // Verify the update was successful
    if (updateResult.modifiedCount === 0) {
      console.error(`❌ Failed to update password for user: ${user.email}`);
      throw new UnauthorizedException('Failed to update password');
    }

    // Double-check that mustChangePassword was set to false
    const updatedUser = await this.userModel.findById(userId).select('mustChangePassword email').lean().exec();
    if (updatedUser && updatedUser.mustChangePassword !== false) {
      console.error(`❌ mustChangePassword not properly set to false for user: ${user.email}, current value: ${updatedUser.mustChangePassword}`);
      // Force update again
      await this.userModel.updateOne(
        { _id: userId },
        { $set: { mustChangePassword: false } }
      );
    }

    console.log(`✅ Password changed successfully for user: ${user.email}, mustChangePassword set to: ${updatedUser?.mustChangePassword}`);
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).exec();

    if (!user) {
      // Don't reveal if user exists or not for security
      return { success: true, message: 'If an account exists with this email, a password reset link has been sent.' };
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1); // Token expires in 1 hour

    // Save reset token to database
    await this.userModel.updateOne(
      { _id: user._id },
      {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires
      }
    );

    // Send password reset email
    const firstName = user.firstName || 'User';
    await this.emailService.sendPasswordResetEmail(user.email, firstName, resetToken);

    return { success: true, message: 'Password reset link has been sent to your email.' };
  }

  async requestAdminReset(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).exec();

    if (!user) {
      // Don't reveal if user exists or not for security
      return { success: true, message: 'If an account exists with this email, a reset request has been sent to the administrator.' };
    }

    // Get user's school info if available
    let schoolName = 'the system';
    let schoolId = null;
    if (user.schoolId) {
      schoolId = user.schoolId;
      const school = await this.schoolModel.findById(user.schoolId).exec();
      if (school) {
        schoolName = school.name;
      }
    }

    // Find all super admins (all super admins should get the email)
    const superAdmins = await this.userModel.find({
      role: { $in: ['SUPER_ADMIN', 'SuperAdmin'] },
      isActive: true
    }).exec();

    // Find school-specific admin (if user has a school)
    const schoolAdmins = schoolId ? await this.userModel.find({
      role: { $in: ['ADMIN', 'Admin'] },
      schoolId: schoolId,
      isActive: true
    }).exec() : [];

    // Find school-specific secretary (if user has a school)
    const schoolSecretaries = schoolId ? await this.userModel.find({
      role: { $in: ['SECRETARY', 'Secretary'] },
      schoolId: schoolId,
      isActive: true
    }).exec() : [];

    // Combine all recipients (use Set to avoid duplicates)
    const allRecipients = new Set<string>();
    
    // Add all super admins
    superAdmins.forEach(admin => {
      if (admin.email) allRecipients.add(admin.email);
    });
    
    // Add school admins
    schoolAdmins.forEach(admin => {
      if (admin.email) allRecipients.add(admin.email);
    });
    
    // Add school secretaries
    schoolSecretaries.forEach(secretary => {
      if (secretary.email) allRecipients.add(secretary.email);
    });

    const adminEmails = Array.from(allRecipients);

    if (adminEmails.length === 0) {
      return { success: false, message: 'No administrators found. Please contact support.' };
    }

    // Send email to all recipients
    const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;

    try {
      await this.emailService.sendAdminPasswordResetRequest(
        adminEmails,
        user.email,
        userFullName,
        user.role,
        schoolName
      );
      
      console.log(`✅ Password reset request sent to ${adminEmails.length} recipient(s):`, {
        superAdmins: superAdmins.length,
        schoolAdmins: schoolAdmins.length,
        schoolSecretaries: schoolSecretaries.length,
        emails: adminEmails
      });
    } catch (error) {
      console.error('Error sending admin reset request:', error);
      return { success: false, message: 'Failed to send request to administrator. Please try again later.' };
    }

    return { success: true, message: 'Your password reset request has been sent to the administrator. You will be notified once your password has been reset.' };
  }

  async verifyResetToken(token: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    }).exec();

    if (!user) {
      return { success: false, message: 'Invalid or expired reset token' };
    }

    return { success: true, message: 'Token is valid' };
  }

  async resetPasswordWithToken(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() }
    }).exec();

    if (!user) {
      return { success: false, message: 'Invalid or expired reset token' };
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long' };
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password and clear reset token
    await this.userModel.updateOne(
      { _id: user._id },
      {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordLastChanged: new Date(),
        failedLoginAttempts: 0,
        accountLocked: false,
        mustChangePassword: false
      }
    );

    return { success: true, message: 'Password has been reset successfully' };
  }

  async resetPassword(email: string): Promise<void> {
    const user = await this.userModel.findOne({ email: email.toLowerCase() }).exec();

    if (!user) {
      // Don't reveal if user exists or not
      return;
    }

    // Here you would typically:
    // 1. Generate a password reset token
    // 2. Save it to the database with expiration
    // 3. Send email with reset link
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { isEmailVerified: true }
    );
  }

  async validateJwtPayload(payload: JwtPayload): Promise<UserDocument> {
    const user = await this.userModel.findOne({
      _id: payload.sub,
      email: payload.email,
      status: UserStatus.ACTIVE,
    }).exec();

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }

  async createUser(userData: {
    email: string;
    password: string;
    role: UserRole;
    schoolId?: string;
    createdBy: string;
  }): Promise<UserDocument> {
    try {
      const newUser = new this.userModel({
        email: userData.email.toLowerCase(),
        password: userData.password, // Will be hashed by pre-save middleware
        role: userData.role,
        schoolId: userData.schoolId,
        createdBy: userData.createdBy,
        status: UserStatus.PENDING, // Admin needs to activate
      });

      return await newUser.save();
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Email already exists');
      }
      throw error;
    }
  }

  async updateUserStatus(userId: string, status: UserStatus, updatedBy: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { status, updatedBy, updatedAt: new Date() }
    );
  }

  async resendMFACode(email: string): Promise<void> {
    try {
      const user = await this.userModel.findOne({
        email: email.toLowerCase(),
        mfaEnabled: true,
        $or: [
          { status: UserStatus.ACTIVE },
          { status: 'ACTIVE' },
        ]
      });

      if (!user) {
        throw new UnauthorizedException('User not found or MFA not enabled');
      }

      // Generate a new temporary MFA code (6 digits)
      const mfaCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Store the MFA code temporarily (expires in 10 minutes)
      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            mfaTempCode: mfaCode,
            mfaTempCodeExpiry: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
          }
        }
      );

      // Get school name for email template
      let schoolName = 'School Portal';
      if (user.schoolId) {
        const school = await this.schoolModel.findById(user.schoolId).lean();
        schoolName = school?.name || 'School Portal';
      }

      // Send new MFA code via email
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
      await this.emailService.sendMFACode(user.email, mfaCode, userName, schoolName);

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to resend MFA code');
    }
  }

  async verifyOTP(email: string, otpCode: string): Promise<LoginResponse> {
    console.log('🔍 Verifying OTP for email:', email, 'Code:', otpCode);

    // First, find user with matching email and OTP code that's not expired
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
      mfaTempCode: otpCode,
      mfaTempCodeExpiry: { $gt: new Date() }
    }).exec();

    console.log('📝 User found with OTP:', user ? {
      id: user._id,
      email: user.email,
      mfaTempCode: user.mfaTempCode,
      expiry: user.mfaTempCodeExpiry
    } : 'No user found');

    if (!user) {
      // Check if there's a user with this code but expired
      const expiredUser = await this.userModel.findOne({
        email: email.toLowerCase(),
        mfaTempCode: otpCode
      }).exec();

      if (expiredUser) {
        console.log('❌ Found expired OTP for user:', expiredUser.email);
        throw new UnauthorizedException('OTP has expired. Please request a new one.');
      }

      // Check if OTP was already used (code exists but no expiry means it was cleared)
      const userWithEmail = await this.userModel.findOne({
        email: email.toLowerCase()
      }).exec();

      if (userWithEmail && !userWithEmail.mfaTempCode) {
        console.log('❌ OTP already used for user:', userWithEmail.email);
        throw new UnauthorizedException('This OTP has already been used. Please request a new one.');
      }

      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Clear the temporary OTP code IMMEDIATELY to prevent reuse
    // Use findOneAndUpdate with atomic operation to prevent race conditions
    const updateResult = await this.userModel.findOneAndUpdate(
      { 
        _id: user._id,
        mfaTempCode: otpCode, // Ensure OTP still matches (prevent double use)
        mfaTempCodeExpiry: { $gt: new Date() } // Ensure still valid
      },
      {
        $unset: { mfaTempCode: '', mfaTempCodeExpiry: '' },
        $set: { lastLogin: new Date() }
      },
      { new: true }
    ).exec();

    // If updateResult is null, it means OTP was already used or expired between check and update
    if (!updateResult) {
      console.log('❌ OTP was already used or expired during verification');
      throw new UnauthorizedException('This OTP has already been used or expired. Please request a new one.');
    }

    console.log('✅ OTP verification successful for user:', user.email);

    const payload: JwtPayload = {
      email: user.email,
      sub: user._id.toString(),
      role: user.role,
      schoolId: user.schoolId?.toString(),
    };

    // Create tokens
    const accessToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    // Store refresh token in database
    await this.userModel.updateOne(
      { _id: user._id },
      { $push: { refreshTokens: refreshToken } }
    );

    // Get user profile based on role
    const profile = await this.getUserProfile(user._id.toString(), user.role);

    // Check if user must change password
    const freshUser = await this.userModel.findById(user._id).lean().exec();
    if (!freshUser) {
      throw new UnauthorizedException('User not found');
    }

    if (freshUser.role === UserRole.ADMIN && !freshUser.schoolId) {
      throw new UnauthorizedException('No school is assigned to this admin');
    }

    const { roles, roleIds } = await this.buildRolesFromSameEmail(user.email);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        roles,
        roleIds: Object.keys(roleIds).length ? roleIds : undefined,
        schoolId: user.schoolId?.toString(),
        mustChangePassword: freshUser.mustChangePassword || false,
        profile,
      }
    };
  }

  buildRolesArray(user: any): UserRole[] {
    const primary = user.role;
    const extra = user.additionalRoles || [];
    return Array.from(new Set([primary, ...extra]));
  }

  async buildRolesFromSameEmail(email: string): Promise<{ roles: UserRole[]; roleIds: Record<string, string> }> {
    const users = await this.userModel.find({
      email: email.toLowerCase(),
      $or: [
        { status: UserStatus.ACTIVE },
        { status: 'ACTIVE' },
        { status: { $exists: false } },
      ],
    }).lean().exec();
    const roleSet = new Set<UserRole>();
    const roleIds: Record<string, string> = {};
    for (const u of users) {
      const id = (u as any)._id?.toString();
      if (!id) continue;
      const primary = u.role;
      const extra = (u as any).additionalRoles || [];
      for (const r of [primary, ...extra]) {
        if (r) {
          roleSet.add(r);
          if (!roleIds[r]) roleIds[r] = id;
        }
      }
    }
    return { roles: Array.from(roleSet), roleIds };
  }

  async resendOTP(email: string): Promise<void> {
    try {
      const user = await this.userModel.findOne({
        email: email.toLowerCase(),
        $or: [
          { status: UserStatus.ACTIVE },
          { status: 'ACTIVE' },
          { status: { $exists: false } }
        ]
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate a new OTP code (6 digits)
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Store the OTP code temporarily (expires in 2 minutes)
      await this.userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            mfaTempCode: otpCode,
            mfaTempCodeExpiry: new Date(Date.now() + 2 * 60 * 1000) // 2 minutes
          }
        }
      );

      // Get school name for email template
      let schoolName = 'School Portal';
      if (user.schoolId) {
        const school = await this.schoolModel.findById(user.schoolId).lean();
        schoolName = school?.name || 'School Portal';
      }

      // Send new OTP via email
      const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User';
      await this.emailService.sendOTPEmail(user.email, otpCode, userName, schoolName);

    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Failed to resend OTP');
    }
  }
}
