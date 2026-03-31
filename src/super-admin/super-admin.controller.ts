import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
  ConflictException,
  Req,
} from '@nestjs/common';
import { FileInterceptor, AnyFilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { SuperAdminService } from './super-admin.service';
import { AdminService } from '../admin/admin.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/user.dto';
import { CreateAdminDto, UpdateAdminDto, AdminQueryDto } from './dto/admin.dto';
// import { CreateStudentDto } from './dto/create-student.dto';
import { CreateSchoolDto, UpdateSchoolDto } from './dto/school.dto';
import { CreateRoleDto, UpdateRoleDto, CreatePermissionDto } from './dto/role.dto';
import { CreateAcademicTermDto, UpdateAcademicTermDto } from './dto/academic-term.dto';
import { multerOptionsForXlxs, multerOptions, UploadedFileType } from '../../utils/multer.config';
import { customResponse } from 'src/utils/responses';
// import { StudentValidationService } from './validation/student.validation';
import { CreateParentDto } from './dto/create-parent.dto';
import { CreateNurseDto } from '../admin/dto/create-nurse.dto';
import { UpdateNurseDto } from '../admin/dto/update-nurse.dto';
import { UserRole } from '../auth/schemas/user.schema';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../user/guards/roles.guard';
// import { Roles } from '../user/guards/roles.decorator';

@Controller('super-admin')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('SuperAdmin') // We'll create this role
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly adminService: AdminService
  ) { }

  // Test endpoint to check if module is working
  @Get('test')
  test() {
    console.log('=== TEST ENDPOINT HIT ===');
    return { message: 'Super Admin module is working', timestamp: new Date().toISOString() };
  }

  // Add a simple POST test endpoint
  @Post('test-post')
  testPost(@Body() body: any) {
    console.log('=== TEST POST ENDPOINT HIT ===');
    console.log('Body received:', body);
    return { message: 'POST test successful', receivedData: body };
  }

  // Countries endpoint for super admin
  @Get('countries')
  async getCountries() {
    return await this.superAdminService.getCountries();
  }

  // ==================== RELATIONSHIP HELPERS ====================

  @Get('students/for-parent-selection')
  async getStudentsForParentSelection(@Query('schoolId') schoolId?: string) {
    return await this.superAdminService.getStudentsForParentSelection(schoolId);
  }

  @Get('parents/for-student-selection')
  async getParentsForStudentSelection(@Query('schoolId') schoolId?: string) {
    return await this.superAdminService.getParentsForStudentSelection(schoolId);
  }

  @Get('parent/by-email/:email')
  async getParentByEmail(@Param('email') email: string) {
    try {
      // URL decode the email parameter (handles %40 -> @)
      let decodedEmail = email;
      try {
        decodedEmail = decodeURIComponent(email);
      } catch (decodeError) {
        console.warn('Error decoding email, using original:', decodeError);
        decodedEmail = email;
      }
      
      // Use AdminService to find parent by email (it has access to User model)
      const parent = await this.adminService.findParentByEmail(decodedEmail);
      
      // If parent not found, return 404 with proper message
      if (!parent) {
        return {
          success: false,
          statusCode: 404,
          message: `Parent with email ${decodedEmail} not found`,
          data: null
        };
      }
      
      // Return parent with ID
      return {
        success: true,
        statusCode: 200,
        message: 'Parent found',
        data: parent
      };
    } catch (error: any) {
      // Log error details
      console.error('Error finding parent by email:', {
        email,
        error: error?.message,
        stack: error?.stack
      });
      
      return {
        success: false,
        statusCode: 500,
        message: error?.message || 'Error finding parent',
        data: null
      };
    }
  }

  // ==================== CUSTOMER MANAGEMENT ====================

  // Update the createStudent method
  // src/super-admin/super-admin.controller.ts
  // @Post('student')
  // async createStudent(@Res() res: Response, @Body() createStudentDto: CreateStudentDto) {
  //   try {
  //     const result = await this.superAdminService.createStudent(createStudentDto);

  //     return customResponse(
  //       res,
  //       result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST,
  //       result.message,
  //       result.data
  //     );
  //   } catch (error) {
  //     console.error('Error in createStudent controller:', error);

  //     // Handle DTO validation errors automatically
  //     if (error instanceof BadRequestException) {
  //       return customResponse(
  //         res,
  //         HttpStatus.BAD_REQUEST,
  //         error.message,
  //         null
  //       );
  //     }

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to create student',
  //       null
  //     );
  //   }
  // }

  // // src/super-admin/super-admin.controller.ts
  // // Add this method in SuperAdminController class

  // @Get('students')
  // async getStudents(@Res() res: Response, @Query() query: any) {
  //   try {
  //     const result = await this.superAdminService.getStudents(query);

  //     // Return students array and pagination info
  //     const responseData = result.data || {};

  //     return customResponse(
  //       res,
  //       result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST,
  //       result.message,
  //       responseData
  //     );
  //   } catch (error) {
  //     console.error('Error in getStudents controller:', error);

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to fetch students',
  //       null
  //     );
  //   }
  // }

  // @Get('students/:id')
  // async getStudentById(@Res() res: Response, @Param('id') id: string) {
  //   try {
  //     const result = await this.superAdminService.getStudentById(id);

  //     return customResponse(
  //       res,
  //       result.success ? HttpStatus.OK : HttpStatus.NOT_FOUND,
  //       result.message,
  //       result.data
  //     );
  //   } catch (error) {
  //     console.error('Error in getStudentById controller:', error);

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to fetch student details',
  //       null
  //     );
  //   }
  // }

  // @Put('student/:id')
  // async updateStudent(@Res() res: Response, @Param('id') id: string, @Body() updateData: any) {
  //   try {
  //     const result = await this.superAdminService.updateStudent(id, updateData);

  //     return customResponse(
  //       res,
  //       result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST,
  //       result.message,
  //       result.data
  //     );
  //   } catch (error) {
  //     console.error('Error in updateStudent controller:', error);

  //     if (error instanceof BadRequestException) {
  //       return customResponse(
  //         res,
  //         HttpStatus.BAD_REQUEST,
  //         error.message,
  //         null
  //       );
  //     }

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to update student',
  //       null
  //     );
  //   }
  // }

  // @Delete('student/:id')
  // async deleteStudent(@Res() res: Response, @Param('id') id: string) {
  //   try {
  //     const result = await this.superAdminService.deleteStudent(id);

  //     return customResponse(
  //       res,
  //       result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST,
  //       result.message,
  //       result.data
  //     );
  //   } catch (error) {
  //     console.error('Error in deleteStudent controller:', error);

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to delete student',
  //       null
  //     );
  //   }
  // }

  // @Get('students/export')
  // async exportStudents(@Res() res: Response, @Query('schoolId') schoolId?: string) {
  //   try {
  //     const result = await this.superAdminService.exportStudents(schoolId);

  //     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  //     res.setHeader('Content-Disposition', 'attachment; filename="students-export.xlsx"');

  //     return res.send(result.buffer);
  //   } catch (error) {
  //     console.error('Error in exportStudents controller:', error);

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to export students',
  //       null
  //     );
  //   }
  // }

  // @Post('students/bulk-upload')
  // @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  // async bulkUploadStudents(@Res() res: Response, @UploadedFile() file: UploadedFileType, @Body() body: any) {
  //   try {
  //     const result = await this.superAdminService.bulkUploadStudents(file, body.schoolId);

  //     return customResponse(
  //       res,
  //       result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST,
  //       result.message,
  //       result.data
  //     );
  //   } catch (error) {
  //     console.error('Error in bulkUploadStudents controller:', error);

  //     return customResponse(
  //       res,
  //       HttpStatus.INTERNAL_SERVER_ERROR,
  //       'Failed to upload students',
  //       null
  //     );
  //   }
  // }

  // ==================== PARENT MANAGEMENT ====================

  // Add this method in SuperAdminController class
  @Post('parents')
  async createParent(@Req() req: any, @Res() res: Response, @Body() createParentDto: CreateParentDto) {
    try {
      const actorId = req?.user?._id ? String(req.user._id) : undefined;
      // DTO validation happens automatically by NestJS
      const result = await this.superAdminService.createParent(createParentDto, actorId);

      return customResponse(
        res,
        result.success ? HttpStatus.OK : HttpStatus.BAD_REQUEST,
        result.message,
        result.data
      );
    } catch (error) {
      console.error('Error in createParent controller:', error);

      // Handle DTO validation errors
      if (error instanceof BadRequestException) {
        return customResponse(
          res,
          HttpStatus.BAD_REQUEST,
          error.message,
          null
        );
      }

      // Handle other errors
      return customResponse(
        res,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'Failed to create parent',
        null
      );
    }
  }

  // ==================== NURSE MANAGEMENT ====================

  @Post('nurses')
  @UseInterceptors(AnyFilesInterceptor(multerOptions))
  async createNurse(
    @Req() req: any,
    @Res() res: Response,
    @Body() nurseData: CreateNurseDto,
    @UploadedFiles() files: UploadedFileType[]
  ) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const actorId = req?.user?._id ? String(req.user._id) : undefined;

    if (!nurseData.schoolId) {
      return customResponse(
        res as any,
        HttpStatus.BAD_REQUEST,
        'School ID is required',
        null
      );
    }

    try {
      const result = await this.adminService.createNurse(actorId || 'SYSTEM', role, nurseData, nurseData.schoolId, files);

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
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    try {
      const result = await this.adminService.getNurses(role, query);

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
  async getNurseById(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query('schoolId') schoolId?: string) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
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
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const roleId = req?.user?._id ? String(req.user._id) : undefined;
    const schoolId = updateData.schoolId;

    try {
      const result = await this.adminService.updateNurse(id, updateData, role, roleId || 'SYSTEM', schoolId, files);
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
  async deleteNurse(@Req() req: any, @Res() res: Response, @Param('id') id: string, @Query('schoolId') schoolId?: string) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const roleId = req?.user?._id ? String(req.user._id) : undefined;
    try {
      const result = await this.adminService.deleteNurse(id, role, roleId || 'SYSTEM', schoolId);
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

  // ==================== USER MANAGEMENT ====================

  // ==================== SUPER ADMIN MANAGEMENT ====================

  @Post('manage/super-admins')
  async createSuperAdmin(
    @Req() req: any,
    @Res() res: Response,
    @Body() createAdminDto: CreateAdminDto,
  ) {
    const actor = {
      role: req?.user?.role || UserRole.SUPER_ADMIN,
      actorId: req?.user?._id ? String(req.user._id) : undefined,
    };

    try {
      const result = await this.superAdminService.createSuperAdmin(createAdminDto, actor);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to create super admin',
        null,
      );
    }
  }

  @Get('manage/super-admins')
  async getSuperAdmins(
    @Res() res: Response,
    @Query() query: AdminQueryDto,
  ) {
    try {
      const result = await this.superAdminService.getSuperAdmins(query);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch super admins',
        null,
      );
    }
  }

  @Get('manage/super-admins/:id')
  async getSuperAdminById(
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    try {
      const result = await this.superAdminService.getSuperAdminById(id);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch super admin',
        null,
      );
    }
  }

  @Put('manage/super-admins/:id')
  async updateSuperAdmin(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    const actor = {
      role: req?.user?.role || UserRole.SUPER_ADMIN,
      actorId: req?.user?._id ? String(req.user._id) : undefined,
    };

    try {
      const result = await this.superAdminService.updateSuperAdmin(id, updateAdminDto, actor);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to update super admin',
        null,
      );
    }
  }

  @Delete('manage/super-admins/:id')
  async deleteSuperAdmin(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const actor = {
      role: req?.user?.role || UserRole.SUPER_ADMIN,
      actorId: req?.user?._id ? String(req.user._id) : undefined,
    };

    try {
      const result = await this.superAdminService.deleteSuperAdmin(id, actor);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to delete super admin',
        null,
      );
    }
  }

  // ==================== ADMIN MANAGEMENT ====================

  @Post('admins')
  async createAdmin(
    @Req() req: any,
    @Res() res: Response,
    @Body() createAdminDto: CreateAdminDto,
  ) {
    const actor = {
      role: req?.user?.role || UserRole.SUPER_ADMIN,
      actorId: req?.user?._id ? String(req.user._id) : undefined,
    };

    try {
      const result = await this.superAdminService.createAdmin(createAdminDto, actor);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to create admin',
        null,
      );
    }
  }

  @Get('admins')
  async getAdmins(
    @Res() res: Response,
    @Query() query: AdminQueryDto,
  ) {
    try {
      const result = await this.superAdminService.getAdmins(query);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch admins',
        null,
      );
    }
  }

  @Get('admins/:id')
  async getAdminById(
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    try {
      const result = await this.superAdminService.getAdminById(id);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch admin',
        null,
      );
    }
  }

  @Put('admins/:id')
  async updateAdmin(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateAdminDto: UpdateAdminDto,
  ) {
    const actor = {
      role: req?.user?.role || UserRole.SUPER_ADMIN,
      actorId: req?.user?._id ? String(req.user._id) : undefined,
    };

    try {
      const result = await this.superAdminService.updateAdmin(id, updateAdminDto, actor);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to update admin',
        null,
      );
    }
  }

  @Delete('admins/:id')
  async deleteAdmin(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const actor = {
      role: req?.user?.role || UserRole.SUPER_ADMIN,
      actorId: req?.user?._id ? String(req.user._id) : undefined,
    };

    try {
      const result = await this.superAdminService.deleteAdmin(id, actor);
      return customResponse(res as any, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to delete admin',
        null,
      );
    }
  }

  @Post('users')
  async createUser(
    @Req() req: any,
    @Res() res: Response,
    @Body() createUserDto: CreateUserDto,
  ) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const actorId = req?.user?._id ? String(req.user._id) : undefined;

    try {
      const result = await this.superAdminService.createUser(createUserDto, { role, actorId });

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to create user',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to create user',
        null,
      );
    }
  }

  @Get('users')
  async getAllUsers(
    @Res() res: Response,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    try {
      console.log('📥 Controller received query params:', { page, limit, search, role, schoolId });
      const pageNum = page ? parseInt(page, 10) : 1;
      const limitNum = limit ? parseInt(limit, 10) : 10;
      const result = await this.superAdminService.getAllUsers(pageNum, limitNum, search, role, schoolId);
      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to fetch users',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch users',
        null,
      );
    }
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return await this.superAdminService.getUserById(id);
  }

  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return await this.superAdminService.updateUser(id, updateUserDto);
  }

  @Delete('users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id') id: string) {
    return await this.superAdminService.deleteUser(id);
  }

  @Post('users/:id/reset-password')
  async resetUserPassword(
    @Param('id') id: string,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return await this.superAdminService.resetUserPassword(id, resetPasswordDto);
  }

  @Post('users/bulk-update')
  async bulkUpdateUsers(
    @Body() body: { userIds: string[]; updateData: UpdateUserDto },
  ) {
    return await this.superAdminService.bulkUpdateUsers(body.userIds, body.updateData);
  }

  @Post('users/bulk-create')
  async bulkCreateUsers(@Body() body: { users: CreateUserDto[] }) {
    return await this.superAdminService.bulkCreateUsers(body.users);
  }

  @Get('users/export')
  async exportUsers(@Query('schoolId') schoolId?: string) {
    return await this.superAdminService.exportUsers(schoolId);
  }

  @Get('users/admins/active')
  async getActiveAdmins(@Res() res: Response) {
    try {
      const result = await this.superAdminService.getActiveAdmins();

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to fetch admins',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch admins',
        null,
      );
    }
  }

  @Post('users/bulk-upload')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async bulkUploadUsers(@UploadedFile() file: UploadedFileType) {
    return await this.superAdminService.bulkUploadUsers(file);
  }

  // ==================== SCHOOL MANAGEMENT ====================

  @Post('schools')
  async createSchool(
    @Req() req: any,
    @Res() res: Response,
    @Body() createSchoolDto: CreateSchoolDto,
  ) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const actorId = req?.user?._id ? String(req.user._id) : undefined;

    try {
      const result = await this.superAdminService.createSchool(createSchoolDto, { role, actorId });

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to create school',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to create school',
        null,
      );
    }
  }

  @Get('stats/schools')
  async getSchoolStats(@Res() res: Response) {
    try {
      const result = await this.superAdminService.getSchoolStats();

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to fetch school stats',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch school stats',
        null,
      );
    }
  }

  @Get('schools')
  async getAllSchools(
    @Res() res: Response,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string,
  ) {
    const pageNumber = Number.parseInt(page, 10);
    const limitNumber = Number.parseInt(limit, 10);

    try {
      const result = await this.superAdminService.getAllSchools(pageNumber, limitNumber, search);

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to fetch schools',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch schools',
        null,
      );
    }
  }

  @Get('schools/:id')
  async getSchoolById(
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    try {
      const result = await this.superAdminService.getSchoolById(id);

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to fetch school',
        result?.data ?? null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to fetch school',
        null,
      );
    }
  }

  @Put('schools/:id')
  async updateSchool(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateSchoolDto: UpdateSchoolDto,
  ) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const actorId = req?.user?._id ? String(req.user._id) : undefined;

    try {
      const result = await this.superAdminService.updateSchool(id, updateSchoolDto, { role, actorId });

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to update school',
        null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to update school',
        null,
      );
    }
  }

  @Delete('schools/:id')
  async deleteSchool(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const role = req?.user?.role || UserRole.SUPER_ADMIN;
    const actorId = req?.user?._id ? String(req.user._id) : undefined;

    try {
      const result = await this.superAdminService.deleteSchool(id, { role, actorId });

      return customResponse(
        res as any,
        result?.statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR,
        result?.message ?? 'Failed to delete school',
        null,
      );
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res as any,
        status,
        error?.message || 'Failed to delete school',
        null,
      );
    }
  }

  // ==================== ROLE & PERMISSION MANAGEMENT ====================

  @Post('roles')
  async createRole(@Body() createRoleDto: CreateRoleDto) {
    return await this.superAdminService.createRole(createRoleDto);
  }

  @Get('roles')
  async getAllRoles() {
    return await this.superAdminService.getAllRoles();
  }

  @Put('roles/:id')
  async updateRole(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return await this.superAdminService.updateRole(id, updateRoleDto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('id') id: string) {
    return await this.superAdminService.deleteRole(id);
  }

  @Post('permissions')
  async createPermission(@Body() createPermissionDto: CreatePermissionDto) {
    return await this.superAdminService.createPermission(createPermissionDto);
  }

  @Get('permissions')
  async getAllPermissions() {
    return await this.superAdminService.getAllPermissions();
  }

  // ==================== ACADEMIC YEAR & TERM MANAGEMENT ====================

  @Post('academic-terms')
  async createAcademicTerm(@Req() req: any, @Body() termData: any) {
    // Validate required fields with helpful messages
    if (!termData.name || (typeof termData.name === 'string' && termData.name.trim() === '')) {
      throw new BadRequestException({
        error: 'Validation Failed',
        message: 'Term name is required and cannot be empty',
        field: 'name'
      });
    }

    // SchoolId handling with clear intent:
    // 1. If schoolId explicitly provided (not empty) -> School-specific term
    // 2. If schoolId = 'global' or null explicitly -> Global term
    // 3. If schoolId is empty string -> Error (force explicit decision)
    if (termData.schoolId === '') {
      throw new BadRequestException({
        error: 'Validation Failed',
        message: 'School selection is required. Provide schoolId for school-specific term or use schoolId: "global" for global term',
        field: 'schoolId'
      });
    }

    // If schoolId is 'global' string, convert to null for storage
    if (termData.schoolId === 'global') {
      termData.schoolId = null;
      termData.isGlobal = true;
    } else if (termData.schoolId) {
      // School-specific term
      termData.isGlobal = false;
    } else {
      // No schoolId provided - default to global
      termData.schoolId = null;
      termData.isGlobal = true;
      console.log('⚠️ Creating GLOBAL term - no school specified');
    }

    if (!termData.startDate || (typeof termData.startDate === 'string' && termData.startDate.trim() === '')) {
      throw new BadRequestException({
        error: 'Validation Failed',
        message: 'Start date is required in ISO 8601 format (e.g., 2024-01-01)',
        field: 'startDate'
      });
    }
    if (!termData.endDate || (typeof termData.endDate === 'string' && termData.endDate.trim() === '')) {
      throw new BadRequestException({
        error: 'Validation Failed',
        message: 'End date is required in ISO 8601 format (e.g., 2024-06-30)',
        field: 'endDate'
      });
    }
    if (!termData.type || (typeof termData.type === 'string' && termData.type.trim() === '')) {
      throw new BadRequestException({
        error: 'Validation Failed',
        message: 'Type is required (semester, quarter, trimester, or term)',
        field: 'type'
      });
    }
    if (!termData.academicYear || (typeof termData.academicYear === 'string' && termData.academicYear.trim() === '')) {
      throw new BadRequestException({
        error: 'Validation Failed',
        message: 'Academic year is required (e.g., 2024-2025)',
        field: 'academicYear'
      });
    }
    
    return await this.superAdminService.createAcademicTerm(termData);
  }

  @Get('academic-terms')
  async getAllAcademicTerms(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('schoolId') schoolId?: string,
    @Query('academicYear') academicYear?: string,
    @Query('isActive') isActive?: string,
  ) {
    const filters: any = {};
    
    if (schoolId) {
      filters.schoolId = schoolId;
    }
    
    if (academicYear) {
      filters.academicYear = academicYear;
    }
    
    if (isActive) {
      filters.isActive = isActive === 'true';
    }

    return await this.superAdminService.getAllAcademicTerms(
      parseInt(page),
      parseInt(limit),
      filters
    );
  }

  @Put('academic-terms/:id')
  async updateAcademicTerm(@Param('id') id: string, @Body() updateData: UpdateAcademicTermDto) {
    return await this.superAdminService.updateAcademicTerm(id, updateData);
  }

  @Delete('academic-terms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAcademicTerm(@Param('id') id: string) {
    return await this.superAdminService.deleteAcademicTerm(id);
  }

  @Put('academic-terms/:id/set-current')
  async setCurrentAcademicTerm(
    @Param('id') id: string,
    @Body() body: { schoolId?: string }
  ) {
    return await this.superAdminService.setCurrentAcademicTerm(id, body.schoolId);
  }

  // ==================== AUDIT LOGS ====================

  @Get('audit-logs')
  async getAuditLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('performedBy') performedBy?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    const filters = {
      action,
      entityType,
      performedBy,
      startDate,
      endDate,
      schoolId
    };
    return await this.superAdminService.getAuditLogs(
      parseInt(page),
      parseInt(limit),
      filters
    );
  }

  @Get('audit-logs/export')
  async exportAuditLogs(
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string
  ) {
    try {
      const filters = { startDate, endDate, action, entityType };
      const csv = await this.superAdminService.exportAuditLogs(filters);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to export audit logs' });
    }
  }

  // ==================== DASHBOARD & ANALYTICS ====================

  @Get('dashboard/overview')
  async getSystemOverview() {
    return await this.superAdminService.getSystemOverview();
  }

  @Get('overview')
  async getGlobalOverview(
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('schoolId') schoolId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    const filters = {
      startDate,
      endDate,
      schoolId,
      includeInactive: includeInactive === 'true'
    };
    try {
      const result = await this.superAdminService.getGlobalOverview(filters);
      return customResponse(res, result.statusCode, result.message, result.data);
    } catch (error) {
      const status = error?.status || error?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
      return customResponse(
        res,
        status,
        error?.message || 'Failed to fetch global overview',
        null,
      );
    }
  }

  @Get('overview/export')
  async exportGlobalOverview(
    @Res() res: Response,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('schoolId') schoolId?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    try {
      const filters = {
        startDate,
        endDate,
        schoolId,
        includeInactive: includeInactive === 'true'
      };

      const overview = await this.superAdminService.getGlobalOverview(filters);

      // Generate CSV content
      let csv = 'Global Data Overview Report\n';
      csv += `Generated: ${new Date().toLocaleString()}\n\n`;

      // System Overview
      csv += 'SYSTEM OVERVIEW\n';
      csv += 'Metric,Value\n';
      csv += `Total Users,${overview.overview.totalUsers}\n`;
      csv += `Active Users,${overview.overview.activeUsers}\n`;
      csv += `Total Students,${overview.overview.totalStudents}\n`;
      csv += `Total Teachers,${overview.overview.totalTeachers}\n`;
      csv += `Total Parents,${overview.overview.totalParents}\n`;
      csv += `Total Schools,${overview.overview.totalSchools}\n`;
      csv += `Active Schools,${overview.overview.activeSchools}\n\n`;

      // KPIs
      csv += 'KEY PERFORMANCE INDICATORS\n';
      csv += 'KPI,Value\n';
      csv += `New Users This Month,${overview.kpis.newUsersThisMonth}\n`;
      csv += `Active Users (24h),${overview.kpis.activeUsersLast24h}\n`;
      csv += `User Growth Rate,${overview.kpis.userGrowthRate}%\n`;
      csv += `System Health Score,${overview.kpis.systemHealthScore}\n\n`;

      // Users by Role
      csv += 'USERS BY ROLE\n';
      csv += 'Role,Count,Active Count,Percentage\n';
      overview.distributions.usersByRole.forEach((role: any) => {
        csv += `${role.role},${role.count},${role.activeCount},${role.percentage}%\n`;
      });
      csv += '\n';

      // Enrollment by Grade
      csv += 'ENROLLMENT BY GRADE\n';
      csv += 'Grade,Total,Male,Female\n';
      overview.distributions.enrollmentByGrade.forEach((grade: any) => {
        csv += `${grade.grade},${grade.count},${grade.maleCount},${grade.femaleCount}\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="global-overview-${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    } catch (error) {
      return res.status(500).json({ message: 'Failed to export overview' });
    }
  }

  @Get('dashboard/recent-activity')
  async getRecentActivity(@Query('limit') limit: number = 10) {
    return await this.superAdminService.getRecentActivity(limit);
  }

  @Get('analytics')
  async getAnalytics(@Query('timeframe') timeframe: string = '30d') {
    return await this.superAdminService.getAnalytics(timeframe);
  }

  @Get('analytics/export')
  async exportAnalytics(@Query('timeframe') timeframe: string = '30d') {
    return await this.superAdminService.exportAnalytics(timeframe);
  }

  @Get('analytics/users')
  async getUserAnalytics(@Query('timeframe') timeframe: string = '30d') {
    return await this.superAdminService.getUserAnalytics(timeframe);
  }

  // ==================== REPORTS ====================

  @Get('reports')
  async getAllReports(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return await this.superAdminService.getAllReports(
      parseInt(page),
      parseInt(limit),
      status,
      type,
    );
  }

  @Post('reports/generate')
  async generateReport(@Body() reportData: any) {
    try {
      const result = await this.superAdminService.generateReport(reportData);
      return result;
    } catch (error) {
      console.error('Generate report error:', error);
      return {
        success: false,
        message: error.message || 'Failed to generate report'
      };
    }
  }

  @Get('reports/:id/download')
  async downloadReport(@Param('id') id: string, @Res() res: Response) {
    try {
      const reportContent = await this.superAdminService.downloadReport(id);

      // Determine filename based on report ID/type
      let filename = `report-${id}`;
      switch (id) {
        case '1':
        case 'user-activity':
          filename = 'user-activity-report';
          break;
        case '2':
        case 'school-summary':
          filename = 'school-summary-report';
          break;
        case '3':
        case 'system-usage':
          filename = 'system-usage-report';
          break;
        case 'security-audit':
          filename = 'security-audit-report';
          break;
        case 'data-export':
          filename = 'data-export-report';
          break;
        default:
          filename = `report-${id}`;
      }

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Pragma', 'no-cache');

      return res.send(reportContent);
    } catch (error) {
      console.error('Download error:', error);
      return res.status(400).json({ message: error.message || 'Failed to generate report' });
    }
  }

  @Delete('reports/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReport(@Param('id') id: string) {
    return await this.superAdminService.deleteReport(id);
  }

  // ==================== PHASE 2: ADVANCED SECURITY & MONITORING ====================

  @Post('access-control')
  async createAccessControl(@Body() accessControlData: any) {
    return this.superAdminService.createAccessControl(accessControlData);
  }

  @Get('access-control')
  async getAccessControls(@Query() query: any) {
    return this.superAdminService.getAccessControls(query);
  }

  @Put('access-control/:id')
  async updateAccessControl(
    @Param('id') id: string,
    @Body() updateData: any,
    @Body('updatedBy') updatedBy: string
  ) {
    return this.superAdminService.updateAccessControl(id, updateData, updatedBy);
  }

  @Delete('access-control/:id')
  async deleteAccessControl(
    @Param('id') id: string,
    @Body('deletedBy') deletedBy: string
  ) {
    return this.superAdminService.deleteAccessControl(id, deletedBy);
  }

  @Get('user-sessions')
  async getActiveSessions(@Query() query: any) {
    return this.superAdminService.getActiveSessions(query);
  }

  @Post('user-sessions')
  async createUserSession(@Body() sessionData: any) {
    return this.superAdminService.createUserSession(sessionData);
  }

  @Put('user-sessions/:sessionId/terminate')
  async terminateSession(
    @Param('sessionId') sessionId: string,
    @Body('terminatedBy') terminatedBy: string
  ) {
    return this.superAdminService.terminateSession(sessionId, terminatedBy);
  }

  @Put('user-sessions/user/:userId/terminate-all')
  async terminateAllUserSessions(
    @Param('userId') userId: string,
    @Body('terminatedBy') terminatedBy: string
  ) {
    return this.superAdminService.terminateAllUserSessions(userId, terminatedBy);
  }

  @Get('user-sessions/analytics')
  async getSessionAnalytics(@Query('timeframe') timeframe?: string) {
    return this.superAdminService.getSessionAnalytics(timeframe);
  }

  @Post('system-metrics')
  async recordSystemMetric(@Body() metricData: any) {
    return this.superAdminService.recordSystemMetric(metricData);
  }

  @Get('system-metrics')
  async getSystemMetrics(@Query() query: any) {
    return this.superAdminService.getSystemMetrics(query);
  }

  @Get('system-health')
  async getSystemHealthOverview() {
    return this.superAdminService.getSystemHealthOverview();
  }

  @Post('export-data-new')
  async exportDataNew(
    @Body('entityType') entityType: string,
    @Body('format') format?: string
  ) {
    return this.superAdminService.exportData(entityType, format);
  }

  @Post('cleanup-data-new')
  async cleanupDataNew(
    @Body('type') type: string,
    @Body() options: any
  ) {
    return this.superAdminService.cleanupData(type, options);
  }

  @Post('backup-data-new')
  async createBackupNew(@Body() options: any) {
    return this.superAdminService.createBackup(options);
  }

  @Get('data-operations-new')
  async getDataOperationsNew() {
    return this.superAdminService.getDataOperations();
  }



  @Post('initialize-system-settings')
  async initializeSystemSettings() {
    return this.superAdminService.initializeSystemSettings();
  }

  @Get('branding-settings')
  async getBrandingSettings() {
    return this.superAdminService.getBrandingSettings();
  }

  @Post('apply-branding')
  async applyBrandingSettings(@Body() brandingData: any) {
    return this.superAdminService.applyBrandingSettings(brandingData);
  }

  // ==================== END PHASE 2 ====================

  @Get('password-policy')
  async getPasswordPolicy() {
    return await this.superAdminService.getPasswordPolicy();
  }

  @Put('password-policy')
  async updatePasswordPolicy(@Body() policy: any) {
    return await this.superAdminService.updatePasswordPolicy(policy);
  }

  @Get('users-security')
  async getUsersWithSecurityInfo() {
    const users = await this.superAdminService.getUsersWithSecurityInfo();
    return { users };
  }

  @Post('users/:id/reset-password')
  async resetUserPasswordAdmin(
    @Param('id') userId: string,
    @Body() body: { newPassword: string; mustChangePassword?: boolean; sendEmail?: boolean; isActive?: boolean }
  ) {
    return await this.superAdminService.resetUserPasswordAdmin(
      userId,
      body.newPassword,
      {
        mustChangePassword: body.mustChangePassword,
        sendEmail: body.sendEmail,
        isActive: body.isActive
      }
    );
  }

  @Post('users/:id/unlock')
  async unlockUserAccount(@Param('id') userId: string) {
    return await this.superAdminService.unlockUserAccount(userId);
  }

  @Put('users/:id/mfa')
  async toggleUserMFA(
    @Param('id') userId: string,
    @Body() body: { enabled: boolean }
  ) {
    return await this.superAdminService.toggleUserMFA(userId, body.enabled);
  }

  @Get('password-security-metrics')
  async getPasswordSecurityMetrics() {
    return await this.superAdminService.getPasswordSecurityMetrics();
  }

  @Post('force-password-change')
  async forcePasswordChangeForUsers(@Body() body: { userIds?: string[] }) {
    return await this.superAdminService.forcePasswordChangeForAllUsers(body.userIds);
  }

  @Get('password-complexity-report')
  async generatePasswordComplexityReport() {
    return await this.superAdminService.generatePasswordComplexityReport();
  }

  // ==================== DATA MANAGEMENT ====================

  @Get('data-stats')
  async getDataStats() {
    return this.superAdminService.getDataStats();
  }

  @Post('export-data')
  async exportData(@Body() body: { entityType: string; format?: string }, @Res() res: Response) {
    try {
      const data = await this.superAdminService.exportData(body.entityType, body.format);

      if (body.format === 'csv' || !body.format) {
        // Convert to CSV
        if (data.length === 0) {
          res.setHeader('Content-Type', 'text/csv');
          res.setHeader('Content-Disposition', `attachment; filename="${body.entityType}-export.csv"`);
          return res.send('No data available');
        }

        const headers = Object.keys(data[0]).join(',');
        const rows = data.map(item =>
          Object.values(item).map(value =>
            typeof value === 'string' && (value.includes(',') || value.includes('"'))
              ? `"${value.replace(/"/g, '""')}"`
              : value
          ).join(',')
        );

        const csv = [headers, ...rows].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${body.entityType}-export.csv"`);
        return res.send(csv);
      } else {
        return res.json(data);
      }
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  @Post('backup-data')
  async createBackup(@Body() body: { includeFiles?: boolean }) {
    return this.superAdminService.createBackup(body);
  }

  @Post('cleanup-data')
  async cleanupData(@Body() body: { type: string; dryRun?: boolean; olderThan?: number }) {
    return this.superAdminService.cleanupData(body.type, body);
  }

  @Get('data-operations')
  async getDataOperations() {
    return this.superAdminService.getDataOperations();
  }

  // ==================== SYSTEM SETTINGS ====================

  @Get('system-settings')
  async getSystemSettings() {
    return this.superAdminService.getSystemSettings();
  }

  @Put('system-settings')
  async updateSystemSettings(@Body() body: { settings?: any }) {
    if (body?.settings == null || typeof body.settings !== 'object') {
      throw new BadRequestException('Request body must include a "settings" object');
    }
    return this.superAdminService.updateSystemSettings(body.settings);
  }

  @Post('system-settings/reset')
  async resetSystemSettings(@Body() body: { category: string }) {
    return this.superAdminService.resetSystemSettings(body.category);
  }

  @Post('test-email')
  async testEmailConfiguration() {
    return this.superAdminService.testEmailConfiguration();
  }

  @Post('test-welcome-email')
  async testWelcomeEmail(@Body() body: { email: string; firstName?: string; lastName?: string }) {
    return this.superAdminService.testWelcomeEmail(
      body.email,
      body.firstName || 'Test',
      body.lastName || 'User',
    );
  }

  // ==================== EMAIL TEMPLATES ====================

  @Get('email-templates')
  async getEmailTemplates(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('type') type?: string,
    @Query('status') status?: string
  ) {
    return this.superAdminService.getEmailTemplates(
      parseInt(page),
      parseInt(limit),
      { type, status }
    );
  }

  @Post('email-templates')
  async createEmailTemplate(@Body() templateData: any) {
    return this.superAdminService.createEmailTemplate(templateData);
  }

  @Get('email-templates/:id')
  async getEmailTemplate(@Param('id') id: string) {
    return this.superAdminService.getEmailTemplate(id);
  }

  @Put('email-templates/:id')
  async updateEmailTemplate(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateEmailTemplate(id, updateData);
  }

  @Delete('email-templates/:id')
  async deleteEmailTemplate(@Param('id') id: string) {
    return this.superAdminService.deleteEmailTemplate(id);
  }

  @Post('email-templates/:id/preview')
  async previewEmailTemplate(@Param('id') id: string, @Body() previewData: any) {
    return this.superAdminService.previewEmailTemplate(id, previewData);
  }

  // ==================== SCHEDULED JOBS ====================

  @Get('scheduled-jobs')
  async getScheduledJobs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    return this.superAdminService.getScheduledJobs(
      parseInt(page),
      parseInt(limit),
      { status, type }
    );
  }

  @Post('scheduled-jobs')
  async createScheduledJob(@Body() jobData: any) {
    return this.superAdminService.createScheduledJob(jobData);
  }

  @Get('scheduled-jobs/:id')
  async getScheduledJob(@Param('id') id: string) {
    return this.superAdminService.getScheduledJob(id);
  }

  @Put('scheduled-jobs/:id')
  async updateScheduledJob(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateScheduledJob(id, updateData);
  }

  @Delete('scheduled-jobs/:id')
  async deleteScheduledJob(@Param('id') id: string) {
    return this.superAdminService.deleteScheduledJob(id);
  }

  @Post('scheduled-jobs/:id/run')
  async runScheduledJob(@Param('id') id: string) {
    return this.superAdminService.runScheduledJob(id);
  }

  @Post('scheduled-jobs/:id/toggle')
  async toggleScheduledJob(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.superAdminService.toggleScheduledJob(id, body.enabled);
  }

  // ==================== ROLLOVER MANAGEMENT ====================

  @Get('rollover-configs')
  async getRolloverConfigs(
    @Query('schoolId') schoolId?: string,
    @Query('academicYear') academicYear?: string
  ) {
    return this.superAdminService.getRolloverConfigs({ schoolId, academicYear });
  }

  @Post('rollover-configs')
  async createRolloverConfig(@Body() configData: any) {
    return this.superAdminService.createRolloverConfig(configData);
  }

  @Put('rollover-configs/:id')
  async updateRolloverConfig(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateRolloverConfig(id, updateData);
  }

  @Post('rollover-configs/:id/execute')
  async executeRollover(@Param('id') id: string, @Body() options: any) {
    return this.superAdminService.executeRollover(id, options);
  }

  @Get('rollover-configs/:id/preview')
  async previewRollover(@Param('id') id: string) {
    return this.superAdminService.previewRollover(id);
  }

  // ==================== CUSTOM REPORTS ====================

  @Get('custom-reports')
  async getCustomReports(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string
  ) {
    return this.superAdminService.getCustomReports(
      parseInt(page),
      parseInt(limit),
      { status }
    );
  }

  @Post('custom-reports')
  async createCustomReport(@Body() reportData: any) {
    return this.superAdminService.createCustomReport(reportData);
  }

  @Get('custom-reports/:id')
  async getCustomReport(@Param('id') id: string) {
    return this.superAdminService.getCustomReport(id);
  }

  @Put('custom-reports/:id')
  async updateCustomReport(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateCustomReport(id, updateData);
  }

  @Delete('custom-reports/:id')
  async deleteCustomReport(@Param('id') id: string) {
    return this.superAdminService.deleteCustomReport(id);
  }

  @Post('custom-reports/preview')
  async previewCustomReport(@Body() reportConfig: any) {
    return this.superAdminService.previewCustomReport(reportConfig);
  }

  @Post('custom-reports/:id/run')
  async runCustomReport(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.superAdminService.runCustomReport(id);

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="custom-report-${id}.xlsx"`);
      return res.send(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  @Get('data-sources')
  async getDataSources() {
    return this.superAdminService.getDataSources();
  }

  // ==================== SYSTEM ALERTS ====================

  @Get('system-alerts')
  async getSystemAlerts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string
  ) {
    return this.superAdminService.getSystemAlerts(
      parseInt(page),
      parseInt(limit),
      { status, priority, category }
    );
  }

  @Post('system-alerts/:id/acknowledge')
  async acknowledgeAlert(@Param('id') id: string, @Body() body: { acknowledgedBy?: string }, @Req() req: any) {
    const userId = body?.acknowledgedBy ?? req?.user?._id?.toString() ?? 'unknown';
    return this.superAdminService.acknowledgeAlert(id, userId);
  }

  @Post('system-alerts/:id/resolve')
  async resolveAlert(@Param('id') id: string, @Body() body: { resolvedBy?: string }, @Req() req: any) {
    const userId = body?.resolvedBy ?? req?.user?._id?.toString() ?? 'unknown';
    return this.superAdminService.resolveAlert(id, userId);
  }

  @Post('system-alerts/:id/ignore')
  async ignoreAlert(@Param('id') id: string, @Body() body: { ignoredBy?: string }, @Req() req: any) {
    const userId = body?.ignoredBy ?? req?.user?._id?.toString() ?? 'unknown';
    return this.superAdminService.ignoreAlert(id, userId);
  }

  @Get('alert-rules')
  async getAlertRules() {
    return this.superAdminService.getAlertRules();
  }

  @Post('alert-rules')
  async createAlertRule(@Body() ruleData: any) {
    return this.superAdminService.createAlertRule(ruleData);
  }

  @Put('alert-rules/:id')
  async updateAlertRule(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateAlertRule(id, updateData);
  }

  @Delete('alert-rules/:id')
  async deleteAlertRule(@Param('id') id: string) {
    return this.superAdminService.deleteAlertRule(id);
  }

  @Post('alert-rules/:id/toggle')
  async toggleAlertRule(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.superAdminService.toggleAlertRule(id, body.enabled);
  }

  @Get('notification-templates')
  async getNotificationTemplates() {
    return this.superAdminService.getNotificationTemplates();
  }

  @Post('notification-templates')
  async createNotificationTemplate(@Body() templateData: any) {
    return this.superAdminService.createNotificationTemplate(templateData);
  }

  @Put('notification-templates/:id')
  async updateNotificationTemplate(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateNotificationTemplate(id, updateData);
  }

  @Delete('notification-templates/:id')
  async deleteNotificationTemplate(@Param('id') id: string) {
    return this.superAdminService.deleteNotificationTemplate(id);
  }

  // ==================== CERTIFICATE MANAGEMENT ====================

  @Get('certificates')
  async getCertificates(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    return this.superAdminService.getCertificates(
      parseInt(page),
      parseInt(limit),
      { status, type }
    );
  }

  @Post('certificates')
  async createCertificate(@Body() certificateData: any) {
    return this.superAdminService.createCertificate(certificateData);
  }

  @Get('certificates/:id')
  async getCertificate(@Param('id') id: string) {
    return this.superAdminService.getCertificate(id);
  }

  @Put('certificates/:id')
  async updateCertificate(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateCertificate(id, updateData);
  }

  @Delete('certificates/:id')
  async deleteCertificate(@Param('id') id: string) {
    return this.superAdminService.deleteCertificate(id);
  }

  @Post('certificates/:id/revoke')
  async revokeCertificate(@Param('id') id: string, @Body() body: { reason: string }) {
    return this.superAdminService.revokeCertificate(id, body.reason);
  }

  @Post('certificates/:id/renew')
  async renewCertificate(@Param('id') id: string) {
    return this.superAdminService.renewCertificate(id);
  }

  @Get('certificates/:id/download')
  async downloadCertificate(
    @Param('id') id: string,
    @Query('format') format: string = 'pem',
    @Res() res: Response
  ) {
    try {
      const certificate = await this.superAdminService.downloadCertificate(id, format);

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="certificate-${id}.${format}"`);
      return res.send(certificate);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  @Post('certificates/generate-csr')
  async generateCSR(@Body() csrData: any) {
    return this.superAdminService.generateCSR(csrData);
  }

  @Get('certificate-requests')
  async getCertificateRequests() {
    return this.superAdminService.getCertificateRequests();
  }

  @Post('certificate-requests/:id/approve')
  async approveCertificateRequest(@Param('id') id: string, @Body() body: { approvedBy: string }) {
    return this.superAdminService.approveCertificateRequest(id, body.approvedBy);
  }

  @Post('certificate-requests/:id/reject')
  async rejectCertificateRequest(@Param('id') id: string, @Body() body: { rejectedBy: string; reason: string }) {
    return this.superAdminService.rejectCertificateRequest(id, body.rejectedBy, body.reason);
  }

  @Get('trusted-cas')
  async getTrustedCAs() {
    return this.superAdminService.getTrustedCAs();
  }

  // ==================== INTEGRATION MANAGEMENT ====================

  @Get('integrations')
  async getIntegrations(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('status') status?: string,
    @Query('type') type?: string
  ) {
    return this.superAdminService.getIntegrations(
      parseInt(page),
      parseInt(limit),
      { status, type }
    );
  }

  @Post('integrations')
  async createIntegration(@Body() integrationData: any) {
    return this.superAdminService.createIntegration(integrationData);
  }

  @Get('integrations/:id')
  async getIntegration(@Param('id') id: string) {
    return this.superAdminService.getIntegration(id);
  }

  @Put('integrations/:id')
  async updateIntegration(@Param('id') id: string, @Body() updateData: any) {
    return this.superAdminService.updateIntegration(id, updateData);
  }

  @Delete('integrations/:id')
  async deleteIntegration(@Param('id') id: string) {
    return this.superAdminService.deleteIntegration(id);
  }

  @Post('integrations/:id/test')
  async testIntegration(@Param('id') id: string) {
    return this.superAdminService.testIntegration(id);
  }

  @Post('integrations/:id/sync')
  async syncIntegration(@Param('id') id: string) {
    return this.superAdminService.syncIntegration(id);
  }

  @Post('integrations/:id/toggle')
  async toggleIntegration(@Param('id') id: string, @Body() body: { active: boolean }) {
    return this.superAdminService.toggleIntegration(id, body.active);
  }

  @Get('integration-logs')
  async getIntegrationLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('integrationId') integrationId?: string,
    @Query('status') status?: string
  ) {
    return this.superAdminService.getIntegrationLogs(
      parseInt(page),
      parseInt(limit),
      { integrationId, status }
    );
  }

  // ==================== SECRETARIES ====================

  @Get('secretaries')
  async getSecretaries(@Query() query: any, @Res() res: Response) {
    try {
      const result = await this.superAdminService.getSecretaries(query);
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

}
