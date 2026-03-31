import { Controller, Post, Body, Get, Query, Param, Patch, Delete, UseGuards, Request } from '@nestjs/common';
import { AbsenceService } from './absence.service';
import { CreateAbsenceDto } from './dto/create-absence.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('absence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbsenceController {
  constructor(private readonly absenceService: AbsenceService) {}

  @Post('submit')
  async create(@Body() dto: CreateAbsenceDto) {
    return this.absenceService.create(dto);
  }

  @Post('submit-note')
  @Roles(UserRole.PARENT)
  async submitAbsenceNote(
    @Body() {
      studentId,
      absenceDate,
      reason,
      description,
      supportingDocument,
    }: {
      studentId: string;
      absenceDate: string;
      reason: string;
      description: string;
      supportingDocument?: string;
    },
    @Request() req: any,
  ) {
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    
    return this.absenceService.submitAbsenceNote(
      studentId,
      absenceDate,
      reason,
      description,
      req.user.userId,
      req.user.schoolId || 'default',
      academicYear,
      supportingDocument,
    );
  }

  @Get('student/:studentId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SECRETARY, UserRole.PARENT)
  async findByStudent(@Param('studentId') studentId: string) {
    return this.absenceService.findByStudent(studentId);
  }

  @Get('parent')
  @Roles(UserRole.PARENT)
  async findByParent(@Request() req: any) {
    return this.absenceService.findByParent(req.user.userId);
  }

  @Get('pending')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY)
  async getPendingAbsenceNotes(@Request() req: any) {
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    
    return this.absenceService.getPendingAbsenceNotes(
      req.user.schoolId || 'default',
      academicYear,
    );
  }

  @Patch(':id/review')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY)
  async reviewAbsenceNote(
    @Param('id') id: string,
    @Body() {
      status,
      reviewNotes,
    }: {
      status: 'approved' | 'rejected';
      reviewNotes?: string;
    },
    @Request() req: any,
  ) {
    return this.absenceService.reviewAbsenceNote(
      id,
      status,
      req.user.userId,
      reviewNotes,
    );
  }

  @Get('statistics')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY)
  async getAbsenceStatistics(@Request() req: any, @Query('studentId') studentId?: string) {
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${currentYear + 1}`;
    
    return this.absenceService.getAbsenceStatistics(
      req.user.schoolId || 'default',
      academicYear,
      studentId,
    );
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.SECRETARY)
  async updateStatus(
    @Param('id') id: string,
    @Body() { status }: { status: 'pending' | 'approved' | 'rejected' }
  ) {
    return this.absenceService.updateStatus(id, status);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async delete(@Param('id') id: string) {
    return this.absenceService.delete(id);
  }
}