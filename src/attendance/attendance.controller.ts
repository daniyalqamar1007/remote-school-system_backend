import { Controller, Post, Get, Put, Delete, Body, Query, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { Attendance } from './schema/schema.attendance';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('markAttendance')
  async markAttendance(
    @Body() createAttendanceDto: CreateAttendanceDto,
  ): Promise<Attendance> {
    console.log('Received attendance data:', JSON.stringify(createAttendanceDto, null, 2));
    console.log('Students count:', createAttendanceDto.students?.length || 0);
    if (createAttendanceDto.students && createAttendanceDto.students.length > 0) {
      console.log('First student sample:', JSON.stringify(createAttendanceDto.students[0], null, 2));
    }
    return this.attendanceService.markAttendance(createAttendanceDto);
  }

  @Get('/getTeacherViewAttendance')
  async getTeacherViewAttendance(
    @Query('room') room: string,
    @Query('section') section: string,
    @Query('date') date: string,
    @Query('courseId') courseId: string,
    @Query('teacherId') teacherId?: string,
  ): Promise<Attendance[]> {
    return this.attendanceService.getTeacherViewAttendance(
      courseId,
      room,
      section,
      date,
      teacherId,
    );
  }

  @Get('/teacher/records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTeacherAttendanceRecords(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('courseId') courseId?: string,
    @Query('class') className?: string,
    @Query('section') section?: string,
    @Query('date') date?: string,
    @Query('search') search?: string,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.attendanceService.getTeacherAttendanceRecords(
      teacherId,
      parseInt(page, 10),
      parseInt(limit, 10),
      { courseId, class: className, section, date, search },
    );
  }

  // IMPORTANT: These routes must come BEFORE /teacher/:id to avoid route conflicts
  @Get('/teacher/courses')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTeacherCoursesForAttendance(@Req() req: any) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.attendanceService.getTeacherCoursesForAttendance(teacherId);
  }

  @Get('/teacher/students')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStudentsForAttendance(
    @Req() req: any,
    @Query('gradeLevel') gradeLevel: string,
    @Query('section') section: string,
  ) {
    const schoolId = req.user.schoolId;
    if (!schoolId) {
      throw new BadRequestException('School ID is required');
    }
    return this.attendanceService.getStudentsForAttendance(gradeLevel, section, schoolId);
  }

  @Get('/teacher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAttendanceById(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    // Prevent route conflicts - these should be handled by specific routes above
    if (id === 'courses' || id === 'students' || id === 'records') {
      throw new BadRequestException(`Invalid route. Use /attendance/teacher/${id} instead.`);
    }
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.attendanceService.getAttendanceById(id, teacherId);
  }

  @Put('/teacher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateAttendance(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateData: { students: any[]; date?: string },
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.attendanceService.updateAttendance(id, teacherId, updateData);
  }

  @Delete('/teacher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteAttendance(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    await this.attendanceService.deleteAttendance(id, teacherId);
    return { message: 'Attendance deleted successfully' };
  }

  // ==================== ATTENDANCE REPORTS ====================

  @Get('/reports/late')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getLateReport(
    @Req() req: any,
    @Query('gradeLevel') gradeLevel?: string,
    @Query('class') className?: string,
    @Query('teacher') teacherId?: string,
    @Query('student') studentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const schoolId = req.user.schoolId;
    return this.attendanceService.generateLateReport(schoolId, {
      gradeLevel,
      class: className,
      teacherId,
      studentId,
      startDate,
      endDate
    });
  }

  @Get('/reports/absent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getAbsentReport(
    @Req() req: any,
    @Query('gradeLevel') gradeLevel?: string,
    @Query('class') className?: string,
    @Query('teacher') teacherId?: string,
    @Query('student') studentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const schoolId = req.user.schoolId;
    return this.attendanceService.generateAbsentReport(schoolId, {
      gradeLevel,
      class: className,
      teacherId,
      studentId,
      startDate,
      endDate
    });
  }

  @Get('/reports/excused')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getExcusedReport(
    @Req() req: any,
    @Query('gradeLevel') gradeLevel?: string,
    @Query('class') className?: string,
    @Query('teacher') teacherId?: string,
    @Query('student') studentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const schoolId = req.user.schoolId;
    return this.attendanceService.generateExcusedReport(schoolId, {
      gradeLevel,
      class: className,
      teacherId,
      studentId,
      startDate,
      endDate
    });
  }
}
