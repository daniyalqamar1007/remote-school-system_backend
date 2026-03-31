import {
  Controller,
  Post,
  Body,
  Put,
  Param,
  Delete,
  Get,
  Query,
  UseInterceptors,
  UploadedFile,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { Teacher } from './schema/schema.teacher';
import { UpdateTeacherDto } from './dto/update-teaacher.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerOptionsForXlxs, UploadedFileType } from '../../utils/multer.config';
import { ResponseDto } from '../dto/response.dto';
import { Response } from 'express';
import * as fs from 'fs';

@Controller('teachers')
export class TeacherController {
  constructor(private readonly teacherService: TeacherService) {}

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('department') department?: string,
    @Query('email') email?: string,
  ) {
    return this.teacherService.findAll(
      Number(page),
      Number(limit),
      startDate,
      endDate,
      department,
      email,
    );
  }

  @Post('add')
  async addTeacher(
    @Body() createTeacherDto: CreateTeacherDto,
  ): Promise<Teacher | ResponseDto> {
    return this.teacherService.addTeacher(createTeacherDto);
  }

  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async bulkUpload(@UploadedFile() file: UploadedFileType) {
    let insertedCount = 0;
    let skippedCount = 0;

    try {
      // Call the service to handle the bulk upload
      const result = await this.teacherService.bulkUpload(file);

      insertedCount = result.insertedCount;
      skippedCount = result.skippedCount;

      return {
        status: HttpStatus.OK,
        msg: `Inserted ${insertedCount} teachers and skipped ${skippedCount} records due to conflicts.`,
      };
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        msg: 'An error occurred during the teacher bulk upload process.',
      };
    } finally {
      // Clean up the file after processing
      if (file && file.path) {
        fs.unlinkSync(file.path); // Remove the uploaded file from the server
      }
    }
  }
  @Get('assign-course')
  async assignCourse(
    @Query('teacherId') teacherId: string,
    @Query('courseId') courseId: string,
  ) {
    return this.teacherService.assignCourseToTeacher(teacherId, courseId);
  }
  @Get('get/assignedCourses')
  async getAssignedCourses(@Query('teacherId') teacherId: string) {
    try {
      const courses = await this.teacherService.getAssignedCoursesForTeacher(teacherId);
      return {
        success: true,
        data: courses,
        total: courses.length
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  }
  @Get('remove-course')
  async removeCourseAssignment(
    @Query('teacherId') teacherId: string,
    @Query('courseId') courseId: string,
  ) {
    return this.teacherService.removeCourseAssignment(teacherId, courseId);
  }

  @Get('unassigned-courses')
  async getUnassignedCourses(@Query('departmentId') departmentId: string) {
    if (!departmentId) {
      throw new Error('departmentId is required');
    }

    return this.teacherService.getUnassignedCoursesByTeacherId(departmentId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Teacher> {
    return this.teacherService.findOne(id);
  }

  // Dashboard stats endpoint
  @Get('dashboard/stats/:teacherId')
  async getDashboardStats(@Param('teacherId') teacherId: string) {
    return this.teacherService.getDashboardStats(teacherId);
  }

  // Get students assigned to teacher's courses endpoint
  @Get('students/assigned/:teacherId')
  async getAssignedStudents(
    @Param('teacherId') teacherId: string,
    @Query('schoolId') schoolId?: string
  ) {
    try {
      const students = await this.teacherService.getStudentsForTeacher(teacherId, schoolId);
      return {
        success: true,
        data: students,
        total: students.length
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  }

  @Put(':id')
  async updateTeacher(
    @Param('id') id: string,
    @Body() updateTeacherDto: UpdateTeacherDto,
  ): Promise<Teacher> {
    return this.teacherService.updateTeacher(id, updateTeacherDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.teacherService.delete(id);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async importStudents(@UploadedFile() file: UploadedFileType) {
    if (!file) {
      throw new Error('File is required');
    }
    return this.teacherService.importStudents(file.path);
  }

  // Excel template endpoints for teachers
  @Get('excel/student-template')
  async downloadStudentTemplate(@Res() res: Response) {
    try {
      const buffer = await this.teacherService.generateStudentTemplate();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=student-template.xlsx');
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate template' });
    }
  }

  @Post('excel/upload-students')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async uploadStudentData(
    @UploadedFile() file: UploadedFileType,
    @Body('teacherId') teacherId: string,
  ) {
    if (!file) {
      throw new Error('File is required');
    }
    return this.teacherService.processStudentUpload(file.path, teacherId);
  }

  @Get('excel/export-students/:teacherId')
  async exportStudentData(
    @Param('teacherId') teacherId: string,
    @Res() res: Response,
  ) {
    try {
      const buffer = await this.teacherService.exportStudentData(teacherId);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=my-students.xlsx');
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export student data' });
    }
  }
}
