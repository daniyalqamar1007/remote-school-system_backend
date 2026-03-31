import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors, UploadedFile, UploadedFiles, Res, HttpStatus, BadRequestException, Patch, NotFoundException, UnauthorizedException, HttpCode } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ClubService } from '../club/club.service';
import { SportsService } from '../sports/sports.service';
import { ActivityService } from '../activity/activity.service';
import { CreateStudentDto } from '../student/dto/create-student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { multerOptionsForXlxs, multerOptions, UploadedFileType } from '../../utils/multer.config';
import { customResponse } from 'src/utils/responses';
import { Response } from 'express';
import { CreateParentDto } from './dto/create-parent.dto';
import { UpdateParentDto } from './dto/update-parent.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CreateNurseDto } from './dto/create-nurse.dto';
import { UpdateNurseDto } from './dto/update-nurse.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateCourseDto } from '../course/dto/create-course.dto';
import { UpdateCourseDto } from '../course/dto/update-course.dto';
import { CreateTeacherDto } from '../teacher/dto/create-teacher.dto';
import { AssignCoursesDto } from '../course/dto/assign-course.dto';
import { UpdateTeacherDto } from 'src/teacher/dto/update-teaacher.dto';
import { Types } from 'mongoose';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly clubService: ClubService,
    private readonly sportsService: SportsService,
    private readonly activityService: ActivityService
  ) { }

  // ==================== PASSWORD MANAGEMENT ====================

  @Get('users')
  @Roles(UserRole.ADMIN)
  async getSchoolUsers(
    @Req() req: any,
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string
  ) {
    try {
      const schoolId = req.user.schoolId;
      const adminId = req.user._id.toString();

      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;

      const result = await this.adminService.getSchoolUsers(schoolId, adminId, pageNum, limitNum, search, role);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch users',
        null
      );
    }
  }

  @Post('users/:id/reset-password')
  @Roles(UserRole.ADMIN)
  async resetUserPassword(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
    @Body() body: { newPassword: string }
  ) {
    try {
      const schoolId = req.user.schoolId;
      const adminId = req.user._id.toString();

      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      if (!body.newPassword) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'New password is required', null);
      }

      const result = await this.adminService.resetUserPassword(id, schoolId, adminId, body.newPassword);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to reset password',
        null
      );
    }
  }

  // ==================== DASHBOARD ====================

  @Get('dashboard/overview')
  async getDashboardOverview(@Req() req: any, @Res() res: Response) {
    try {
      const schoolId = req.user.schoolId;
      const adminId = req.user._id.toString();

      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      if (!adminId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'Admin ID is required', null);
      }

      console.log("schoolId: ", schoolId);
      console.log("adminId: ", adminId);

      const result = await this.adminService.getDashboardOverview(schoolId, adminId);

      // Fix: properly type `result` and provide fallback values if result is unknown
      if (
        !result ||
        typeof result !== 'object' ||
        !('statusCode' in result) ||
        !('message' in result) ||
        !('data' in result)
      ) {
        return customResponse(
          res as any,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Invalid response from service',
          null
        );
      }

      return customResponse(
        res as any,
        (result as any).statusCode,
        (result as any).message,
        (result as any).data
      );
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch dashboard overview',
        null
      );
    }
  }

  @Get('dashboard/recent-activity')
  async getRecentActivity(@Req() req: any) {
    const schoolId = req.user.schoolId;
    const adminId = req.user._id.toString();
    return await this.adminService.getRecentActivity(schoolId, adminId);
  }

  // ==================== TEACHERS ====================

  @Post('teachers')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async createTeacher(
    @Req() req: any, 
    @Res() res: Response, 
    @Body() teacherData: CreateTeacherDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    const role = req.user.role;
    const createdBy = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? teacherData.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.createTeacher(schoolId, createdBy, teacherData, role, files);

      if (!result || !result.statusCode) {
        return customResponse(
          res as any,
          HttpStatus.INTERNAL_SERVER_ERROR,
          'Invalid response from service',
          null
        );
      }

      return customResponse(res as any, result.statusCode, result.message || 'Operation completed', result.data ?? null);
    } catch (error) {
      return customResponse(
        res as any,
        error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to create teacher',
        null
      );
    }
  }

  @Patch('teachers/:id/eligibility')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateTeacherEligibility(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
    @Body() body: { eligible_for_sports?: boolean; eligible_for_iep?: boolean; eligible_for_counselor?: boolean }
  ) {
    try {
      const role = req.user.role;
      let schoolId: string | null = null;
      
      // For SUPER_ADMIN, schoolId can come from query params or body
      // For ADMIN, schoolId comes from req.user
      if (role === 'SUPER_ADMIN') {
        schoolId = req.query.schoolId || req.body.schoolId || null;
        // If no schoolId provided for SUPER_ADMIN, we can still update but need to verify teacher exists
      } else {
        schoolId = req.user.schoolId ? String(req.user.schoolId) : null;
        if (!schoolId) {
          return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
        }
      }

      const result = await this.adminService.updateTeacherEligibility(id, schoolId, body, role);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to update teacher eligibility',
        null
      );
    }
  }

  @Get('teachers')
  async getTeachers(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : (req.user.schoolId || query.schoolId);

    // For ADMIN role: schoolId is required
    if (role !== 'SUPER_ADMIN' && !schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.getTeachers(schoolId, query, role);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch teachers',
        null
      );
    }
  }

  // Export teachers (same pattern as students/export)
  @Get('teachers/export')
  async exportTeachers(@Req() req: any, @Res() res: any) {
    try {
      const schoolId = req.user.schoolId || req.query.schoolId;
      const adminId = req.user._id.toString();

      console.log("schoolId:", schoolId);
      console.log("adminId:", adminId);

      const result = await this.adminService.exportTeachers(schoolId, adminId);

      console.log("result:", result);

      if (!result.csvContent || result.csvContent.length === 0) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'No teachers found',
          null
        );
      }

      const filename = result.filename;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8').toString());

      return res.status(200).send(result.csvContent);
    } catch (error: any) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to export teachers',
        null
      );
    }
  }

  @Get('teachers/template')
  async downloadTeacherTemplate(@Req() req: any, @Res() res: any) {
    try {
      const result = await this.adminService.downloadTeacherTemplate();
      if (!result.csvContent || result.csvContent.length === 0) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'Failed to generate template', null);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8').toString());
      return res.status(200).send(result.csvContent);
    } catch (error: any) {
      return customResponse(res as any, HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to download teacher template', null);
    }
  }

  @Get('teachers/:id')
  async getTeacherById(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.getTeacherById(schoolId, id);

      console.log("result: ", result);

      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch teacher',
        null
      );
    }
  }

  // ==================== COURSE ASSIGNMENT (TEACHER -> COURSES BY DEPARTMENTS) ====================
  @Get('course-assignment')
  async getCoursesForTeacherAssignment(@Req() req: any, @Res() res: Response, @Query('userId') userId: string, @Query() query: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;

    if (!userId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'userId is required', null);
    }

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.getCourseAssignments(schoolId, userId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch courses for assignment',
        null
      );
    }
  }

  // Assign multiple courses to a teacher (upsert per course)
  @Post('course-assignment')
  async assignCoursesToTeacher(@Req() req: any, @Res() res: Response, @Body() body: AssignCoursesDto) {
    const role = req.user.role;
    const createdBy = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? body.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    console.log("schoolId: ", schoolId);
    console.log("createdBy: ", createdBy);
    console.log("body: ", body);

    try {
      const result = await this.adminService.assignCoursesToTeacher(schoolId, createdBy, body);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to assign courses',
        null
      );
    }
  }

  // Get all assigned courses for a teacher (for edit form)
  @Get('course-assignment/assigned')
  async getAssignedCoursesForTeacher(@Req() req: any, @Res() res: Response, @Query('userId') userId: string, @Query() query: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;

    if (!userId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'userId is required', null);
    }

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.getAssignedCourses(schoolId, userId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch assigned courses',
        null
      );
    }
  }

  @Put('teachers/:id')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async updateTeacher(
    @Req() req: any, 
    @Res() res: Response, 
    @Param('id') id: string, 
    @Body() updateData: UpdateTeacherDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    const role = req.user.role;
    const adminId = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? updateData.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.updateTeacher(schoolId, id, updateData, role, adminId, files);
      return customResponse(res as any, result.statusCode, result.message, null);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update teacher',
        null
      );
    }
  }

  @Delete('teachers/:id')
  async deleteTeacher(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const role = req.user.role;
    const adminId = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.deleteTeacher(schoolId, id, role, adminId);
      return customResponse(res as any, result.statusCode, result.message, null);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete teacher',
        null
      );
    }
  }

  // Download parent template
  @Get('parents/template')
  async downloadParentTemplate(@Req() req: any, @Res() res: any) {
    try {
      const result = await this.adminService.downloadParentTemplate();

      if (!result.csvContent || result.csvContent.length === 0) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'Failed to generate template',
          null
        );
      }

      const filename = result.filename;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8').toString());

      return res.status(200).send(result.csvContent);
    } catch (error: any) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to download parent template',
        null
      );
    }
  }

  // Download nurse template
  @Get('nurses/template')
  async downloadNurseTemplate(@Req() req: any, @Res() res: any) {
    try {
      const result = await this.adminService.downloadNurseTemplate();

      if (!result.csvContent || result.csvContent.length === 0) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'Failed to generate template',
          null
        );
      }

      const filename = result.filename;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8').toString());

      return res.status(200).send(result.csvContent);
    } catch (error: any) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to download nurse template',
        null
      );
    }
  }

  // Import teachers (same pattern as students/import)
  @Post('teachers/import')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async importTeachers(@Req() req: any, @UploadedFile() file: UploadedFileType, @Res() res: Response) {
    const schoolId = req.user.schoolId || req.query.schoolId;
    const createdBy = req.user._id.toString();

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    console.log("schoolId:", schoolId);
    console.log("createdBy:", createdBy);
    console.log("file:", file);

    try {
      const result = await this.adminService.importTeachers(schoolId, createdBy, file);

      console.log("result:", result);
      return customResponse(
        res as any,
        HttpStatus.OK,
        result.message,
        {
          insertedCount: result.insertedCount,
          skippedCount: result.skippedCount,
          errors: result.errors,
        }
      );
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        error.message || 'Teacher bulk upload failed',
        null
      );
    }
  }

  // ==================== COURSES ====================

  @Post('courses')
  async createCourse(@Req() req: any, @Res() res: Response, @Body() courseData: CreateCourseDto) {
    const role = req.user.role;
    const createdBy = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? courseData.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.createCourse(schoolId, createdBy, courseData, role);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create course',
        null
      );
    }
  }

  @Get('courses')
  async getCourses(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : req.user.schoolId;

    if (role !== 'SUPER_ADMIN' && !schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'schoolId is required for SUPER_ADMIN', null);
    }

    try {
      const result = await this.adminService.getCourses(role, schoolId, query);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch courses',
        null
      );
    }
  }

  @Get('courses/:id')
  async getCourseById(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.getCourseById(schoolId, id);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch course',
        null
      );
    }
  }

  @Put('courses/:id')
  async updateCourse(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Body() updateData: UpdateCourseDto) {
    const role = req.user.role;
    const adminId = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? updateData.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.updateCourse(schoolId, id, { ...updateData, updatedBy: adminId }, role, adminId);
      return customResponse(res as any, result.statusCode, result.message, null);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update course',
        null
      );
    }
  }

  @Delete('courses/:id')
  async deleteCourse(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const role = req.user.role;
    const adminId = req.user._id.toString();
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.deleteCourse(schoolId, id, role, adminId);
      return customResponse(res as any, result.statusCode, result.message, null);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete course',
        null
      );
    }
  }

  // ==================== DEPARTMENTS ====================

  @Post('departments')
  async createDepartment(@Req() req: any, @Res() res: Response, @Body() departmentData: CreateDepartmentDto) {
    const schoolId = req.user.schoolId || departmentData.schoolId;
    const createdBy = req.user._id.toString();
    const role = req.user.role;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    console.log("schoolId:", schoolId);
    console.log("createdBy:", createdBy);
    console.log("role:", role);
    console.log("departmentData:", departmentData);

    try {
      const result = await this.adminService.createDepartment(schoolId, createdBy, departmentData, role);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create department',
        null
      );
    }
  }

  @Get('departments')
  async getDepartments(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    // For SUPER_ADMIN: schoolId is optional from query params
    // For ADMIN: use schoolId from user or query
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : (req.user.schoolId || query.schoolId);

    // For ADMIN role: schoolId is required
    if (role !== 'SUPER_ADMIN' && !schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.getDepartments(schoolId, query, role);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch departments',
        null
      );
    }

  }

  // Department names (no pagination) - returns _id, departmentName, code
  @Get('departments/names')
  async getDepartmentNames(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    // SUPER_ADMIN must provide schoolId in query; ADMIN uses req.user.schoolId
    const schoolId = role === 'SUPER_ADMIN' ? query.schoolId : req.user.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.getDepartmentNames(schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch department names',
        null
      );
    }
  }

  @Get('departments/:id')
  async getDepartmentById(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const schoolId = req.user.schoolId || query.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.getDepartmentById(schoolId, id);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create department',
        null
      );
    }
  }

  @Put('departments/:id')
  async updateDepartment(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Body() updateData: UpdateDepartmentDto) {
    const schoolId = req.user.schoolId || updateData.schoolId;
    const adminId = req.user._id.toString();
    const role = req.user.role;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.updateDepartment(schoolId, id, updateData, role, adminId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create department',
        null
      );
    }
  }

  @Delete('departments/:id')
  async deleteDepartment(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const schoolId = req.user.schoolId || query.schoolId;
    const adminId = req.user._id.toString();
    const role = req.user.role;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.deleteDepartment(schoolId, id, role, adminId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create department',
        null
      );
    }
  }

  // ==================== PARENTS ====================

  @Post('parents')
  async createParent(@Req() req: any, @Res() res: Response, @Body() parentData: CreateParentDto) {
    const createdBy = req.user._id.toString();
    const role = req.user.role;
    const schoolId = req.user.schoolId || parentData.schoolId; // Get schoolId from request user or from parent data

    console.log("req:", req.user);
    console.log("createdBy:", createdBy);
    console.log("role:", role);
    console.log("schoolId:", schoolId);
    console.log("parentData:", parentData);

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.createParent(createdBy, role, parentData, schoolId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create parent',
        null
      );
    }
  }

  @Get('parents')
  async getParents(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    // For SUPER_ADMIN: Use schoolId from query if provided, otherwise null (show all)
    // For ADMIN/SECRETARY: Use schoolId from req.user (their assigned school)
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || req.user.schoolId) : req.user.schoolId;
    try {
      const result = await this.adminService.getParents(role, query, schoolId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch parents',
        null
      );
    }
  }

  @Get('parents/by-email/:email')
  async getParentByEmail(@Req() req: any, @Res() res: Response, @Param('email') email: string) {
    try {
      const result = await this.adminService.findParentByEmail(email);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch parent',
        null
      );
    }
  }

  @Get('parents/:id')
  async getParentById(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const role = req.user.role;
    const schoolId = req.user.schoolId; // Get schoolId for ADMIN role filtering
    try {
      const result = await this.adminService.getParentByIdWithChildren(id, role, schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch parent',
        null
      );
    }
  }

  @Put('parents/:id')
  async updateParent(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Body() updateData: UpdateParentDto) {
    const role = req.user.role;
    const roleId = req.user._id.toString();

    console.log("role:", role);
    console.log("roleId:", roleId);
    console.log("id:", id);
    console.log("updateData:", updateData);

    try {
      const result = await this.adminService.updateParent(id, updateData, role, roleId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update parent',
        null
      );
    }
  }

  @Delete('parents/:id')
  async deleteParent(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const role = req.user.role;
    const roleId = req.user._id.toString();
    const schoolId = req.user.schoolId; // For ADMIN role, will be present
    try {
      const result = await this.adminService.deleteParent(id, role, roleId, schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'Failed to delete parent',
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete parent',
        null
      );
    }
  }

  @Put('parents/:id/reset-password')
  async resetParentPassword(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Body() passwordData: ResetPasswordDto) {
    const role = req.user.role;

    // Only SUPER_ADMIN can reset parent password (double check for safety)
    if (role !== 'SUPER_ADMIN') {
      return customResponse(
        res as any,
        HttpStatus.FORBIDDEN,
        'Only SUPER ADMIN can reset parent password',
        null
      );
    }

    const schoolId = req.user.schoolId; // May be undefined for SUPER_ADMIN
    const adminId = req.user._id.toString();
    try {
      const result = await this.adminService.resetParentPassword(schoolId || '', adminId, id, passwordData.password, role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message || 'Failed to reset password',
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to reset password',
        null
      );
    }
  }

  // ==================== STUDENTS ====================

  @Post('students')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async createStudent(
    @Req() req: any,
    @Res() res: Response,
    @Body() studentData: CreateStudentDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    console.log("studentData:", studentData);
    console.log("files:", files);
    const schoolId = studentData.schoolId || req.user.schoolId;
    const createdBy = req.user._id.toString();
    const role = req.user.role;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.createStudent(schoolId, createdBy, studentData, role, files);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      console.error('Error in createStudent controller:', error);

      // Handle DTO validation errors automatically
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }

      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create student',
        null
      );
    }
  }

  @Post('students/import')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async bulkUploadStudents(@Req() req: any, @UploadedFile() file: UploadedFileType, @Res() res: Response) {
    const schoolId = req.user.schoolId || req.query.schoolId;
    const createdBy = req.user._id.toString();
    const role = req.user.role;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.bulkUploadStudents(schoolId, createdBy, role, file);
      return customResponse(
        res as any,
        HttpStatus.OK,
        result.message,
        {
          insertedCount: result.insertedCount,
          skippedCount: result.skippedCount,
          errors: result.errors,
        }
      );
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        error.message || 'Student bulk upload failed',
        null
      );
    }
  }

  @Get('academic-terms')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAcademicTerms(@Req() req: any, @Query() query: any) {
    const adminId = req.user._id?.toString();
    let schoolId = this.normalizeSchoolId(req);
    if (!schoolId && adminId) {
      schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
    }
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    const page = Math.max(1, parseInt(String(query.page)) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(query.limit)) || 20));
    const filters = {
      academicYear: query.academicYear,
      isActive: query.isActive,
    };
    return this.adminService.getAcademicTermsForSchool(schoolId, page, limit, filters);
  }

  @Post('academic-terms')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createAcademicTerm(@Req() req: any, @Body() termData: any) {
    const adminId = req.user._id?.toString();
    let schoolId = this.normalizeSchoolId(req);
    if (!schoolId && termData?.schoolId) {
      const raw = termData.schoolId;
      schoolId = typeof raw === 'object' && raw != null && raw._id != null ? String(raw._id) : String(raw);
    }
    if (!schoolId && adminId) {
      schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
    }
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    return this.adminService.createAcademicTermForSchool(schoolId, termData);
  }

  @Put('academic-terms/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateAcademicTerm(@Req() req: any, @Param('id') id: string, @Body() updateData: any) {
    const adminId = req.user._id?.toString();
    let schoolId = this.normalizeSchoolId(req);
    if (!schoolId && adminId) {
      schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
    }
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    return this.adminService.updateAcademicTermForSchool(schoolId, id, updateData);
  }

  @Delete('academic-terms/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteAcademicTerm(@Req() req: any, @Param('id') id: string) {
    const adminId = req.user._id?.toString();
    let schoolId = this.normalizeSchoolId(req);
    if (!schoolId && adminId) {
      schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
    }
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    await this.adminService.deleteAcademicTermForSchool(schoolId, id);
    return { success: true, message: 'Academic term deleted' };
  }

  @Put('academic-terms/:id/set-current')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async setCurrentAcademicTerm(@Req() req: any, @Param('id') id: string) {
    const adminId = req.user._id?.toString();
    let schoolId = this.normalizeSchoolId(req);
    if (!schoolId && adminId) {
      schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
    }
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    await this.adminService.setCurrentAcademicTermForSchool(schoolId, id);
    return { success: true, message: 'Current term updated' };
  }

  @Get('students')
  async getStudents(@Res() res: Response, @Req() req: any, @Query() query: any) {
    const role = req.user.role;
    const schoolId = req.user.schoolId; // may be undefined for SUPER_ADMIN
    const adminId = req.user._id.toString();

    console.log("role:", role);
    console.log("schoolId:", schoolId);
    console.log("adminId:", adminId);
    console.log("query:", query);

    try {
      const result = await this.adminService.getStudents(role, schoolId, adminId, query);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      console.error('Error in getStudents controller:', error);

      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }

      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to fetch students',
        null
      );
    }
  }

  @Get('students/export')
  async exportStudents(@Req() req: any, @Res() res: any) {
    try {
      const schoolId = req.user.schoolId || req.query.schoolId;
      const adminId = req.user._id.toString();

      const result = await this.adminService.exportStudents(schoolId, adminId);

      if (!result.csvContent || result.csvContent.length === 0) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'No students found',
          null
        );
      }

      // Set headers for direct CSV download
      const filename = result.filename;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8').toString());

      // Send raw CSV (no JSON wrapper)
      return res.status(200).send(result.csvContent);
    } catch (error: any) {
      console.error('Export error:', error);
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to export students',
        null
      );
    }
  }

  @Get('students/template')
  async downloadStudentTemplate(@Req() req: any, @Res() res: any) {
    try {
      const result = await this.adminService.downloadStudentTemplate();
      if (!result.csvContent || result.csvContent.length === 0) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'Failed to generate template', null);
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(result.csvContent, 'utf8').toString());
      return res.status(200).send(result.csvContent);
    } catch (error: any) {
      return customResponse(res as any, HttpStatus.INTERNAL_SERVER_ERROR, 'Failed to download student template', null);
    }
  }

  @Get('students/:id')
  async getStudentById(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query() query: any) {
    const role = req.user.role;
    let schoolId = req.user.schoolId || req.query.schoolId;

    console.log("role:", role);
    console.log("schoolId:", schoolId);
    console.log("id:", id);
    console.log("query:", query);
    console.log("req.user:", req.user);

    try {
      // Handle SUPER_ADMIN case
      if (role === 'SUPER_ADMIN') {
        if (!query.schoolId) {
          return customResponse(
            res as any,
            HttpStatus.BAD_REQUEST,
            'schoolId is required for SUPER_ADMIN',
            null
          );
        }
        schoolId = query.schoolId;
      }

      console.log("schoolId:", schoolId);

      const result = await this.adminService.getStudentById(schoolId, id);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      console.error('Error in getStudentById controller:', error);

      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }

      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to fetch student details',
        null
      );
    }
  }

  @Put('students/:id')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async updateStudent(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateData: CreateStudentDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    const schoolId = updateData.schoolId || req.user.schoolId;
    const role = req.user.role;

    console.log("schoolId:", schoolId);
    console.log("id:", id);
    console.log("updateData:", updateData);
    console.log("files:", files);
    console.log("req.user:", req.user);

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.updateStudent(schoolId, id, updateData, role, files);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to update student',
        null
      );
    }
  }

  @Delete('students/:id')
  async deleteStudent(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const schoolId = req.user.schoolId || req.query.schoolId;
    const adminId = req.user._id.toString();
    const role = req.user.role;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.deleteStudent(schoolId, id, adminId, role);
      return customResponse((req.res as any) || ({} as any), result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete transcript',
        null
      );
    }

  }

  @Delete('students/:id/transcripts')
  async deleteStudentTranscript(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
    @Query('url') url?: string,
    @Body('url') urlBody?: string
  ) {
    const schoolId = req.user.schoolId || req.query.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }
    const transcriptUrl = url || urlBody;

    if (!transcriptUrl) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'Transcript URL is required', null);
    }

    try {
      const result = await this.adminService.deleteStudentTranscript(schoolId, id, transcriptUrl);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete transcript',
        null
      );
    }
  }

  // ==================== NURSES ====================

  @Post('nurses')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async createNurse(
    @Req() req: any,
    @Res() res: Response,
    @Body() nurseData: CreateNurseDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    const createdBy = req.user._id.toString();
    const role = req.user.role;
    // Prioritize schoolId from form data (for super-admin selection), fall back to user's schoolId (for admin users)
    const schoolId = nurseData.schoolId || req.user.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.createNurse(createdBy, role, nurseData, schoolId, files);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create nurse',
        null
      );
    }
  }

  @Get('nurses')
  async getNurses(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    const schoolId = req.user.schoolId;
    try {
      const result = await this.adminService.getNurses(role, query, schoolId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch nurses',
        null
      );
    }
  }

  @Get('nurses/:id')
  async getNurseById(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const role = req.user.role;
    const schoolId = req.user.schoolId || req.query.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.getNurseById(id, role, schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to fetch nurse',
        null
      );
    }
  }

  @Put('nurses/:id')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async updateNurse(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateData: UpdateNurseDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    const role = req.user.role;
    const roleId = req.user._id.toString();
    // Prioritize schoolId from form data (for super-admin selection), fall back to user's schoolId (for admin users)
    const schoolId = updateData.schoolId || req.user.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.updateNurse(id, updateData, role, roleId, schoolId, files);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update nurse',
        null
      );
    }
  }

  @Delete('nurses/:id')
  async deleteNurse(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const role = req.user.role;
    const roleId = req.user._id.toString();
    const schoolId = req.user.schoolId || req.query.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.deleteNurse(id, role, roleId, schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
          error.message || 'Failed to delete nurse',
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete nurse',
        null
      );
    }
  }

  // ==================== SCHEDULES ====================

  @Get('schedules')
  async getSchedules(@Req() req: any, @Query() query: any): Promise<any[]> {
    const schoolId = req.user.schoolId;
    return await this.adminService.getSchedules(schoolId, query);
  }

  @Post('schedules')
  async createSchedule(@Req() req: any, @Body() scheduleData: any): Promise<any> {
    const schoolId = req.user.schoolId;
    const createdBy = req.user._id.toString();
    return await this.adminService.createSchedule(schoolId, createdBy, scheduleData);
  }

  @Put('schedules/:id')
  async updateSchedule(@Req() req: any, @Param('id') id: string, @Body() updateData: any): Promise<any> {
    const schoolId = req.user.schoolId;
    return await this.adminService.updateSchedule(schoolId, id, updateData);
  }

  @Delete('schedules/:id')
  async deleteSchedule(@Req() req: any, @Param('id') id: string): Promise<any> {
    const schoolId = req.user.schoolId;
    return await this.adminService.deleteSchedule(schoolId, id);
  }

  // ==================== CLUBS ====================

  @Get('clubs')
  async getSchoolClubs(@Req() req: any, @Query('page') page: string = '1', @Query('limit') limit: string = '10', @Query('schoolId') querySchoolId?: string, @Query('type') type?: string, @Query('search') search?: string) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    // Build filters object
    const filters: any = { isActive: true };
    if (type && type !== 'all') {
      filters.type = type;
    }
    if (search) {
      filters.search = search;
    }
    // Return only active clubs (soft deleted clubs are filtered out)
    return await this.clubService.findAll(schoolId, filters, pageNum, limitNum);
  }

  @Get('clubs/names')
  async getSchoolClubNames(@Req() req: any, @Res() res: any) {
    const schoolId = req.user.schoolId || req.query.schoolId;

    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.clubService.getSchoolClubNames(schoolId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to fetch club names',
        null
      );
    }
  }

  // CSV export alias used by frontend admin page
  @Get('clubs/export')
  async exportSchoolClubsCsv(@Req() req: any, @Res() res: any) {
    const schoolId = req.user.schoolId;
    const result = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'summary' });

    res.setHeader('Content-Type', result.contentType || 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    return res.send(result.data);
  }

  @Get('clubs/analytics')
  async getClubAnalytics(@Req() req: any, @Query('range') range?: string, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be from query parameter (required)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    return await this.clubService.getSchoolClubAnalytics(schoolId, range || '30d');
  }

  @Get('clubs/attendance')
  async getClubsForAttendance(@Req() req: any, @Query('sessions') sessions?: string, @Query('clubId') clubId?: string, @Query('search') search?: string, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be from query parameter (optional for viewing all)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || undefined) : req.user.schoolId;

    // If sessions query param is present, return attendance sessions
    if (sessions === 'true') {
      // For super-admin, if schoolId is undefined, fetch all sessions
      // For admin, schoolId is required
      if (role === 'SUPER_ADMIN' && !schoolId) {
        // Fetch all sessions across all schools
        return await this.clubService.getAllAttendanceSessions('', { clubId, search });
      }
      return await this.clubService.getAllAttendanceSessions(schoolId, { clubId, search });
    }

    // Otherwise return clubs for attendance
    // For super-admin without schoolId, return empty array (they need to select a school)
    if (role === 'SUPER_ADMIN' && !schoolId) {
      return [];
    }
    return await this.clubService.getClubsForAttendance(schoolId);
  }

  @Get('clubs/attendance/:clubId/students')
  async getClubMembersForAttendance(@Param('clubId') clubId: string, @Req() req: any, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be from query parameter (required)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;

    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    console.log('getClubMembersForAttendance called with:', { clubId, schoolId });

    return await this.clubService.getClubMembersForAttendance(clubId, schoolId);
  }

  @Get('clubs/attendance/:clubId/:date')
  async getAttendanceSessionDetails(@Param('clubId') clubId: string, @Param('date') date: string, @Req() req: any, @Query('schoolId') querySchoolId?: string) {
    try {
      const role = req.user.role;
      // For SUPER_ADMIN, schoolId must be from query parameter (required)
      // For ADMIN, use their schoolId
      const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;

      if (!schoolId) {
        throw new BadRequestException('School ID is required');
      }

      console.log('getAttendanceSessionDetails called with:', { clubId, date, dateType: typeof date, dateLength: date?.length, schoolId });
      // NestJS automatically decodes URL parameters, so date should already be decoded
      return await this.clubService.getAttendanceSessionDetails(clubId, date, schoolId);
    } catch (error) {
      console.error('Error in getAttendanceSessionDetails controller:', error);
      throw error;
    }
  }

  @Get('clubs/announcements/stats')
  async getAnnouncementsStats(@Req() req: any) {
    const schoolId = req.user.schoolId;
    return await this.clubService.getAnnouncementsStats(schoolId);
  }

  @Get('clubs/announcements')
  async getAllClubAnnouncements(@Req() req: any, @Query() query: any) {
    console.log('Controller: Getting all club announcements for schoolId:', req.user.schoolId);
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be from query parameter (optional)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || undefined) : req.user.schoolId;
    console.log('Controller: Query:', query);
    console.log('Controller: Getting school announcements for schoolId:', schoolId);
    return await this.clubService.getSchoolAnnouncements(schoolId, query);
  }

  @Post('clubs/announcements')
  async createClubAnnouncement(@Body() announcementData: any, @Req() req: any) {
    const role = req.user.role;
    const createdBy = req.user._id?.toString() || req.user.userId;
    announcementData.createdBy = createdBy;
    // For SUPER_ADMIN, schoolId must be in announcementData (from frontend)
    // For ADMIN, use their schoolId
    if (role !== 'SUPER_ADMIN') {
      announcementData.schoolId = req.user.schoolId;
    }
    // Ensure schoolId is provided for super-admin
    if (!announcementData.schoolId) {
      throw new BadRequestException('School ID is required');
    }
    // Ensure createdBy is set
    if (!announcementData.createdBy) {
      throw new BadRequestException('User ID is required');
    }
    console.log('\n🔵 ========== CREATING CLUB ANNOUNCEMENT (ADMIN) ==========');
    console.log('📋 Announcement Data:', JSON.stringify({
      clubId: announcementData.clubId,
      title: announcementData.title,
      content: announcementData.content,
      scheduledAt: announcementData.scheduledAt,
      scheduledFor: announcementData.scheduledFor,
      eventDate: announcementData.eventDate,
      targetAudience: announcementData.targetAudience
    }, null, 2));
    
    const announcement = await this.clubService.createAnnouncement(announcementData, role, createdBy);
    
    console.log('✅ Announcement created successfully with ID:', (announcement as any)._id.toString());
    console.log('✅ Announcement object received from service:', {
      _id: (announcement as any)._id?.toString(),
      title: (announcement as any).title,
      clubId: (announcement as any).clubId?.toString()
    });
    
    // ALWAYS send email notifications immediately after announcement creation
    // (unless explicitly scheduled for future)
    const savedAnnouncement = announcement as any;
    
    // Check if announcement is scheduled for future (only skip emails if it's actually scheduled)
    const scheduledAt = savedAnnouncement.scheduledAt || announcementData.scheduledAt;
    const scheduledFor = savedAnnouncement.scheduledFor || announcementData.scheduledFor;
    const eventDate = savedAnnouncement.eventDate || announcementData.eventDate;
    
    // Only consider it scheduled if there's a future date
    let isScheduled = false;
    if (scheduledAt || scheduledFor || eventDate) {
      const scheduledDate = scheduledAt || scheduledFor || eventDate;
      const scheduledDateTime = new Date(scheduledDate);
      const now = new Date();
      // Only skip if scheduled for future (more than 1 minute from now)
      isScheduled = scheduledDateTime > now && (scheduledDateTime.getTime() - now.getTime()) > 60000;
    }
    
    console.log('\n📧 ========== CHECKING IF EMAIL NOTIFICATION SHOULD BE SENT ==========');
    console.log(`📋 Announcement ID: ${savedAnnouncement._id.toString()}`);
    console.log(`📋 Club ID: ${announcementData.clubId}`);
    console.log(`📋 scheduledAt: ${scheduledAt || 'null'}`);
    console.log(`📋 scheduledFor: ${scheduledFor || 'null'}`);
    console.log(`📋 eventDate: ${eventDate || 'null'}`);
    console.log(`📋 Is Scheduled (future): ${isScheduled ? 'YES (will not send now)' : 'NO (sending now)'}`);
    
    // ALWAYS attempt to send emails unless explicitly scheduled for future
    if (!isScheduled) {
      console.log('\n📧 ========== TRIGGERING EMAIL NOTIFICATION FOR ANNOUNCEMENT ==========');
      console.log(`📋 Announcement ID: ${savedAnnouncement._id.toString()}`);
      console.log(`📋 Club ID: ${announcementData.clubId}`);
      console.log(`📋 Created By: ${createdBy}`);
      
      try {
        console.log('📤 Calling notifyMembersOfAnnouncement...');
        const notificationResult = await this.clubService.notifyMembersOfAnnouncement(
          announcementData.clubId,
          savedAnnouncement._id.toString(),
          createdBy
        );
        console.log('✅ Email notification completed:', JSON.stringify(notificationResult, null, 2));
      } catch (notificationError: any) {
        console.error('❌ Error sending announcement notifications:', notificationError);
        console.error('❌ Error details:', notificationError?.message);
        console.error('❌ Error stack:', notificationError?.stack);
        // Don't fail the announcement creation if notification fails
      }
    } else {
      console.log('⏰ Announcement is scheduled for future. Emails will not be sent now.');
    }
    
    return announcement;
  }

  @Patch('clubs/announcements/:id')
  async updateClubAnnouncement(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    const role = req.user.role;
    const updatedBy = req.user._id?.toString() || req.user.userId;
    // For SUPER_ADMIN, schoolId can be undefined (they can update any announcement)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return await this.clubService.updateAnnouncement(id, updateData, schoolId, role, updatedBy);
  }

  @Delete('clubs/announcements/:id')
  async deleteClubAnnouncement(@Param('id') id: string, @Req() req: any) {
    const role = req.user.role;
    const deletedBy = req.user._id?.toString() || req.user.userId;
    // For SUPER_ADMIN, schoolId can be undefined (they can delete any announcement)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return await this.clubService.deleteAnnouncement(id, schoolId, role, deletedBy);
  }

  // Club Events Endpoints - Must be before parameterized routes like clubs/:id
  @Get('clubs/events')
  async getClubEvents(@Req() req: any, @Query() query: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be from query parameter (optional)
    // For ADMIN, use their schoolId
    let schoolId: string | undefined;
    if (role === 'SUPER_ADMIN') {
      // Filter out empty strings, 'all', or invalid values
      const querySchoolId = query.schoolId;
      if (querySchoolId && querySchoolId !== '' && querySchoolId !== 'all') {
        schoolId = querySchoolId;
      }
    } else {
      schoolId = req.user.schoolId;
    }
    return await this.clubService.getSchoolEvents(schoolId, query);
  }

  @Post('clubs/events')
  async createClubEvent(@Body() eventData: any, @Req() req: any) {
    try {
      const role = req.user.role;
      const createdBy = req.user._id?.toString() || req.user.userId;
      eventData.createdBy = createdBy;
      // For SUPER_ADMIN, schoolId must be in eventData (from frontend)
      // For ADMIN, use their schoolId
      if (role !== 'SUPER_ADMIN') {
        eventData.schoolId = req.user.schoolId;
      }
      // Ensure schoolId is provided for super-admin
      if (!eventData.schoolId) {
        throw new BadRequestException('School ID is required');
      }
      return await this.clubService.createEvent(eventData, role, createdBy);
    } catch (error) {
      console.error('Error creating event:', error);
      throw error;
    }
  }

  @Get('clubs/events/:id')
  async getClubEventById(@Param('id') id: string, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be undefined (they can view any event)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return await this.clubService.getEventById(id, schoolId);
  }

  @Patch('clubs/events/:id')
  async updateClubEvent(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be undefined (they can update any event)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    const updatedBy = req.user._id?.toString() || req.user.userId;
    return await this.clubService.updateEvent(id, updateData, schoolId, updatedBy, role);
  }

  @Delete('clubs/events/:id')
  async deleteClubEvent(@Param('id') id: string, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be undefined (they can delete any event)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return await this.clubService.deleteEvent(id, schoolId, role);
  }

  @Get('clubs/:clubId/events')
  async getEventsByClub(@Param('clubId') clubId: string, @Req() req: any, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be from query parameter (required)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;

    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    return await this.clubService.getClubEvents(clubId, schoolId);
  }

  @Post('clubs/attendance')
  async recordClubAttendance(@Body() attendanceData: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be in attendanceData (from frontend)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (attendanceData.schoolId || req.user.schoolId) : req.user.schoolId;
    const recordedBy = req.user._id?.toString() || req.user.userId;

    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    return await this.clubService.recordAttendance(attendanceData, recordedBy, schoolId, role);
  }

  @Put('clubs/attendance')
  async updateClubAttendance(@Body() attendanceData: any, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be in attendanceData (from frontend)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (attendanceData.schoolId || req.user.schoolId) : req.user.schoolId;
    const recordedBy = req.user._id?.toString() || req.user.userId;

    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }

    return await this.clubService.recordAttendance(attendanceData, recordedBy, schoolId, role);
  }

  // Get all memberships (for super-admin with optional schoolId filter) - Must be before clubs/:id
  @Get('clubs/memberships/all')
  async getAllMemberships(@Req() req: any, @Query() query: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be from query parameter
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || undefined) : req.user.schoolId;
    return await this.clubService.getAllMemberships(schoolId, {
      status: query.status || 'approved',
      role: query.role,
      search: query.search,
      clubId: query.clubId
    });
  }

  // Get all pending requests (for super-admin with optional schoolId filter) - Must be before clubs/:id
  @Get('clubs/memberships/pending/all')
  async getAllPendingRequests(@Req() req: any, @Query() query: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be from query parameter
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (query.schoolId || undefined) : req.user.schoolId;
    return await this.clubService.getAllPendingRequests(schoolId, {
      role: query.role,
      search: query.search,
      clubId: query.clubId
    });
  }

  @Get('clubs/:id')
  async getClubById(@Param('id') id: string, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be undefined (they can view any club)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return await this.clubService.findOneWithDetails(id, schoolId);
  }

  @Get('clubs/details/:id')
  async getClubDetails(@Param('id') id: string, @Req() req: any) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId can be undefined (they can view any club)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? undefined : req.user.schoolId;
    return await this.clubService.findOneWithDetails(id, schoolId);
  }

  @Post('clubs')
  async createClub(@Req() req: any, @Body() clubData: any) {
    const role = req.user.role;
    let schoolId = role === 'SUPER_ADMIN' ? (clubData.schoolId || req.user.schoolId) : req.user.schoolId;
    schoolId = new Types.ObjectId(schoolId);
    const createdBy = req.user._id?.toString() || req.user.userId;
    clubData.schoolId = schoolId;
    clubData.createdBy = createdBy;
    return await this.clubService.create(clubData, role, createdBy);
  }

  @Put('clubs/:id')
  async updateClub(@Param('id') id: string, @Body() updateData: any, @Req() req: any) {
    const role = req.user.role;
    const updatedBy = req.user._id?.toString() || req.user.userId;
    return await this.clubService.update(id, updateData, role, updatedBy);
  }

  @Delete('clubs/:id')
  async deleteClub(@Param('id') id: string, @Req() req: any) {
    const role = req.user.role;
    const deletedBy = req.user._id?.toString() || req.user.userId;
    return await this.clubService.remove(id, role, deletedBy);
  }

  // Club membership oversight
  @Get('clubs/:id/membership/requests')
  async getPendingMembershipRequests(@Param('id') id: string) {
    return await this.clubService.getPendingRequests(id);
  }

  // Override membership decisions (admin privilege)
  @Put('clubs/:clubId/membership/:membershipId/override')
  async overrideMembershipDecision(
    @Param('clubId') clubId: string,
    @Param('membershipId') membershipId: string,
    @Body() overrideData: { action: 'approve' | 'reject'; reason: string; overriddenBy: string }
  ) {
    if (overrideData.action === 'approve') {
      return await this.clubService.approveMembership(membershipId, overrideData.overriddenBy);
    } else {
      return await this.clubService.rejectMembership(membershipId, overrideData.overriddenBy, overrideData.reason);
    }
  }

  // Export club reports
  @Get('clubs/reports/activity')
  async getActivityReport(@Req() req: any, @Res() res: any, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be from query parameter (required)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required',
        error: 'Bad Request'
      });
    }
    try {
      const result = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'activity' });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export activity report',
        error: error.message
      });
    }
  }

  @Get('clubs/reports/membership')
  async getMembershipReport(@Req() req: any, @Res() res: any, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be from query parameter (required)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required',
        error: 'Bad Request'
      });
    }
    try {
      const result = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'membership' });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export membership report',
        error: error.message
      });
    }
  }

  @Get('clubs/reports/performance')
  async getPerformanceReport(@Req() req: any, @Res() res: any, @Query('schoolId') querySchoolId?: string) {
    const role = req.user.role;
    // For SUPER_ADMIN, schoolId must be from query parameter (required)
    // For ADMIN, use their schoolId
    const schoolId = role === 'SUPER_ADMIN' ? (querySchoolId || req.user.schoolId) : req.user.schoolId;
    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required',
        error: 'Bad Request'
      });
    }
    try {
      const result = await this.clubService.exportClubReport(schoolId, { format: 'csv', type: 'performance' });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
      return res.send(result.data);
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export performance report',
        error: error.message
      });
    }
  }

  @Get('clubs/reports/export')
  async exportClubReport(
    @Req() req: any,
    @Res() res: any,
    @Query('format') format: string = 'csv',
    @Query('type') type: string = 'general'
  ) {
    const schoolId = req.user.schoolId;

    try {
      const result = await this.clubService.exportClubReport(schoolId, { format, type });

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
        return res.send(result.data);
      } else {
        // Return JSON for other formats or errors
        return res.json(result);
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export club report',
        error: error.message
      });
    }
  }

  // ==================== HONOR ROLL ====================

  @Get('honor-roll/criteria')
  async getHonorRollCriteria(@Req() req: any, @Query() query: any) {
    const schoolId = req.user.schoolId;
    return await this.adminService.getHonorRollCriteria(schoolId, query);
  }

  @Post('honor-roll/criteria')
  async createHonorRollCriteria(@Req() req: any, @Body() criteriaData: any) {
    const schoolId = req.user.schoolId;
    const createdBy = req.user._id.toString();
    return await this.adminService.createHonorRollCriteria(schoolId, createdBy, criteriaData);
  }

  @Put('honor-roll/criteria/:id')
  async updateHonorRollCriteria(@Req() req: any, @Param('id') id: string, @Body() updateData: any) {
    const schoolId = req.user.schoolId;
    const updatedBy = req.user._id.toString();
    return await this.adminService.updateHonorRollCriteria(schoolId, updatedBy, id, updateData);
  }

  @Delete('honor-roll/criteria/:id')
  async deleteHonorRollCriteria(@Req() req: any, @Param('id') id: string) {
    const schoolId = req.user.schoolId;
    const deletedBy = req.user._id.toString();
    return await this.adminService.deleteHonorRollCriteria(schoolId, deletedBy, id);
  }

  @Get('honor-roll/awards')
  async getHonorRollAwards(@Req() req: any, @Query() query: any) {
    const schoolId = req.user.schoolId;
    return await this.adminService.getHonorRollAwards(schoolId, query);
  }

  @Post('honor-roll/calculate')
  async calculateHonorRoll(@Req() req: any, @Body() calculationData: { academicYear: string; markingPeriod: string }) {
    const schoolId = req.user.schoolId;
    const calculatedBy = req.user._id.toString();
    return await this.adminService.calculateHonorRoll(schoolId, calculatedBy, calculationData.academicYear, calculationData.markingPeriod);
  }

  @Get('honor-roll/report')
  async getHonorRollReport(@Req() req: any, @Query() query: any) {
    const schoolId = req.user.schoolId;
    return await this.adminService.getHonorRollReport(schoolId, query);
  }

  // ==================== ACTIVITIES ====================

  @Get('activities')
  async getActivities(
    @Req() req: any,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('title') title?: string,
    @Query('performBy') performBy?: string,
    @Query('className') className?: string,
    @Query('section') section?: string,
    @Query('type') type?: string,
  ) {
    const adminId = req.user._id.toString();
    const schoolId = req.user.schoolId;

    // Get activities performed by this admin
    return this.activityService.findAll(
      Number(page) || 1,
      Number(limit) || 10,
      title,
      performBy,
      className,
      section,
      type,
      adminId, // actorId - filter by this admin
      'admin', // role
    );
  }

  // ==================== LESSON PLANS ====================

  @Get('lesson-plans')
  async getLessonPlans(@Req() req: any, @Query() query: any) {
    // For super admin: use schoolId from query if provided, otherwise show all schools (pass null)
    // For admin: use their schoolId
    let schoolId = req.user.schoolId;
    if (req.user.role === 'SUPER_ADMIN') {
      if (query.schoolId && query.schoolId !== 'all') {
        // Super admin can filter by schoolId from query
        schoolId = query.schoolId;
      } else {
        // Super admin wants to see all schools
        schoolId = null;
      }
    }
    return await this.adminService.getLessonPlans(schoolId, query, req.user.role);
  }

  @Get('lesson-plans/stats')
  async getLessonPlanStats(@Req() req: any, @Query('schoolId') schoolIdQuery?: string) {
    // For super admin: use schoolId from query if provided, otherwise show all schools (pass null)
    // For admin: use their schoolId
    let schoolId = req.user.schoolId;
    if (req.user.role === 'SUPER_ADMIN') {
      if (schoolIdQuery && schoolIdQuery !== 'all') {
        schoolId = schoolIdQuery;
      } else {
        // Super admin wants to see all schools
        schoolId = null;
      }
    }
    return await this.adminService.getLessonPlanStats(schoolId, req.user.role);
  }



  @Get('lesson-plans/pending')
  async getPendingLessonPlans(@Req() req: any) {
    const schoolId = req.user.schoolId;
    return await this.adminService.getPendingLessonPlans(schoolId);
  }

  @Get('lesson-plans/can-approve')
  async getCanApproveLessonPlans(@Req() req: any) {
    return await this.adminService.getCanApproveLessonPlans(req.user._id.toString(), req.user.role);
  }

  @Post('lesson-plans/:id/approve')
  async approveLessonPlan(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { comments?: string }
  ) {
    const reviewedBy = req.user._id.toString();
    return await this.adminService.approveLessonPlan(id, body.comments || '', reviewedBy, req.user);
  }

  @Post('lesson-plans/:id/reject')
  async rejectLessonPlan(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { feedback: string[] }
  ) {
    const reviewedBy = req.user._id.toString();
    return await this.adminService.rejectLessonPlan(id, body.feedback, reviewedBy, req.user);
  }

  @Post('lesson-plans/:id/request-revision')
  async requestLessonPlanRevision(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { comments: string[] }
  ) {
    const reviewedBy = req.user._id.toString();
    return await this.adminService.requestLessonPlanRevision(id, body.comments, reviewedBy, req.user);
  }

  // ==================== UTILITIES ====================

  @Get('school-info')
  async getSchoolInfo(@Req() req: any, @Res() res: any) {
    const schoolId = req.user.schoolId || req.query.schoolId;
    if (!schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }
    try {
      const result = await this.adminService.getSchoolInfo(schoolId);

      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to fetch school info',
        null
      );
    }
  }

  @Get('countries')
  async getCountries() {
    return await this.adminService.getCountries();
  }

  // ==================== SECRETARY MANAGEMENT ====================
  // Note: ADMIN and SECRETARY can manage secretaries

  @Get('secretaries')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getSecretaries(@Req() req: any, @Res() res: Response, @Query() query: any) {
    const role = req.user.role;
    const schoolId = req.user.schoolId;

    try {
      const result = await this.adminService.getSecretaries(role, schoolId, query);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch secretaries',
        null
      );
    }
  }

  @Post('secretaries')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async createSecretary(@Req() req: any, @Res() res: Response, @Body() secretaryData: any) {
    const createdBy = req.user._id.toString();
    const role = req.user.role;
    let schoolId = req.user.schoolId;

    // For SUPER_ADMIN, allow schoolId to be provided in request body
    if (role === 'SUPER_ADMIN' && secretaryData.schoolId) {
      schoolId = secretaryData.schoolId;
    }

    if (!schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.createSecretary(createdBy, role, secretaryData, schoolId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to create secretary',
        null
      );
    }
  }

  @Put('secretaries/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async updateSecretary(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Body() updateData: any) {
    const role = req.user.role;
    const roleId = req.user._id.toString();
    const schoolId = req.user.schoolId;

    // For ADMIN, schoolId is required. For SUPER_ADMIN, it's optional
    if (role !== 'SUPER_ADMIN' && !schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.updateSecretary(id, updateData, schoolId, role, roleId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to update secretary',
        null
      );
    }
  }

  @Delete('secretaries/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async deleteSecretary(@Req() req: any, @Res() res: Response, @Param('id') id: string) {
    const role = req.user.role;
    const roleId = req.user._id.toString();
    const schoolId = req.user.schoolId;

    // For ADMIN, schoolId is required. For SUPER_ADMIN, it's optional
    if (role !== 'SUPER_ADMIN' && !schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    try {
      const result = await this.adminService.deleteSecretary(id, schoolId, role, roleId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to delete secretary',
        null
      );
    }
  }

  @Put('secretaries/:id/change-password')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async changeSecretaryPassword(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Body() passwordData: any) {
    const role = req.user.role;
    const roleId = req.user._id.toString();
    const schoolId = req.user.schoolId;

    // For ADMIN, schoolId is required. For SUPER_ADMIN, it's optional
    if (role !== 'SUPER_ADMIN' && !schoolId) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
    }

    if (!passwordData.password || passwordData.password.length < 8) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'Password must be at least 8 characters long', null);
    }

    if (passwordData.password !== passwordData.confirmPassword) {
      return customResponse(res as any, HttpStatus.BAD_REQUEST, 'Passwords do not match', null);
    }

    try {
      const result = await this.adminService.changeSecretaryPassword(id, passwordData.password, schoolId, role, roleId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to change secretary password',
        null
      );
    }
  }

  // ==================== REPORTS MANAGEMENT ====================

  private normalizeSchoolId(req: any): string | null {
    const raw = req?.user?.schoolId;
    if (raw == null) return null;
    return typeof raw === 'object' && raw._id != null ? String(raw._id) : String(raw);
  }

  @Get('reports')
  @Roles(UserRole.ADMIN)
  async getAllReports(
    @Req() req: any,
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('schoolId') schoolIdQuery?: string
  ) {
    try {
      const adminId = req.user._id.toString();
      let schoolId = this.normalizeSchoolId(req);
      if (!schoolId && schoolIdQuery) schoolId = schoolIdQuery;
      if (!schoolId) {
        schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
      }
      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;

      const result = await this.adminService.getAllReports(schoolId, adminId, pageNum, limitNum, status, type);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to fetch reports',
        null
      );
    }
  }

  @Post('reports')
  @Roles(UserRole.ADMIN)
  async generateReport(
    @Req() req: any,
    @Body() reportData: any,
    @Res() res: Response
  ) {
    try {
      const adminId = req.user._id.toString();
      let schoolId = this.normalizeSchoolId(req);
      if (!schoolId && reportData?.schoolId) {
        const raw = reportData.schoolId;
        schoolId = typeof raw === 'object' && raw != null && raw._id != null ? String(raw._id) : String(raw);
      }
      if (!schoolId) {
        schoolId = await this.adminService.getSchoolIdForAdmin(adminId);
      }
      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      const adminInfo = {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email
      };

      const result = await this.adminService.generateReport(schoolId, adminId, adminInfo, reportData);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to generate report',
        null
      );
    }
  }

  @Post('reports/:id/execute')
  @Roles(UserRole.ADMIN)
  async executeReport(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { format?: string },
    @Res() res: Response
  ) {
    try {
      let schoolId = this.normalizeSchoolId(req);
      const adminId = req.user._id.toString();

      let report = null;
      if (schoolId) {
        const reportsResult = await this.adminService.getAllReports(schoolId, adminId, 1, 1000);
        report = reportsResult.data?.reports?.find((r: any) => r._id === id);
      }
      if (!report) {
        const reportById = this.adminService.getReportById(id);
        if (reportById?.parameters?.schoolIds?.length) {
          schoolId = String(reportById.parameters.schoolIds[0]);
          report = reportById;
        }
      }

      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required to execute report', null);
      }
      if (!report) {
        return customResponse(res as any, HttpStatus.NOT_FOUND, 'Report not found', null);
      }

      // Update report status to completed and generate content
      const adminInfo = {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email
      };

      // Execute the report - generates content and updates status
      const updateResult = await this.adminService.executeReport(
        id,
        schoolId,
        adminId,
        adminInfo,
        report
      );

      return customResponse(res as any, updateResult.statusCode, updateResult.message, updateResult.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to execute report',
        null
      );
    }
  }

  @Get('reports/executions/:executionId')
  @Roles(UserRole.ADMIN)
  async getExecutionStatus(
    @Param('executionId') executionId: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const schoolId = this.normalizeSchoolId(req);
      const adminId = req.user._id.toString();

      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      // Get the report
      const reportsResult = await this.adminService.getAllReports(schoolId, adminId, 1, 1000);
      const report = reportsResult.data?.reports?.find((r: any) => r._id === executionId);

      if (!report) {
        return customResponse(res as any, HttpStatus.NOT_FOUND, 'Report execution not found', null);
      }

      // Build full download URL
      const downloadUrl = `/admin/reports/${executionId}/download`;
      
      return customResponse(res as any, HttpStatus.OK, 'Execution status retrieved', {
        executionId: executionId,
        status: report.status || 'completed',
        fileUrl: downloadUrl,
        error: report.status === 'failed' ? 'Report generation failed' : null
      });
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to get execution status',
        null
      );
    }
  }

  @Get('reports/:id/download')
  @Roles(UserRole.ADMIN)
  async downloadReport(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      let schoolId = this.normalizeSchoolId(req);
      if (!schoolId) {
        const reportById = this.adminService.getReportById(id);
        if (reportById?.parameters?.schoolIds?.length) schoolId = String(reportById.parameters.schoolIds[0]);
      }
      if (!schoolId) {
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'School ID is required' });
      }

      const reportContent = await this.adminService.downloadReport(id, schoolId);

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report-${id}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Pragma', 'no-cache');

      return res.send(reportContent);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof UnauthorizedException) {
        return res.status(HttpStatus.NOT_FOUND).json({ message: error.message });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: error?.message || 'Failed to download report' });
    }
  }

  @Delete('reports/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteReport(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const schoolId = this.normalizeSchoolId(req);
      const adminId = req.user._id.toString();

      if (!schoolId) {
        return customResponse(res as any, HttpStatus.BAD_REQUEST, 'School ID is required', null);
      }

      const result = await this.adminService.deleteReport(id, schoolId, adminId);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to delete report',
        null
      );
    }
  }

  // ==================== SYSTEM ANALYTICS ====================

  @Get('analytics/top-schools')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getTopPerformingSchools(@Query('metric') metric?: string, @Query('limit') limit?: string) {
    return await this.adminService.getTopPerformingSchools(metric || 'attendance', parseInt(limit) || 10);
  }

  @Get('analytics/grade-averages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getGradeAverages(@Req() req: any, @Query('schoolId') schoolId?: string) {
    const role = req.user.role;
    const targetSchoolId = role === 'SUPER_ADMIN' ? (schoolId || req.user.schoolId) : req.user.schoolId;
    return await this.adminService.getGradeAverages(targetSchoolId);
  }

  @Get('analytics/attendance-trends')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAttendanceTrends(@Req() req: any, @Query('days') days?: string, @Query('schoolId') schoolId?: string) {
    const role = req.user.role;
    const targetSchoolId = role === 'SUPER_ADMIN' ? (schoolId || req.user.schoolId) : req.user.schoolId;
    return await this.adminService.getAttendanceTrends(targetSchoolId, parseInt(days) || 30);
  }

}