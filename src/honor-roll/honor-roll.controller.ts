import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { HonorRollService } from './honor-roll.service';

@Controller('honor-roll')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HonorRollController {
  constructor(private readonly honorRollService: HonorRollService) {}

  // ==================== CRITERIA MANAGEMENT ====================

  @Post('criteria')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async createCriteria(@Body() criteriaData: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be in criteriaData (from frontend)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (criteriaData.schoolId || req.user.schoolId) : req.user.schoolId;
    
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    return this.honorRollService.createCriteria({
      ...criteriaData,
      schoolId
    }, req.user._id?.toString() || req.user.userId);
  }

  @Get('criteria')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getCriteria(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be in query (optional)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    return this.honorRollService.getCriteriaBySchool(schoolId, query);
  }

  @Put('criteria/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async updateCriteria(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    return this.honorRollService.updateCriteria(id, updateData, req.user._id.toString());
  }

  @Delete('criteria/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async deleteCriteria(@Param('id') id: string) {
    return this.honorRollService.deleteCriteria(id);
  }

  // ==================== AWARD CALCULATION ====================

  @Post('calculate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async calculateHonorRoll(@Body() body: any, @Req() req: any) {
    const role = req.user.role;
    const { academicYear, markingPeriod, schoolId } = body;
    // For SUPER_ADMIN, schoolId must be in body (from frontend)
    // For others, use their schoolId
    const targetSchoolId = role === 'SUPER_ADMIN' ? (schoolId || req.user.schoolId) : req.user.schoolId;
    
    if (!targetSchoolId) {
      throw new BadRequestException('School ID is required');
    }

    return this.honorRollService.calculateHonorRoll(
      targetSchoolId,
      academicYear,
      markingPeriod,
      req.user._id?.toString() || req.user.userId
    );
  }

  // ==================== AWARD MANAGEMENT ====================

  @Get('awards')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getAwards(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be in query (optional)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    return this.honorRollService.getHonorRollAwards(schoolId, query);
  }

  @Post('awards/manual-override')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async manualOverride(@Body() awardData: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be in awardData (from frontend)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (awardData.schoolId || req.user.schoolId) : req.user.schoolId;
    
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    return this.honorRollService.manualOverride({
      ...awardData,
      schoolId
    }, req.user._id?.toString() || req.user.userId);
  }

  @Put('awards/:id/revoke')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async revokeAward(@Param('id') id: string, @Body() revokeData: any, @Req() req: any) {
    return this.honorRollService.revokeAward(id, revokeData, req.user.userId);
  }

  // ==================== REPORTS ====================

  @Get('reports/summary')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getHonorRollReport(@Query() query: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be in query (optional)
    // For others, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    
    return this.honorRollService.getHonorRollReport(schoolId, query);
  }

  @Get('student/:studentId/history')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT)
  async getStudentHistory(@Param('studentId') studentId: string) {
    return this.honorRollService.getStudentHonorRollHistory(studentId);
  }

  // ==================== STUDENT PORTAL ENDPOINTS ====================

  @Get('student/my-status')
  @Roles(UserRole.STUDENT)
  async getStudentHonorRollStatus(@Req() req: any) {
    try {
      // Use same approach as /auth/profile - req.user._id directly
      const studentUserId = req.user._id;
      console.log(`🔵 [Controller] getStudentHonorRollStatus called for student: ${studentUserId}`);
      console.log(`🔵 [Controller] req.user object:`, JSON.stringify(req.user, null, 2));
      
      if (!studentUserId) {
        console.log(`⚠️ [Controller] Student ID not found in request. req.user:`, req.user);
        return {
          hasHonorRoll: false,
          status: null,
          message: 'Student ID not found in request',
          details: {
            message: 'Unable to identify student. Please log in again.'
          }
        };
      }
      
      const result = await this.honorRollService.getStudentHonorRollStatus(studentUserId);
      console.log(`✅ [Controller] Returning result:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('❌ [Controller] Error in getStudentHonorRollStatus:', error);
      console.error('❌ [Controller] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return {
        hasHonorRoll: false,
        status: null,
        message: 'Error fetching honor roll status',
        details: {
          message: 'An error occurred while fetching your honor roll status. Please try again later.'
        }
      };
    }
  }

  // ==================== PARENT PORTAL ENDPOINTS ====================

  @Get('parent/child/:studentId/status')
  @Roles(UserRole.PARENT)
  async getChildHonorRollStatus(@Param('studentId') studentId: string, @Req() req: any) {
    try {
      console.log(`🔵 [Controller] getChildHonorRollStatus called for student: ${studentId} by parent`);
      
      // Verify that the student is a child of the parent
      const parentUserId = req.user._id;
      const parentUser = await this.honorRollService.getParentUser(parentUserId?.toString() || parentUserId);
      
      if (!parentUser || !parentUser.children || parentUser.children.length === 0) {
        return {
          hasHonorRoll: false,
          status: null,
          message: 'No children found',
          details: {
            message: 'You do not have any children associated with your account.'
          }
        };
      }

      // Check if the requested student is a child of this parent
      const childrenIds = parentUser.children.map((childId: any) => childId.toString());
      const studentIdString = studentId.toString();
      
      if (!childrenIds.includes(studentIdString)) {
        return {
          hasHonorRoll: false,
          status: null,
          message: 'Access denied',
          details: {
            message: 'You do not have permission to view this student\'s honor roll status.'
          }
        };
      }

      // Get honor roll status for the child
      const result = await this.honorRollService.getStudentHonorRollStatus(studentIdString);
      console.log(`✅ [Controller] Returning child honor roll status:`, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error('❌ [Controller] Error in getChildHonorRollStatus:', error);
      return {
        hasHonorRoll: false,
        status: null,
        message: 'Error fetching honor roll status',
        details: {
          message: 'An error occurred while fetching honor roll status. Please try again later.'
        }
      };
    }
  }

  @Get('parent/children-awards')
  @Roles(UserRole.PARENT)
  async getChildrenHonorRollAwards(@Req() req: any) {
    const parentUserId = req.user._id?.toString() || req.user.userId;
    
    // Get parent's children from User model
    const parentUser = await this.honorRollService.getParentUser(parentUserId);
    if (!parentUser || !parentUser.children || parentUser.children.length === 0) {
      return { awards: [], message: 'No children found' };
    }

    // Get honor roll awards for all children
    const childrenIds = parentUser.children.map((childId: any) => childId.toString());
    const awards = await this.honorRollService.getAwardsForStudents(childrenIds);
    
    return { awards, total: awards.length };
  }
}
