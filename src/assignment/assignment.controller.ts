import { Controller, Post, Body, Get, Param, Patch } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Controller('assignment')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  @Post('add')
  async create(@Body() dto: CreateAssignmentDto) {
    return this.assignmentService.create(dto);
  }

  @Get('by-student/:studentId')
  async getByStudent(@Param('studentId') studentId: string) {
    return this.assignmentService.findByStudent(studentId);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.assignmentService.updateStudentStatus(id, dto);
  }
}
