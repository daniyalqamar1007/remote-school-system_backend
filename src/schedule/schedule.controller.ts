import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('schedule')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @UseGuards(JwtAuthGuard)
  @Post('add')
  async create(@Body() createScheduleDto: CreateScheduleDto, @Req() req?: any) {
    // Add schoolId and createdBy from JWT token
    const schoolId = req?.user?.schoolId;
    const createdBy = req?.user?.userId || req?.user?._id;
    return this.scheduleService.create(createScheduleDto, schoolId, createdBy);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('class') className?: string,
    @Query('section') section?: string,
    @Query('email') email?: string,
    @Query('teacherId') teacherId?: string,
    @Query('date') date?: string, // accepts: today, yesterday, tomorrow
    @Query('courseId') courseId?: boolean,
    @Req() req?: any,
  ) {
    // Extract schoolId from JWT token for school-based filtering
    const schoolId = req?.user?.schoolId;
    return this.scheduleService.findAll(
      +page,
      +limit,
      className,
      section,
      email,
      teacherId,
      date,
      courseId,
      schoolId,
    );
  }
  @UseGuards(JwtAuthGuard)
  @Get('by-student')
  async getSchedulesByStudentAndDate(
    @Query('studentId') studentId: string,
    @Query('date') date: string,
  ) {
    return this.scheduleService.findSchedulesByStudentIdAndDate(studentId, date);
  }
  @UseGuards(JwtAuthGuard)
  @Get('student-full-schedule')
  async getFullScheduleForStudent(
    @Query('studentId') studentId: string,
  ) {
    return this.scheduleService.findFullScheduleByStudentId(studentId);
  }
  @Get('teacher/:id/total-students')
  async getTotalStudentsAssignedToTeacher(@Param('id') id: string) {
    return this.scheduleService.getTotalStudentsAssignedToTeacher(id);
  }

  @Get('for-student/:id/week')
  async getStudentScheduleWeek(@Param('id') studentId: string) {
    return this.scheduleService.getWeekScheduleForStudent(studentId);
  }

  @Post('validate/distribution')
  async validateScheduleDistribution(@Body() dayOfWeek: any[]) {
    return this.scheduleService.getDistributionRecommendation(dayOfWeek);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.scheduleService.findOne(id);
  }
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateScheduleDto: UpdateScheduleDto,
  ) {
    return this.scheduleService.update(id, updateScheduleDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.scheduleService.remove(id);
  }
}
