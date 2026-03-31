import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole, UserStatus } from './schemas/user.schema';
import { School, SchoolDocument } from './schemas/school.schema';
import { StudentProfile, StudentProfileDocument } from './schemas/student-profile.schema';
import { TeacherProfile, TeacherProfileDocument } from './schemas/teacher-profile.schema';
import { ParentProfile, ParentProfileDocument } from './schemas/parent-profile.schema';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  schoolId?: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
    schoolId?: string;
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
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    try {
      const user = await this.userModel.findOne({ 
        email: email.toLowerCase(),
        status: UserStatus.ACTIVE 
      }).exec();

      if (!user) {
        return null;
      }

      // Check if account is locked (simple check without method)
      const lockoutUntil = (user as any).lockoutUntil;
      if (lockoutUntil && lockoutUntil > new Date()) {
        throw new UnauthorizedException('Account is locked due to too many failed login attempts');
      }

      // Compare password using bcrypt directly
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Error in validateUser:', error);
      throw error;
    }
  }

  async login(user: any): Promise<LoginResponse> {
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

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        schoolId: user.schoolId?.toString(),
        profile,
      },
    };
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { refreshTokens: refreshToken } }
    );
  }

  async refreshToken(refreshToken: string): Promise<LoginResponse> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.userModel.findById(payload.sub).exec();

      if (!user || !user.refreshTokens?.includes(refreshToken)) {
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

      // Update refresh token in database
      await this.userModel.updateOne(
        { _id: user._id },
        { 
          $pull: { refreshTokens: refreshToken },
          $push: { refreshTokens: newRefreshToken },
        }
      );

      const profile = await this.getUserProfile(user._id.toString(), user.role);

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        user: {
          id: user._id.toString(),
          email: user.email,
          role: user.role,
          schoolId: user.schoolId?.toString(),
          profile,
        },
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async getUserProfile(userId: string, role: UserRole): Promise<any> {
    switch (role) {
      case UserRole.STUDENT:
        return await this.studentProfileModel.findOne({ userId }).exec();
      case UserRole.TEACHER:
        return await this.teacherProfileModel.findOne({ userId }).exec();
      case UserRole.PARENT:
        return await this.parentProfileModel.findOne({ userId }).exec();
      default:
        return null;
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec();

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify current password using bcrypt directly
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.userModel.updateOne(
      { _id: userId },
      { password: hashedNewPassword }
    );
  }
}
