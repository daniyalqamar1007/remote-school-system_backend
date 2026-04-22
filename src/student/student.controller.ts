import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Delete,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpStatus,
  Inject,
  UseGuards,
} from '@nestjs/common';
import { StudentService } from './student.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { Student } from './schema/student.schema';
import { UpdateStudentDto } from './dto/update-student.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerOptionsForXlxs, UploadedFileType } from '../../utils/multer.config';
import { ResponseDto } from '../dto/response.dto';
import * as fs from 'fs';
import { AssignmentService } from '../assignment/assignment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
@Controller('student')
export class StudentController {
  constructor(private readonly studentService: StudentService) {}

  calculateGraduationDate(enrollDate: string): string {
    const enrollmentYear = new Date(enrollDate).getFullYear();
    const graduationYear = enrollmentYear + 5;
    return `${graduationYear}`; // Assuming graduation is June 15th of that year
  }

  @Post('bulk-upload')
  @UseInterceptors(FileInterceptor('file', multerOptionsForXlxs))
  async bulk(@UploadedFile() file: UploadedFileType) {
    let insertedCount = 0;
    let skippedCount = 0;

    try {
      // Call the service to handle the bulk upload
      const result = await this.studentService.bulkUpload(file);

      insertedCount = result.insertedCount;
      skippedCount = result.skippedCount;

      return {
        status: HttpStatus.OK,
        msg: `inserted ${insertedCount} students and skipped ${skippedCount} records due to conflicts.`,
      };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        msg: 'An error occurred during the bulk upload process.',
      };
    } finally {
      // Clean up the file after processing
      if (file && file.path) {
        fs.unlinkSync(file.path); // Remove the uploaded file from the server
      }
    }
  }
  // GET /student/:id/daily-attendance
  @Get(':id/daily-attendance')
  async getDailyAttendance(@Param('id') id: string) {
    return this.studentService.getDailyAttendanceForStudent(id);
  }

  // POST /student/:id/attendance/explanation
  @Post(':id/attendance/explanation')
  @UseGuards(JwtAuthGuard)
  async submitAttendanceExplanation(
    @Param('id') studentId: string,
    @Body() body: { date: string; explanation: string; status: string },
  ) {
    if (!body.date || !body.explanation) {
      throw new BadRequestException('Date and explanation are required');
    }
    return this.studentService.submitAttendanceExplanation(
      studentId,
      body.date,
      body.explanation,
      body.status,
    );
  }


  @Get('attendance')
  async getAttendanceByStudentId(
    @Query('studentId') studentId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    if (!studentId) {
      throw new BadRequestException('studentId is required');
    }
    return this.studentService.getAttendanceByStudentId(studentId, startDate, endDate);
  }


@Get(':id/report-cards')
async getReportCards(@Param('id') studentId: string) {
  try {
    // Check if student exists in the unified auth system first
    const student = await this.studentService.findOne(studentId);
    if (!student) {
      // Return empty array instead of null error
      return [];
    }
    return student.reportCards || [];
  } catch (error) {
    console.error('Error fetching report cards:', error);
    return [];
  }
}

  @Post('add')
  async create(
    @Body() createStudentDto: CreateStudentDto,
  ): Promise<Student | ResponseDto> {
    return this.studentService.create(createStudentDto);
  }

  @Get('course')
  async getStudentCourseAttendance(
    @Query('studentId') studentId: string,
    @Query('courseCode') courseCode: string,
  ) {
    return this.studentService.getStudentAttendanceByCourseCode(
      courseCode,
      studentId,
    );
  }

  @Get()
  async findAll(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('studentId') studentId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('className') className?: string,
    @Query('schoolId') schoolId?: string,
  ) {
    return this.studentService.findAll(
      Number(page),
      Number(limit),
      studentId,
      startDate,
      endDate,
      className,
      schoolId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Student> {
    return this.studentService.findOne(id); // <-- Make sure!
  }
  @Get(':id/assignments')
  async getAssignments(@Param('id') id: string, @Inject(AssignmentService) assignmentService: AssignmentService) {
    return assignmentService.findByStudent(id);
  }
  
  @Get(':id/communications')
  async getCommunications(@Param('id') id: string) {
    return this.studentService.getStudentCommunications(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/health-records')
  async getHealthRecords(@Param('id') id: string) {
    return this.studentService.getStudentHealthRecords(id);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.studentService.delete(id);
  }
  @Get('by-student-id/:studentId')
  findByStudentId(@Param('studentId') sid: string) {
    return this.studentService.findByStudentId(sid);
  }
  
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ) {
    return this.studentService.update(id, updateStudentDto);
  }
}
