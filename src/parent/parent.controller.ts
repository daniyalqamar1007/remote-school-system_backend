import { Controller, Get, Post, Body, Param, Put, Patch, Query, HttpException, HttpStatus, UseGuards, Request, Res } from '@nestjs/common';
import { ParentService } from './parent.service';
import { CreateParentDto } from './dto/create-parent.dto';
import { Parent } from './schema/parent.schema';
import { ScheduleService } from 'src/schedule/schedule.service';
import { ParentSummaryService } from './parent-summary.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../auth/schemas/user.schema';
import { customResponse } from 'src/utils/responses';

@Controller('parent')
export class ParentController {
  constructor(
    private readonly parentService: ParentService,
    private readonly scheduleService: ScheduleService, // Inject ScheduleService
    private readonly parentSummaryService: ParentSummaryService,
  ) {}

  @Post()
  create(@Body() createParentDto: CreateParentDto): Promise<Parent> {
    return this.parentService.create(createParentDto);
  }

  @Get()
  findAll(): Promise<Parent[]> {
    return this.parentService.findAll();
  }

  // IMPORTANT: Specific routes must come before parameterized routes (:id)
  // Otherwise /parent/by-email/... will be matched by /parent/:id
  @Get('by-email/:email')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PARENT)
  async findByEmail(@Param('email') email: string) {
    try {
      // URL decode the email parameter (handles %40 -> @)
      let decodedEmail = email;
      try {
        decodedEmail = decodeURIComponent(email);
      } catch (decodeError) {
        console.warn('Error decoding email, using original:', decodeError);
        decodedEmail = email;
      }
      
      const parent = await this.parentService.findByEmail(decodedEmail);
      
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

  @Get('student-summary/:studentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PARENT)
  async getStudentSummary(@Request() req, @Param('studentId') studentId: string) {
    return this.parentSummaryService.getStudentSummary(
      studentId,
      req.user.schoolId,
      req.user.academicYear
    );
  }

  // ==================== ALERTS ENDPOINTS ====================
  // IMPORTANT: These routes must come BEFORE /parent/:id to avoid route conflicts

  @Get('alerts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PARENT)
  async getAlerts(
    @Request() req: any,
    @Res() res: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('search') search?: string,
    @Query('studentId') studentId?: string
  ) {
    try {
      const parentUserId = req.user._id?.toString() || req.user.userId;
      const result = await this.parentService.getAlerts(parentUserId, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        search,
        studentId
      });
      return customResponse(res, 200, 'Alerts retrieved successfully', result);
    } catch (error: any) {
      return customResponse(res, error.status || 500, error.message || 'Failed to retrieve alerts', null);
    }
  }

  @Get('alerts/unread-count')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PARENT)
  async getUnreadAlertCount(
    @Request() req: any,
    @Res() res: any,
    @Query('studentId') studentId?: string
  ) {
    try {
      const parentUserId = req.user._id?.toString() || req.user.userId;
      const count = await this.parentService.getUnreadAlertCount(parentUserId, studentId);
      return customResponse(res, 200, 'Unread count retrieved successfully', { count });
    } catch (error: any) {
      return customResponse(res, error.status || 500, error.message || 'Failed to retrieve unread count', null);
    }
  }

  @Patch('alerts/mark-read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PARENT)
  async markAlertsAsRead(
    @Request() req: any,
    @Res() res: any,
    @Body() body: { alertIds?: string[]; studentId?: string }
  ) {
    try {
      const parentUserId = req.user._id?.toString() || req.user.userId;
      const result = await this.parentService.markAlertsAsRead(
        parentUserId,
        body.alertIds,
        body.studentId
      );
      return customResponse(res, 200, 'Alerts marked as read successfully', result);
    } catch (error: any) {
      return customResponse(res, error.status || 500, error.message || 'Failed to mark alerts as read', null);
    }
  }

  @Patch('alerts/:alertId/read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PARENT)
  async markAlertAsRead(
    @Param('alertId') alertId: string,
    @Request() req: any,
    @Res() res: any
  ) {
    try {
      const parentUserId = req.user._id?.toString() || req.user.userId;
      const alert = await this.parentService.markAlertAsRead(alertId, parentUserId);
      return customResponse(res, 200, 'Alert marked as read successfully', alert);
    } catch (error: any) {
      return customResponse(res, error.status || 500, error.message || 'Failed to mark alert as read', null);
    }
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Parent> {
    return this.parentService.findOne(id);
  }
  // GET /parent/:id/children-full (returns full student objects)
    @Get(':id/children-full')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.PARENT, UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
    async getChildrenFull(@Param('id') id: string, @Request() req: any) {
      // Only allow parents to access their own children, or admins/super_admins for any parent
      if (req.user.role === UserRole.PARENT && req.user._id.toString() !== id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }
      return this.parentService.getChildrenFull(id, req.user.schoolId);
    }

    @Get(':id/children')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.PARENT, UserRole.ADMIN, UserRole.SECRETARY, UserRole.SUPER_ADMIN)
    async getChildren(@Param('id') id: string, @Request() req: any) {
      // Only allow parents to access their own children, or admins/super_admins for any parent
      if (req.user.role === UserRole.PARENT && req.user._id.toString() !== id) {
        throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
      }
      return this.parentService.getChildrenIds(id, req.user.schoolId);
    }

  @Put(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Body('password') password: string) {
    if (!password || password.length < 6) {
      throw new HttpException('Password too short', HttpStatus.BAD_REQUEST);
    }
    return this.parentService.resetPassword(id, password);
  }

}
