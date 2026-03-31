import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors, UploadedFiles } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { LessonPlanService } from './lesson-plan.service';
import { LessonPlanStatus } from './schema/lesson-plan.schema';

type MulterFile = { fieldname: string; originalname: string; encoding: string; mimetype: string; size: number; buffer?: Buffer; destination?: string; filename?: string; path?: string };

@Controller('lesson-plan')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LessonPlanController {
  constructor(private readonly lessonPlanService: LessonPlanService) {}

  @Post()
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 10 },
  ]))
  create(@Body() createLessonPlanDto: any, @UploadedFiles() uploaded?: { file?: MulterFile[]; files?: MulterFile[] }, @Req() req?: any) {
    if (typeof createLessonPlanDto.objectives === 'string') {
      try { createLessonPlanDto.objectives = JSON.parse(createLessonPlanDto.objectives); } catch { createLessonPlanDto.objectives = []; }
    }
    if (typeof createLessonPlanDto.materials === 'string') {
      try { createLessonPlanDto.materials = JSON.parse(createLessonPlanDto.materials); } catch { createLessonPlanDto.materials = []; }
    }
    if (!createLessonPlanDto.teacherId && req?.user?._id) createLessonPlanDto.teacherId = req.user._id.toString();
    if (!createLessonPlanDto.teacherId && req?.user?.userId) createLessonPlanDto.teacherId = req.user.userId;
    if (uploaded?.file?.[0]) createLessonPlanDto.file = uploaded.file[0];
    if (uploaded?.files?.length) createLessonPlanDto.files = uploaded.files;
    return this.lessonPlanService.create(createLessonPlanDto);
  }

  @Get()
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  findAll(@Query('status') status?: LessonPlanStatus, @Query('teacherId') teacherId?: string) {
    const filters: any = {};
    if (status) filters.status = status;
    if (teacherId) filters.teacherId = teacherId;
    return this.lessonPlanService.findAll(filters);
  }

  @Get('pending')
  findPending() {
    return this.lessonPlanService.findByStatus(LessonPlanStatus.PENDING);
  }

  @Get('teacher/:teacherId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  findByTeacher(
    @Param('teacherId') teacherId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('courseId') courseId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Req() req?: any
  ) {
    // Teachers can only see their own plans unless they're admin
    if (req?.user?.role === UserRole.TEACHER && req?.user?._id?.toString() !== teacherId) {
      throw new Error('Unauthorized: You can only view your own lesson plans');
    }
    
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    const filters: any = {};
    if (courseId) filters.courseId = courseId;
    if (status) filters.status = status;
    if (search) filters.search = search;
    
    return this.lessonPlanService.findByTeacher(teacherId, pageNum, limitNum, filters);
  }

  @Get('teacher/:teacherId/stats')
  getTeacherStats(@Param('teacherId') teacherId: string) {
    return this.lessonPlanService.getStatsByTeacher(teacherId);
  }

  @Get('debug/:teacherId')
  debugLessonPlans(@Param('teacherId') teacherId: string) {
    return this.lessonPlanService.debugLessonPlans(teacherId);
  }



  @Get(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  findOne(@Param('id') id: string) {
    return this.lessonPlanService.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 10 },
  ]))
  update(
    @Param('id') id: string,
    @Body() updateLessonPlanDto: any,
    @UploadedFiles() uploaded?: { file?: MulterFile[]; files?: MulterFile[] },
    @Req() req?: any,
  ) {
    if (typeof updateLessonPlanDto.objectives === 'string') {
      try { updateLessonPlanDto.objectives = JSON.parse(updateLessonPlanDto.objectives); } catch { updateLessonPlanDto.objectives = []; }
    }
    if (typeof updateLessonPlanDto.materials === 'string') {
      try { updateLessonPlanDto.materials = JSON.parse(updateLessonPlanDto.materials); } catch { updateLessonPlanDto.materials = []; }
    }
    if (uploaded?.file?.[0]) updateLessonPlanDto.file = uploaded.file[0];
    if (uploaded?.files?.length) updateLessonPlanDto.files = uploaded.files;
    const teacherId = req?.user?._id?.toString() || req?.user?.userId;
    if (req?.user?.role === UserRole.TEACHER) {
      return this.lessonPlanService.update(id, updateLessonPlanDto, teacherId);
    }
    return this.lessonPlanService.update(id, updateLessonPlanDto);
  }

  @Delete(':id')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  remove(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    const teacherId = req.user._id?.toString() || req.user.userId;
    // Only enforce teacher ownership if user is a teacher
    if (req.user.role === UserRole.TEACHER) {
      return this.lessonPlanService.remove(id, teacherId);
    }
    // Admins can delete any lesson plan
    return this.lessonPlanService.remove(id);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  approve(
    @Param('id') id: string,
    @Body() body: { comments?: string },
    @Req() req: any,
  ) {
    const reviewedBy = req.user._id?.toString() || req.user.userId;
    return this.lessonPlanService.approve(id, body.comments || '', reviewedBy);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  reject(
    @Param('id') id: string,
    @Body() body: { feedback: string[] },
    @Req() req: any,
  ) {
    const reviewedBy = req.user._id?.toString() || req.user.userId;
    return this.lessonPlanService.reject(id, body.feedback, reviewedBy);
  }

  @Post(':id/request-revision')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  requestRevision(
    @Param('id') id: string,
    @Body() body: { comments: string[] },
    @Req() req: any,
  ) {
    const reviewedBy = req.user._id?.toString() || req.user.userId;
    return this.lessonPlanService.requestRevision(id, body.comments, reviewedBy);
  }

  @Post('cleanup')
  cleanupInvalid() {
    return this.lessonPlanService.cleanupInvalidLessonPlans();
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getStats(@Req() req: any) {
    const role = req.user.role;
    const schoolId = role === 'SUPER_ADMIN' ? (req.query?.schoolId || req.user.schoolId) : req.user.schoolId;
    return this.lessonPlanService.getStats(schoolId);
  }

}
