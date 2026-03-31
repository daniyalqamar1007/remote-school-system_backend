import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UsePipes,
  ValidationPipe,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GradeService } from './grade.service';
import { CreateGradeListDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('grade')
export class GradeController {
  constructor(private readonly service: GradeService) {}

  @Post('createGrade')
  create(@Body() dto: CreateGradeListDto) {
    return this.service.create(dto.grades);
  }

  @Get('getStudentGrades')
  findAll(
    @Query('class') className: string,
    @Query('section') section: string,
    @Query('courseId') courseId: string,
    @Query('teacherId') teacherId: string,
    @Query('term') term?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.findAll(className, section, courseId, teacherId, term, startDate, endDate);
  }
  @Get('by-student/:studentId')
  async getGradesByStudent(@Param('studentId') studentId: string) {
    // Returns all grades for this student, with course & teacher populated
    return this.service.findAllByStudent(studentId);
  }

  @Get('gpa/:studentId')
  async getStudentGPA(@Param('studentId') studentId: string) {
    return this.service.calculateStudentGPA(studentId);
  }

  @Get('student-course')
  findGradesByStudentAndCourse(
    @Query('courseId') courseId: string,
    @Query('studentId') studentId: string,
  ) {
    return this.service.findGradesByStudentAndCourse(studentId, courseId);
  }

  // ==================== STUDENT ENDPOINTS ====================

  @Get('/student/records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT)
  async getStudentGrades(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('courseId') courseId?: string,
    @Query('markingType') markingType?: string,
    @Query('term') term?: string,
    @Query('search') search?: string,
    @Query('studentId') studentIdParam?: string, // For parent portal to specify which student
  ) {
    // Try to get studentId from various possible fields
    // The studentId in Grade model is an ObjectId reference to Student
    // We need to get the actual student profile ID
    let studentId = req.user._id?.toString() || req.user.userId;
    
    // If user is a parent and studentId is provided in query, use that
    if (req.user.role === UserRole.PARENT && studentIdParam) {
      studentId = studentIdParam;
    } else if (req.user.studentProfileId) {
      // If user has studentProfileId, use that instead
      studentId = req.user.studentProfileId.toString();
    }
    
    return this.service.getStudentGrades(
      studentId,
      parseInt(page, 10),
      parseInt(limit, 10),
      { courseId, markingType, term, search },
    );
  }
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('class') className?: string,
    @Query('section') section?: string,
    @Query('courseId') courseId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.service.findOne(id, className, section, courseId, teacherId);
  }

  @Patch('update')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateGrades(@Body() updateGradeListDto: UpdateGradeDto[]) {
    return this.service.updateMany(updateGradeListDto);
  }

  @Delete('delete')
  remove(
    @Query('class') className?: string,
    @Query('section') section?: string,
    @Query('courseId') courseId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    return this.service.remove(className, section, courseId, teacherId);
  }

  // ==================== TEACHER ENDPOINTS ====================

  @Get('/teacher/records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getTeacherGrades(
    @Req() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('courseId') courseId?: string,
    @Query('class') className?: string,
    @Query('section') section?: string,
    @Query('term') term?: string,
    @Query('markingType') markingType?: string,
    @Query('grouped') grouped: string = 'true', // Return grouped data by default
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.service.getTeacherGrades(
      teacherId,
      parseInt(page, 10),
      parseInt(limit, 10),
      { courseId, className, section, term, markingType },
    );
  }

  @Get('/teacher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getGradeById(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.service.getGradeById(id, teacherId);
  }

  @Post('/teacher/create')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createGrades(
    @Req() req: any,
    @Body() dto: CreateGradeListDto,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.service.createGradesForTeacher(teacherId, dto.grades);
  }

  @Put('/teacher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateGrade(
    @Param('id') id: string,
    @Req() req: any,
    @Body() updateData: UpdateGradeDto,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    return this.service.updateGradeForTeacher(id, teacherId, updateData);
  }

  @Delete('/teacher/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteGrade(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    await this.service.deleteGradeForTeacher(id, teacherId);
    return { message: 'Grade deleted successfully' };
  }
}
