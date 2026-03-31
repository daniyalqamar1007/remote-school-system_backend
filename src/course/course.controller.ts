import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Controller('course')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post('add')
  create(@Body() createCourseDto: CreateCourseDto) {
    console.log('create');
    return this.courseService.create(createCourseDto);
  }

  @Get()
  findAll(
    @Query('name') coursename?: string,
    @Query('active') active?: boolean,
    @Query('special') special?: boolean,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.courseService.findAll(coursename, active, special, schoolId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.courseService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCourseDto: UpdateCourseDto) {
    return this.courseService.update(id, updateCourseDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.courseService.remove(id);
  }

  // Course Outline endpoints
  @Post(':id/outline/upload')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadCourseOutline(
    @Param('id') courseId: string,
    @UploadedFile() file: any,
    @Req() req: any,
  ) {
    return this.courseService.uploadCourseOutline(courseId, file, req.user);
  }

  @Get(':id/outline')
  @Roles(UserRole.TEACHER, UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.STUDENT, UserRole.PARENT)
  async getCourseOutline(@Param('id') courseId: string) {
    return this.courseService.getCourseOutline(courseId);
  }

  @Get('outline/all')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY)
  async getAllCourseOutlines(@Query('schoolId') schoolId?: string, @Req() req?: any) {
    const targetSchoolId = req?.user?.role === 'SUPER_ADMIN' ? (schoolId || req?.user?.schoolId) : req?.user?.schoolId;
    return this.courseService.getAllCourseOutlines(targetSchoolId);
  }
}
