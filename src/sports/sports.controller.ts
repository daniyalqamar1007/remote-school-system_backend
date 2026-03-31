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
  Req,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Response } from 'express';
import { SportsService } from './sports.service';
import { SportsPdfService } from './sports-pdf.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { customResponse } from 'src/utils/responses';
import { CreateSportsProgramDto } from './dto/create-sports-program.dto';
import { UpdateSportsProgramDto } from './dto/update-sports-program.dto';
import { GetSportsProgramsQueryDto } from './dto/get-sports-programs-query.dto';

@Controller('sports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SportsController {
  constructor(
    private readonly sportsService: SportsService,
    private readonly sportsPdfService: SportsPdfService,
  ) { }

  // ==================== SPORTS PROGRAM MANAGEMENT ====================

  @Post('programs')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async createSportsProgram(@Res() res: Response, @Body() programData: CreateSportsProgramDto, @Req() req: any) {
    try {
      const role = req.user.role;
      const actorId = req.user._id;
      const schoolId = req.user.schoolId || programData.schoolId;

      if (!schoolId) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      const program = await this.sportsService.createSportsProgram(programData, schoolId, actorId, role);
      return customResponse(
        res as any,
        program.statusCode,
        program.message,
        program.data
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
        error.message || 'Failed to create sports program',
        null
      );
    }
  }

  @Get('programs')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.STUDENT, UserRole.SUPER_ADMIN)
  async getSportsPrograms(
    @Res() res: Response,
    @Query() query: GetSportsProgramsQueryDto,
    @Req() req: any
  ) {
    try {
      // For super-admin, schoolId is optional (can be from query or null for all schools)
      // For other roles, schoolId is required
      let schoolId: string | null = null;
      
      if (req.user.role === UserRole.SUPER_ADMIN) {
        // Super-admin can view all programs or filter by schoolId from query
        schoolId = query.schoolId || null;
      } else {
        // Other roles must have schoolId
        schoolId = req.user.schoolId || query.schoolId;
        if (!schoolId) {
          return customResponse(
            res as any,
            HttpStatus.BAD_REQUEST,
            'School ID is required',
            null
          );
        }
      }

      const result = await this.sportsService.getSportsPrograms(schoolId, query);
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
        error.message || 'Failed to retrieve sports programs',
        null
      );
    }
  }

  @Get('programs/my-coach-programs')
  @Roles(UserRole.TEACHER)
  async getMyCoachPrograms(@Req() req: any) {
    const userId = req.user?.userId || req.user?._id;
    return await this.sportsService.getCoachPrograms(userId);
  }

  @Get('programs/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getSportsProgramById(@Res() res: Response, @Param('id') id: string) {
    try {
      const result = await this.sportsService.getSportsProgramById(id);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return customResponse(
          res as any,
          HttpStatus.NOT_FOUND,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve sports program',
        null
      );
    }
  }

  @Put('programs/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async updateSportsProgram(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateData: UpdateSportsProgramDto,
    @Req() req: any
  ) {
    try {
      const role = req.user.role;
      const updatedBy = req.user._id.toString();

      const result = await this.sportsService.updateSportsProgram(id, updateData, updatedBy, role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to update sports program',
        null
      );
    }
  }

  @Delete('programs/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async deleteSportsProgram(@Res() res: Response, @Param('id') id: string, @Req() req: any) {
    try {
      const role = req.user.role;
      const deletedBy = req.user._id.toString();

      const result = await this.sportsService.deleteSportsProgram(id, deletedBy, role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to delete sports program',
        null
      );
    }
  }

  // ==================== STUDENT SPORTS ASSIGNMENT ====================

  @Post('assignments')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async assignStudentToSports(@Res() res: Response, @Body() assignmentData: any, @Req() req: any) {
    try {
      const role = req.user.role;
      const actorId = req.user._id || req.user.userId;
      // For admin users, use their schoolId (can be string or ObjectId)
      // Convert to string to ensure consistent comparison
      const schoolId = req.user.schoolId ? String(req.user.schoolId) : (assignmentData.schoolId ? String(assignmentData.schoolId) : null);

      // Debug logging
      console.log('Assign Student - Role:', role, 'SchoolId:', schoolId, 'SchoolId type:', typeof schoolId);

      // Only require schoolId for non-super-admin roles
      if (!schoolId && role !== UserRole.SUPER_ADMIN) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      const result = await this.sportsService.assignStudentToSports(assignmentData, actorId.toString(), schoolId, role);
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
        error.message || 'Failed to assign student to sports',
        null
      );
    }
  }

  @Get('assignments')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT, UserRole.SUPER_ADMIN)
  async getStudentSportsAssignments(@Res() res: Response, @Query() query: any, @Req() req: any) {
    try {
      const filters: any = { ...query };

      // Apply role-based filtering
      if (req.user.role === UserRole.STUDENT) {
        filters.studentId = req.user._id || req.user.studentProfileId;
      } else if (req.user.role === UserRole.PARENT) {
        filters.parentId = req.user.parentProfileId;
      } else if (req.user.role === UserRole.TEACHER) {
        // For teachers, filter by their coaching programs
        const coachId = req.user.userId || req.user._id;
        const coachPrograms = await this.sportsService.getCoachingPrograms(coachId);
        const programIds = coachPrograms.map((p: any) => (p._id || p).toString());
        if (programIds.length > 0) {
          // If a specific program is selected, use it; otherwise use all teacher's programs
          if (query.sportsProgramId && query.sportsProgramId !== 'all') {
            // Verify the program belongs to the teacher
            if (programIds.includes(query.sportsProgramId)) {
              filters.sportsProgramId = query.sportsProgramId;
            } else {
              // Program doesn't belong to teacher, return empty
              return customResponse(
                res as any,
                HttpStatus.OK,
                'Student sports assignments retrieved successfully',
                {
                  assignments: [],
                  pagination: {
                    page: Number(query.page) || 1,
                    limit: Number(query.limit) || 10,
                    totalCount: 0,
                    totalPages: 0
                  }
                }
              );
            }
          } else {
            // Filter by all teacher's programs
            filters.sportsProgramIds = programIds;
          }
        } else {
          // Teacher has no programs, return empty
          return customResponse(
            res as any,
            HttpStatus.OK,
            'Student sports assignments retrieved successfully',
            {
              assignments: [],
              pagination: {
                page: Number(query.page) || 1,
                limit: Number(query.limit) || 10,
                totalCount: 0,
                totalPages: 0
              }
            }
          );
        }
      } else if (req.user.role !== UserRole.SUPER_ADMIN) {
        filters.schoolId = req.user.schoolId;
      } else if (query.schoolId) {
        filters.schoolId = query.schoolId;
      }

      const result = await this.sportsService.getStudentSportsAssignments(filters);
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
        error.message || 'Failed to retrieve student sports assignments',
        null
      );
    }
  }

  @Get('assignments/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.NURSE, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getStudentSportsAssignmentById(
    @Res() res: Response,
    @Param('id') id: string,
    @Req() req: any
  ) {
    try {
      const result = await this.sportsService.getStudentSportsAssignmentById(id, req.user);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return customResponse(
          res as any,
          HttpStatus.NOT_FOUND,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve student sports assignment',
        null
      );
    }
  }

  @Put('assignments/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async updateStudentSportsAssignment(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateData: any,
    @Req() req: any
  ) {
    try {
      const role = req.user.role;
      const updatedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.updateStudentSportsAssignment(id, updateData, updatedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to update student sports assignment',
        null
      );
    }
  }

  @Delete('assignments/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN, UserRole.TEACHER)
  async removeStudentFromSports(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() withdrawalData: any,
    @Req() req: any
  ) {
    try {
      const role = req.user.role;
      const deletedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.removeStudentFromSports(id, withdrawalData, deletedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to remove student from sports',
        null
      );
    }
  }

  @Get('assignments/program/:programId')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getAssignmentsByProgram(@Res() res: Response, @Param('programId') programId: string, @Req() req: any) {
    try {
      const schoolId = req.user.role === UserRole.SUPER_ADMIN ? req.query.schoolId : req.user.schoolId;
      
      const result = await this.sportsService.getAssignmentsByProgram(programId, schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return customResponse(
          res as any,
          HttpStatus.NOT_FOUND,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve assignments by program',
        null
      );
    }
  }

  // ==================== ELIGIBILITY TRACKING ====================

  @Get('eligibility/:studentId/:sportsProgramId')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.NURSE, UserRole.SUPER_ADMIN)
  async checkStudentEligibility(
    @Res() res: Response,
    @Param('studentId') studentId: string,
    @Param('sportsProgramId') sportsProgramId: string
  ) {
    try {
      const result = await this.sportsService.checkStudentEligibility(studentId, sportsProgramId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
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
        error.message || 'Failed to check student eligibility',
        null
      );
    }
  }

  @Put('assignments/:id/medical')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.NURSE, UserRole.SUPER_ADMIN)
  async updateStudentMedicalInfo(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() medicalData: any,
    @Req() req: any
  ) {
    try {
      const role = req.user.role;
      const updatedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.updateStudentMedicalInfo(id, medicalData, updatedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to update student medical info',
        null
      );
    }
  }

  // ==================== SCHEDULE MANAGEMENT ====================

  @Post('schedules')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async createSportsSchedule(@Res() res: Response, @Body() scheduleData: any, @Req() req: any) {
    try {
      const role = req.user.role;
      const createdBy = req.user._id || req.user.userId;

      const result = await this.sportsService.createSportsSchedule(scheduleData, createdBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to create sports schedule',
        null
      );
    }
  }

  @Get('schedules')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT, UserRole.SUPER_ADMIN)
  async getSportsSchedules(@Res() res: Response, @Query() query: any, @Req() req: any) {
    try {
      const filters: any = { ...query };

      if (req.user.role !== UserRole.SUPER_ADMIN) {
        filters.schoolId = req.user.schoolId;
      } else if (query.schoolId) {
        filters.schoolId = query.schoolId;
      }

      const result = await this.sportsService.getSportsSchedules(filters);
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
        error.message || 'Failed to retrieve sports schedules',
        null
      );
    }
  }

  @Get('schedules/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT, UserRole.SUPER_ADMIN)
  async getSportsScheduleById(@Res() res: Response, @Param('id') id: string, @Req() req: any) {
    try {
      const result = await this.sportsService.getSportsScheduleById(id);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof NotFoundException) {
        return customResponse(
          res as any,
          HttpStatus.NOT_FOUND,
          error.message,
          null
        );
      }
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve sports schedule',
        null
      );
    }
  }

  @Put('schedules/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async updateSportsSchedule(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateData: any,
    @Req() req: any
  ) {
    try {
      const role = req.user.role;
      const updatedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.updateSportsSchedule(id, updateData, updatedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to update sports schedule',
        null
      );
    }
  }

  @Delete('schedules/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN, UserRole.TEACHER)
  async deleteSportsSchedule(@Res() res: Response, @Param('id') id: string, @Req() req: any) {
    try {
      const role = req.user.role;
      const deletedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.deleteSportsSchedule(id, deletedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to delete sports schedule',
        null
      );
    }
  }

  // ==================== ATTENDANCE MANAGEMENT ====================

  @Post('attendance')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async recordSportsAttendance(@Res() res: Response, @Body() attendanceData: any, @Req() req: any) {
    try {
      const role = req.user.role;
      const recordedBy = req.user._id || req.user.userId;
      const schoolId = req.user.schoolId || attendanceData.schoolId;

      if (!schoolId && role !== UserRole.SUPER_ADMIN) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      const result = await this.sportsService.recordSportsAttendance(attendanceData, recordedBy.toString(), role, schoolId);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to record sports attendance',
        null
      );
    }
  }

  @Get('attendance')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.PARENT, UserRole.STUDENT, UserRole.SUPER_ADMIN)
  async getSportsAttendance(@Res() res: Response, @Query() query: any, @Req() req: any) {
    try {
      const filters: any = { ...query };

      // Apply role-based filtering
      if (req.user.role === UserRole.STUDENT) {
        filters.studentId = req.user._id || req.user.studentProfileId;
      } else if (req.user.role === UserRole.PARENT) {
        filters.parentId = req.user.parentProfileId || req.user._id;
      } else if (req.user.role === UserRole.TEACHER) {
        // For teachers, filter by their coaching programs
        const coachId = req.user.userId || req.user._id;
        const coachPrograms = await this.sportsService.getCoachingPrograms(coachId);
        const programIds = coachPrograms.map((p: any) => (p._id || p).toString());
        if (programIds.length > 0) {
          // If a specific program is selected, use it; otherwise use all teacher's programs
          if (query.sportsProgramId && query.sportsProgramId !== 'all') {
            // Verify the program belongs to the teacher
            if (programIds.includes(query.sportsProgramId)) {
              filters.sportsProgramId = query.sportsProgramId;
            } else {
              // Program doesn't belong to teacher, return empty
              return customResponse(
                res as any,
                HttpStatus.OK,
                'Sports attendance retrieved successfully',
                {
                  attendance: [],
                  pagination: {
                    page: Number(query.page) || 1,
                    limit: Number(query.limit) || 10,
                    totalCount: 0,
                    totalPages: 0
                  }
                }
              );
            }
          } else {
            // Filter by all teacher's programs
            filters.sportsProgramIds = programIds;
          }
        } else {
          // Teacher has no programs, return empty
          return customResponse(
            res as any,
            HttpStatus.OK,
            'Sports attendance retrieved successfully',
            {
              attendance: [],
              pagination: {
                page: Number(query.page) || 1,
                limit: Number(query.limit) || 10,
                totalCount: 0,
                totalPages: 0
              }
            }
          );
        }
      } else if (req.user.role !== UserRole.SUPER_ADMIN) {
        // Only add schoolId if it exists and is valid
        if (req.user.schoolId) {
          filters.schoolId = req.user.schoolId;
        } else {
          // No schoolId for non-super-admin, return empty result instead of error
          console.warn('No schoolId found for non-super-admin user:', {
            role: req.user.role,
            userId: req.user._id,
            email: req.user.email
          });
          return customResponse(
            res as any,
            HttpStatus.OK,
            'Sports attendance retrieved successfully',
            {
              attendance: [],
              pagination: {
                page: Number(query.page) || 1,
                limit: Number(query.limit) || 10,
                totalCount: 0,
                totalPages: 0
              }
            }
          );
        }
      } else if (query.schoolId) {
        filters.schoolId = query.schoolId;
      }

      // Log filters being sent to service
      console.log('Filters being sent to service:', JSON.stringify(filters, null, 2));

      const result = await this.sportsService.getSportsAttendance(filters);
      
      // Check if result has error
      if (!result.success || result.statusCode !== HttpStatus.OK) {
        console.error('Service returned error:', result);
      }
      
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      console.error('Error in getSportsAttendance controller:', error);
      console.error('Error stack:', error?.stack);
      console.error('Error name:', error?.name);
      console.error('Request user:', {
        role: req.user?.role,
        schoolId: req.user?.schoolId,
        _id: req.user?._id
      });
      console.error('Query params:', JSON.stringify(query, null, 2));
      
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error?.message || 'Failed to retrieve sports attendance',
        null
      );
    }
  }

  @Put('attendance/:id')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async updateSportsAttendance(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() updateData: any,
    @Req() req: any
  ) {
    try {
      const role = req.user.role;
      const updatedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.updateSportsAttendance(id, updateData, updatedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to update sports attendance',
        null
      );
    }
  }

  // ==================== REPORTING ====================

  @Get('reports/participation')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getSportsParticipationReport(@Res() res: Response, @Query() query: any, @Req() req: any) {
    try {
      const schoolId = req.user.role === UserRole.SUPER_ADMIN ? query.schoolId : req.user.schoolId;
      
      if (!schoolId && req.user.role !== UserRole.SUPER_ADMIN) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      const result = await this.sportsService.getSportsParticipationReport(schoolId, query);
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
        error.message || 'Failed to retrieve participation report',
        null
      );
    }
  }

  @Get('reports/attendance')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getSportsAttendanceReport(@Res() res: Response, @Query() query: any, @Req() req: any) {
    try {
      const schoolId = req.user.role === UserRole.SUPER_ADMIN ? query.schoolId : req.user.schoolId;
      
      if (!schoolId && req.user.role !== UserRole.SUPER_ADMIN) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      const result = await this.sportsService.getSportsAttendanceReport(schoolId, query);
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
        error.message || 'Failed to retrieve attendance report',
        null
      );
    }
  }

  @Get('reports')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getGeneralSportsReport(@Res() res: Response, @Query() query: any, @Req() req: any) {
    try {
      const schoolId = req.user.role === UserRole.SUPER_ADMIN ? query.schoolId : req.user.schoolId;
      const { type, program, dateRange } = query;

      if (!schoolId && req.user.role !== UserRole.SUPER_ADMIN) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      let result;
      switch (type) {
        case 'overview':
          result = await this.sportsService.getSportsOverviewReport(schoolId, { program, dateRange });
          break;
        case 'participation':
          result = await this.sportsService.getSportsParticipationReport(schoolId, query);
          break;
        case 'attendance':
          result = await this.sportsService.getSportsAttendanceReport(schoolId, query);
          break;
        default:
          result = await this.sportsService.getSportsOverviewReport(schoolId, query);
      }

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
        error.message || 'Failed to retrieve sports report',
        null
      );
    }
  }

  @Get('reports/export')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async exportSportsReport(@Query() query: any, @Req() req: any, @Res() res: Response) {
    const schoolId = req.user.role === UserRole.SUPER_ADMIN ? query.schoolId : req.user.schoolId;
    const { type, program, dateRange, format = 'pdf' } = query;

    // Fetch report data based on type - NO date filtering to get ALL records
    // Only pass program filter if specified, but skip dateRange to get all records
    let reportData;
    let pdfBuffer;
    let filename;

    switch (type) {
      case 'summary':
      case 'detailed':
        reportData = await this.sportsService.getSportsOverviewReport(schoolId, { program });
        // Removed dateRange filter to get ALL records
        if (format === 'pdf') {
          pdfBuffer = await this.sportsPdfService.generateOverviewPdf(reportData);
          filename = `sports-overview-${new Date().toISOString().split('T')[0]}.pdf`;
        }
        break;
      case 'attendance':
        reportData = await this.sportsService.getSportsAttendanceReport(schoolId, { program });
        // Removed dateRange filter to get ALL records
        if (format === 'pdf') {
          pdfBuffer = await this.sportsPdfService.generateAttendancePdf(reportData);
          filename = `sports-attendance-${new Date().toISOString().split('T')[0]}.pdf`;
        }
        break;
      case 'participation':
        reportData = await this.sportsService.getSportsParticipationReport(schoolId, { program });
        // Removed dateRange filter to get ALL records
        if (format === 'pdf') {
          pdfBuffer = await this.sportsPdfService.generateParticipationPdf(reportData);
          filename = `sports-participation-${new Date().toISOString().split('T')[0]}.pdf`;
        }
        break;
      default:
        reportData = await this.sportsService.getSportsOverviewReport(schoolId, { program });
        // Removed dateRange filter to get ALL records
        if (format === 'pdf') {
          pdfBuffer = await this.sportsPdfService.generateOverviewPdf(reportData);
          filename = `sports-overview-${new Date().toISOString().split('T')[0]}.pdf`;
        }
    }

    // Return PDF if format is 'pdf', otherwise return JSON
    if (format === 'pdf' && pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    } else {
      return res.json(reportData);
    }
  }

  // ==================== COACH/STAFF SPECIFIC ENDPOINTS ====================

  @Get('my-programs')
  @Roles(UserRole.TEACHER)
  async getMyCoachingPrograms(@Req() req: any) {
    return await this.sportsService.getCoachingPrograms(req.user.userId);
  }

  @Get('my-teams')
  @Roles(UserRole.TEACHER)
  async getMyTeamStudents(@Query() query: any, @Req() req: any) {
    return await this.sportsService.getCoachTeamStudents(req.user.userId, query);
  }

  @Post('notify-parents')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async notifyParentsOfAbsence(@Body() notificationData: any, @Req() req: any) {
    return await this.sportsService.notifyParentsOfAbsence(notificationData, req.user.userId);
  }

  // ==================== ADDITIONAL ENDPOINTS ====================

  @Get('schedules/by-date')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getScheduleByDate(@Res() res: Response, @Query('date') date: string, @Req() req: any) {
    try {
      if (!date) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'Date parameter is required',
          null
        );
      }

      const filters: any = { date };

      // Apply role-based filtering
      if (req.user.role === UserRole.TEACHER) {
        filters.coachId = req.user.userId || req.user._id;
      } else if (req.user.role !== UserRole.SUPER_ADMIN) {
        filters.schoolId = req.user.schoolId;
      } else if (req.query.schoolId) {
        filters.schoolId = req.query.schoolId;
      }

      const result = await this.sportsService.getScheduleByDate(filters);
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
        error.message || 'Failed to retrieve schedule by date',
        null
      );
    }
  }

  @Get('attendance/pending')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getPendingAttendance(@Res() res: Response, @Req() req: any) {
    try {
      const filters: any = {};

      // Apply role-based filtering
      if (req.user.role === UserRole.TEACHER) {
        filters.coachId = req.user.userId || req.user._id;
      } else if (req.user.role !== UserRole.SUPER_ADMIN) {
        filters.schoolId = req.user.schoolId;
      } else if (req.query.schoolId) {
        filters.schoolId = req.query.schoolId;
      }

      const result = await this.sportsService.getPendingAttendance(filters);
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
        error.message || 'Failed to retrieve pending attendance',
        null
      );
    }
  }

  @Post('attendance/bulk')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async createBulkAttendance(@Res() res: Response, @Body() bulkData: any, @Req() req: any) {
    try {
      const role = req.user.role;
      const userId = req.user?.userId || req.user?._id || req.user?.id;
      const schoolId = req.user.schoolId || bulkData.schoolId;

      if (!userId) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'User authentication required',
          null
        );
      }

      if (!schoolId && role !== UserRole.SUPER_ADMIN) {
        return customResponse(
          res as any,
          HttpStatus.BAD_REQUEST,
          'School ID is required',
          null
        );
      }

      const result = await this.sportsService.createBulkAttendance(bulkData, userId.toString(), role);
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
        error.message || 'Failed to record bulk attendance',
        null
      );
    }
  }

  // ==================== STUDENT PORTAL ENDPOINTS ====================

  @Get('student/my-sports')
  @Roles(UserRole.STUDENT)
  async getMyActiveSports(@Req() req: any) {
    const programs = await this.sportsService.getStudentActiveSports(req.user._id);
    return { programs };
  }

  @Get('student/my-schedule')
  @Roles(UserRole.STUDENT)
  async getMySportsSchedule(@Query() query: any, @Req() req: any) {
    const schedule = await this.sportsService.getStudentSportsSchedule(req.user._id, query);
    return { schedule };
  }

  @Get('student/my-attendance')
  @Roles(UserRole.STUDENT)
  async getMySportsAttendance(@Query() query: any, @Req() req: any) {
    const attendance = await this.sportsService.getStudentSportsAttendance(req.user._id, query);
    return { attendance };
  }

  @Get('student/stats')
  @Roles(UserRole.STUDENT)
  async getMySportsStats(@Res() res: Response, @Req() req: any) {
    try {
      const stats = await this.sportsService.getStudentSportsStats(req.user._id);
      return customResponse(
        res as any,
        HttpStatus.OK,
        'Student sports stats retrieved successfully',
        stats
      );
    } catch (error) {
      return customResponse(
        res as any,
        HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve student sports stats',
        null
      );
    }
  }

  // ==================== PARENT PORTAL ENDPOINTS ====================

  @Get('parent/children-sports')
  @Roles(UserRole.PARENT)
  async getChildrenSports(@Req() req: any) {
    // Use parent user ID instead of parentProfileId
    const parentId = req.user._id || req.user.userId;
    return await this.sportsService.getChildrenSports(parentId);
  }

  @Get('parent/children-schedule')
  @Roles(UserRole.PARENT)
  async getChildrenSportsSchedule(@Query() query: any, @Req() req: any) {
    // Use parent user ID instead of parentProfileId
    const parentId = req.user._id || req.user.userId;
    return await this.sportsService.getChildrenSportsSchedule(parentId, query);
  }

  @Get('activities')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
  async getSportsActivities(@Query() query: any, @Req() req: any) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;

    // Filter activities by sports-related actions
    const activityFilters = {
      title: query.title,
      performBy: 'ADMIN',
      actorId: req.user.userId,
      role: req.user.role
    };

    return await this.sportsService.getSportsActivities(page, limit, activityFilters);
  }

  @Get('parent/children-attendance')
  @Roles(UserRole.PARENT)
  async getChildrenSportsAttendance(@Query() query: any, @Req() req: any) {
    // Use parent user ID instead of parentProfileId
    const parentId = req.user._id || req.user.userId;
    return await this.sportsService.getChildrenSportsAttendance(parentId, query);
  }

  // ==================== MEDICAL INTEGRATION ENDPOINTS ====================

  @Get('programs/:programId/students/medical')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN, UserRole.NURSE)
  async getStudentsWithMedicalData(
    @Param('programId') programId: string,
    @Query('academicYear') academicYear?: string
  ) {
    return await this.sportsService.getStudentsWithMedicalData(programId, academicYear);
  }

  @Put('assignments/:assignmentId/medical/refresh')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN, UserRole.NURSE)
  async refreshStudentMedicalClearance(@Res() res: Response, @Param('assignmentId') assignmentId: string, @Req() req: any) {
    try {
      const role = req.user.role;
      const refreshedBy = req.user._id || req.user.userId;

      const result = await this.sportsService.refreshStudentMedicalClearance(assignmentId, refreshedBy.toString(), role);
      return customResponse(
        res as any,
        result.statusCode,
        result.message,
        result.data
      );
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
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
        error.message || 'Failed to refresh medical clearance',
        null
      );
    }
  }
}
