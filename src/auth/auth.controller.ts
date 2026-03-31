import { Controller, Post, Get, UseGuards, Request, Body, UnauthorizedException, BadRequestException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService, LoginResponse } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { customResponse } from 'src/utils/responses';

export class LoginDto {
  email: string;
  password: string;
}

export class MFAVerifyDto {
  email: string;
  mfaCode: string;
}

export class RefreshTokenDto {
  refresh_token: string;
}

export class LogoutDto {
  refresh_token?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Request() req, @Res() res: Response, @Body() loginDto: LoginDto): Promise<any> {
    // req.user is set by LocalAuthGuard after successful validation
    try {
      const response = await this.authService.login(req.user);
      return customResponse(res as any, response.statusCode, response.message, response.data);
    } catch (error) {
      
      return customResponse(res as any, error.statusCode, error.message, error.data);
    }
  }

  @Post('verify-mfa')
  async verifyMFA(@Body() mfaDto: MFAVerifyDto, @Request() req): Promise<LoginResponse> {
    // Check if the DTO is populated at all
    if (!mfaDto || Object.keys(mfaDto).length === 0) {
      if (req.body && req.body.email && req.body.mfaCode) {
        mfaDto = req.body;
      } else {
        throw new BadRequestException('Missing MFA verification data');
      }
    }
    
    if (!mfaDto.mfaCode) {
      throw new BadRequestException('MFA code is required');
    }
    
    // If only MFA code is provided, verify by code alone
    if (!mfaDto.email && mfaDto.mfaCode) {
      return this.authService.verifyMFAByCode(mfaDto.mfaCode);
    }
    
    // If MFA code is provided but no email, still use verifyMFAByCode
    if (mfaDto.mfaCode && !mfaDto.email) {
      return this.authService.verifyMFAByCode(mfaDto.mfaCode);
    }
    
    // Legacy support: if both email and code are provided
    if (mfaDto.email && mfaDto.mfaCode) {
      return this.authService.verifyMFA(mfaDto.email, mfaDto.mfaCode);
    }
    
    // If no MFA code is provided
    if (!mfaDto.mfaCode) {
      console.log('❌ Missing MFA code');
      throw new UnauthorizedException('MFA code is required');
    }
  }

  @Post('resend-mfa')
  async resendMFA(@Body() resendDto: { email: string }): Promise<{ message: string }> {
    if (!resendDto.email) {
      throw new UnauthorizedException('Email is required');
    }
    
    await this.authService.resendMFACode(resendDto.email);
    return { message: 'New verification code sent to your email' };
  }

  @Post('verify-otp')
  async verifyOTP(@Body() otpDto: { email: string; otpCode: string }, @Request() req, @Res() res: Response): Promise<any> {
    try {
      if (!otpDto || !otpDto.email || !otpDto.otpCode) {
        if (req.body && req.body.email && req.body.otpCode) {
          otpDto = req.body;
        } else {
          return customResponse(res as any, 400, 'Email and OTP code are required', null);
        }
      }
      
      if (!otpDto.otpCode || otpDto.otpCode.length !== 6) {
        return customResponse(res as any, 400, 'OTP code must be 6 digits', null);
      }
      
      const result = await this.authService.verifyOTP(otpDto.email, otpDto.otpCode);
      return customResponse(res as any, 200, 'OTP verified successfully', result);
    } catch (error) {
      return customResponse(res as any, error.statusCode || 401, error.message || 'OTP verification failed', null);
    }
  }

  @Post('resend-otp')
  async resendOTP(@Body() resendDto: { email: string }): Promise<{ message: string }> {
    if (!resendDto.email) {
      throw new UnauthorizedException('Email is required');
    }
    
    await this.authService.resendOTP(resendDto.email);
    return { message: 'New OTP sent to your email' };
  }

  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<LoginResponse> {
    if (!refreshTokenDto.refresh_token) {
      throw new UnauthorizedException('Refresh token is required');
    }
    
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req, @Body() logoutDto: LogoutDto): Promise<{ message: string }> {
    await this.authService.logout(req.user._id, logoutDto.refresh_token);
    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Request() req): Promise<{ message: string }> {
    await this.authService.logout(req.user._id);
    return { message: 'Logged out from all devices successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req): Promise<any> {
    const user = await this.authService.findUserById(req.user._id);
    const profile = await this.authService.getUserProfile(req.user._id, req.user.role);
    
    // Use firstName and lastName from database, fallback to email extraction if not available
    let firstName = user.firstName;
    let lastName = user.lastName;
    
    if (!firstName || !lastName) {
      const emailPrefix = user.email.split('@')[0];
      if (emailPrefix.includes('.')) {
        const [emailFirst, emailLast] = emailPrefix.split('.');
        firstName = firstName || emailFirst.charAt(0).toUpperCase() + emailFirst.slice(1);
        lastName = lastName || emailLast.charAt(0).toUpperCase() + emailLast.slice(1);
      } else {
        firstName = firstName || emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
        lastName = lastName || 'User';
      }
    }
    
    // Merge user data with profile data for complete information
    return {
      user: {
        // Basic user info
        id: user._id,
        _id: user._id,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword || false,
        schoolId: user.schoolId,
        isActive: user.isActive,
        // Merge profile data (which now contains all role-specific fields from User schema)
        ...profile,
        // Override firstName/lastName with processed versions (after profile merge)
        firstName,
        lastName,
      }
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('user/:id')
  async getUserById(@Param('id') userId: string, @Request() req): Promise<any> {
    try {
      const user = await this.authService.findUserById(userId);
      
      if (!user) {
        throw new BadRequestException('User not found');
      }
      
      // Format address if it's an object
      let formattedAddress = 'N/A';
      if (user.address) {
        if (typeof user.address === 'object') {
          const addr = user.address as any;
          formattedAddress = `${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zipCode || ''}`.trim();
        } else {
          formattedAddress = user.address;
        }
      }
      
      // Return basic user information (for parent details, etc.)
      return {
        _id: user._id,
        firstName: user.firstName || 'N/A',
        lastName: user.lastName || 'N/A',
        email: user.email,
        phone: (user as any).phone || 'N/A',
        role: user.role,
        address: formattedAddress,
      };
    } catch (error) {
      throw new BadRequestException('Failed to fetch user details');
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: { currentPassword: string; newPassword: string }
  ): Promise<{ message: string }> {
    await this.authService.changePassword(
      req.user._id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword
    );
    return { message: 'Password changed successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('parent/children')
  async getParentChildren(@Request() req): Promise<any[]> {
    if (req.user.role !== 'PARENT') {
      throw new UnauthorizedException('Access denied. Parent role required.');
    }
    const parentUserId = req.user._id?.toString?.() || req.user.userId || req.user.sub || req.user._id;
    return this.authService.getParentChildren(parentUserId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('parent/profile')
  async getParentProfileWithChildren(@Request() req): Promise<any> {
    if (req.user.role !== 'PARENT') {
      throw new UnauthorizedException('Access denied. Parent role required.');
    }
    const parentUserId = req.user._id?.toString?.() || req.user.userId || req.user.sub || req.user._id;
    const user = await this.authService.findUserById(parentUserId);
    const parentProfile = await this.authService.getUserProfile(parentUserId, req.user.role);
    const children = await this.authService.getParentChildren(parentUserId);
    
    const parentProfileDoc = await this.authService.getParentProfileDocument(parentUserId);
    
    // Use firstName and lastName from database
    let firstName = user.firstName || 'Parent';
    let lastName = user.lastName || 'User';
    
    // Format address properly - keep as object if it's an object
    let formattedAddress: any = 'N/A';
    if (parentProfile?.address) {
      if (typeof parentProfile.address === 'string') {
        formattedAddress = parentProfile.address;
      } else if (typeof parentProfile.address === 'object') {
        // Keep as object for proper frontend handling
        formattedAddress = parentProfile.address;
      }
    } else if (user.address) {
      if (typeof user.address === 'string') {
        formattedAddress = user.address;
      } else if (typeof user.address === 'object') {
        formattedAddress = user.address;
      }
    }
    
    // Get Parent model document for fallback values
    const parentDoc = await this.authService.getParentDocument(parentUserId);
    
    // Include pickup authorization and relationship info from ParentProfile
    const childrenWithDetails = children.map((child: any) => {
      // First try to get from ParentProfile.children (per-child relationship info)
      const childInfo = parentProfileDoc?.children?.find(
        (c: any) => c.studentId?.toString() === child._id?.toString()
      );
      
      // Fallback to Parent model if not found in ParentProfile (parent-level values)
      const isPrimaryContact = childInfo?.isPrimaryContact !== undefined 
        ? childInfo.isPrimaryContact 
        : (parentDoc?.isPrimaryContact !== undefined ? parentDoc.isPrimaryContact : false);
      
      const hasPickupPermission = childInfo?.hasPickupPermission !== undefined 
        ? childInfo.hasPickupPermission 
        : (parentDoc?.hasPickupPermission !== undefined ? parentDoc.hasPickupPermission : false);
      
      console.log(`🔍 [getParentProfileWithChildren] Child ${child._id}:`, {
        fromParentProfile: {
          isPrimaryContact: childInfo?.isPrimaryContact,
          hasPickupPermission: childInfo?.hasPickupPermission,
        },
        fromParentModel: {
          isPrimaryContact: parentDoc?.isPrimaryContact,
          hasPickupPermission: parentDoc?.hasPickupPermission,
        },
        final: {
          isPrimaryContact,
          hasPickupPermission,
        }
      });
      
      return {
        ...child,
        relationship: childInfo?.relationship || child.relationship || null,
        isPrimaryContact: isPrimaryContact,
        hasPickupPermission: hasPickupPermission
      };
    });
    
    return {
      _id: user._id,
      firstName,
      lastName,
      email: user.email,
      phone: parentProfile?.phone || user.phone || 'N/A',
      address: formattedAddress,
      profile: parentProfile,
      children: childrenWithDetails
    };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: { email: string }): Promise<{ success: boolean; message: string }> {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    
    return await this.authService.forgotPassword(body.email);
  }

  @Post('request-admin-reset')
  async requestAdminReset(@Body() body: { email: string }): Promise<{ success: boolean; message: string }> {
    if (!body.email) {
      throw new BadRequestException('Email is required');
    }
    
    return await this.authService.requestAdminReset(body.email);
  }

  @Get('verify-reset-token')
  async verifyResetToken(@Request() req): Promise<{ success: boolean; message: string }> {
    const token = req.query.token as string;
    
    if (!token) {
      throw new BadRequestException('Token is required');
    }
    
    return await this.authService.verifyResetToken(token);
  }

  @Post('reset-password')
  async resetPasswordWithToken(@Body() body: { token: string; newPassword: string }): Promise<{ success: boolean; message: string }> {
    if (!body.token) {
      throw new BadRequestException('Token is required');
    }
    
    if (!body.newPassword) {
      throw new BadRequestException('New password is required');
    }
    
    return await this.authService.resetPasswordWithToken(body.token, body.newPassword);
  }
}
