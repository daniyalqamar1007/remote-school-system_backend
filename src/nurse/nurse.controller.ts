import { Body, Controller, Get, Post, Put, Delete, Param, Query, NotFoundException, BadRequestException, UseGuards, Req, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { NurseService } from './nurse.service';
import { Nurse } from './schema/nurse.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';

@Controller('nurse')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NurseController {
  constructor(private readonly nurseService: NurseService) {}

  private normalizeSchoolId(req: any): string | null {
    const raw = req?.user?.schoolId;
    if (raw == null) return null;
    return typeof raw === 'object' && raw._id != null ? String(raw._id) : String(raw);
  }

  private async getSchoolIdFromReq(req: any): Promise<string | null> {
    let schoolId = this.normalizeSchoolId(req);
    if (!schoolId && req?.user?._id) {
      schoolId = await this.nurseService.getSchoolIdForUser(req.user._id.toString());
    }
    return schoolId;
  }

  @Post()
  async create(@Body() body: Partial<Nurse>) {
    console.log("📥 Controller body:", body);
    return this.nurseService.create(body);
  }

  @Get('health')
  health() {
    return { ok: true };
  }

  @Get()
  findAll() {
    return this.nurseService.findAll();
  }

  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string) {
    const result = await this.nurseService.resetPassword(id);
    if (!result) {
      throw new NotFoundException('Nurse not found');
    }
    return { message: 'Password reset and email sent!' };
  }

  // ==================== HEALTH RECORDS ====================

  @Post('health-records')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createHealthRecord(@Body() healthData: any, @Req() req: any) {
    const createdBy = req.user._id.toString();
    return await this.nurseService.createHealthRecord(healthData.studentId, healthData, createdBy);
  }

  @Post('health-records/student/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createHealthRecordForStudent(@Param('studentId') studentId: string, @Body() healthData: any, @Req() req: any) {
    try {
      const createdBy = req.user._id.toString();
      const result = await this.nurseService.createHealthRecord(studentId, healthData, createdBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Health record created successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to create health record',
        data: null
      };
    }
  }

  @Get('health-records/student/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getHealthRecord(@Param('studentId') studentId: string, @Query('academicYear') academicYear?: string) {
    const record = await this.nurseService.getHealthRecord(studentId, academicYear);
    if (!record) {
      return { message: 'No health record found', studentId, academicYear };
    }
    return record;
  }

  @Put('health-records/student/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateHealthRecord(@Param('studentId') studentId: string, @Body() updateData: any, @Req() req: any) {
    try {
      const updatedBy = req.user._id.toString();
      const result = await this.nurseService.updateHealthRecord(studentId, updateData, updatedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Health record updated successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to update health record',
        data: null
      };
    }
  }

  @Delete('health-records/student/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteHealthRecord(@Param('studentId') studentId: string, @Req() req: any) {
    try {
      const deletedBy = req.user._id.toString();
      await this.nurseService.deleteHealthRecord(studentId, deletedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Health record deleted successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to delete health record',
        data: null
      };
    }
  }

  @Post('health-records/student/:studentId/physical-exam')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async addPhysicalExam(@Param('studentId') studentId: string, @Body() examData: any, @Req() req: any) {
    const recordedBy = req.user._id.toString();
    return await this.nurseService.addPhysicalExam(studentId, examData, recordedBy);
  }

  @Post('health-records/student/:studentId/nurse-visit')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async addNurseVisit(@Param('studentId') studentId: string, @Body() visitData: any, @Req() req: any) {
    try {
      // Validate required fields
      if (!visitData.reason || !visitData.treatment) {
        return {
          success: false,
          statusCode: 400,
          message: 'Reason and treatment are required fields',
          data: null
        };
      }

      const recordedBy = req.user._id.toString();
      const result = await this.nurseService.addNurseVisit(studentId, visitData, recordedBy);
      
      if (!result) {
        return {
          success: false,
          statusCode: 500,
          message: 'Failed to save nurse visit',
          data: null
        };
      }

      return {
        success: true,
        statusCode: 200,
        message: 'Nurse visit recorded successfully',
        data: null
      };
    } catch (error: any) {
      console.error('Error adding nurse visit:', error);
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to add nurse visit',
        data: null
      };
    }
  }

  @Put('health-records/student/:studentId/nurse-visit/:visitId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateNurseVisit(@Param('studentId') studentId: string, @Param('visitId') visitId: string, @Body() updateData: any, @Req() req: any) {
    try {
      // Validate required fields if they're being updated
      if (updateData.reason !== undefined && !updateData.reason) {
        return {
          success: false,
          statusCode: 400,
          message: 'Reason is required',
          data: null
        };
      }
      if (updateData.treatment !== undefined && !updateData.treatment) {
        return {
          success: false,
          statusCode: 400,
          message: 'Treatment is required',
          data: null
        };
      }

      const updatedBy = req.user._id.toString();
      const result = await this.nurseService.updateNurseVisit(studentId, visitId, updateData, updatedBy);
      
      if (!result) {
        return {
          success: false,
          statusCode: 500,
          message: 'Failed to update nurse visit',
          data: null
        };
      }

      return {
        success: true,
        statusCode: 200,
        message: 'Nurse visit updated successfully',
        data: null
      };
    } catch (error: any) {
      console.error('Error updating nurse visit:', error);
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to update nurse visit',
        data: null
      };
    }
  }

  @Delete('health-records/student/:studentId/nurse-visit/:visitId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteNurseVisit(@Param('studentId') studentId: string, @Param('visitId') visitId: string, @Req() req: any) {
    try {
      const deletedBy = req.user._id.toString();
      const result = await this.nurseService.deleteNurseVisit(studentId, visitId, deletedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Nurse visit deleted successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to delete nurse visit',
        data: null
      };
    }
  }

  @Post('health-records/student/:studentId/immunization')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async addImmunization(@Param('studentId') studentId: string, @Body() immunizationData: any, @Req() req: any) {
    const recordedBy = req.user._id.toString();
    return await this.nurseService.addImmunization(studentId, immunizationData, recordedBy);
  }

  @Post('health-records/student/:studentId/medication')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateMedicationLog(@Param('studentId') studentId: string, @Body() medicationData: any, @Req() req: any) {
    const recordedBy = req.user._id.toString();
    return await this.nurseService.updateMedicationLog(studentId, medicationData, recordedBy);
  }

  @Post('health-records/student/:studentId/health-alert')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async addHealthAlert(@Param('studentId') studentId: string, @Body() alertData: any, @Req() req: any) {
    try {
      const createdBy = req.user._id.toString();
      const result = await this.nurseService.addHealthAlert(studentId, alertData, createdBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Health alert added successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to add health alert',
        data: null
      };
    }
  }

  @Get('health-alerts')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getActiveHealthAlerts(@Req() req: any) {
    const schoolId = req.user.role === UserRole.SUPER_ADMIN ? undefined : (await this.getSchoolIdFromReq(req));
    return await this.nurseService.getActiveHealthAlerts(schoolId);
  }

  @Get('health-alerts/all')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllHealthAlerts(@Req() req: any, @Query() filters: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      if (!schoolId) {
        return {
          success: false,
          statusCode: 400,
          message: 'School ID is required',
          alerts: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }
        };
      }
      const result = await this.nurseService.getAllHealthAlerts(schoolId, filters);
      return {
        success: true,
        statusCode: 200,
        message: 'Health alerts retrieved successfully',
        ...result
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve health alerts',
        alerts: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };
    }
  }

  @Get('health-alerts/stats')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getHealthAlertStats(@Req() req: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      if (!schoolId) {
        return {
          success: false,
          statusCode: 400,
          message: 'School ID is required',
          data: {
            totalAlerts: 0,
            activeAlerts: 0,
            criticalAlerts: 0,
            expiredAlerts: 0
          }
        };
      }
      const stats = await this.nurseService.getHealthAlertStats(schoolId);
      return {
        success: true,
        statusCode: 200,
        message: 'Health alert stats retrieved successfully',
        data: stats
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve health alert stats',
        data: {
          totalAlerts: 0,
          activeAlerts: 0,
          criticalAlerts: 0,
          expiredAlerts: 0
        }
      };
    }
  }

  @Get('documents/stats')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDocumentStats(@Req() req: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      if (!schoolId) {
        return {
          success: false,
          statusCode: 400,
          message: 'School ID is required',
          data: {
            totalDocuments: 0,
            confidentialDocuments: 0,
            recentUploads: 0,
            storageUsed: 0
          }
        };
      }
      const stats = await this.nurseService.getDocumentStats(schoolId);
      return {
        success: true,
        statusCode: 200,
        message: 'Document stats retrieved successfully',
        data: stats
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve document stats',
        data: {
          totalDocuments: 0,
          confidentialDocuments: 0,
          recentUploads: 0,
          storageUsed: 0
        }
      };
    }
  }

  @Get('documents')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllDocuments(@Req() req: any, @Query() filters: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      if (!schoolId) {
        return {
          success: false,
          statusCode: 400,
          message: 'School ID is required',
          documents: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }
        };
      }
      const result = await this.nurseService.getAllDocuments(schoolId, filters);
      return {
        success: true,
        statusCode: 200,
        message: 'Documents retrieved successfully',
        ...result
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve documents',
        documents: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };
    }
  }

  @Get('sports-eligibility/:studentId/:sportsProgramName')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.TEACHER, UserRole.SUPER_ADMIN)
  async getSportsEligibility(@Param('studentId') studentId: string, @Param('sportsProgramName') sportsProgramName: string) {
    return await this.nurseService.getSportsEligibility(studentId, sportsProgramName);
  }

  @Get('sports-approvals/pending')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPendingSportsApprovals(@Req() req: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getPendingSportsApprovals(schoolId);
  }

  @Post('sports-approval/:studentId/:sportsProgramName')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async approveSportsActivity(@Param('studentId') studentId: string, @Param('sportsProgramName') sportsProgramName: string, @Body() body: any, @Req() req: any) {
    return await this.nurseService.approveSportsActivity(studentId, sportsProgramName, body?.notes || '', req.user);
  }

  @Get('health-records/school')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getHealthRecordsBySchool(@Req() req: any, @Query() filters: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getHealthRecordsBySchool(schoolId, filters);
  }

  @Get('reports/:reportType')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateHealthReport(@Param('reportType') reportType: string, @Req() req: any, @Query() filters: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.generateHealthReport(schoolId, reportType, filters);
    
    const csvContent = this.generateCSVFromReportData(reportData, reportType);
    const fileName = `${reportType}-report-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  @Get('reports/immunization')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getImmunizationReport(@Req() req: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.generateHealthReport(schoolId, 'immunization', {});
    
    const csvContent = this.generateCSVFromReportData(reportData, 'immunization-status');
    const fileName = `immunization-report-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  // ==================== NURSE PORTAL SPECIFIC ENDPOINTS ====================

  @Get('students')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStudentsBySchool(@Req() req: any, @Query() filters: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getStudentsBySchool(schoolId, filters);
  }

  @Get('student/:studentId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStudentById(@Param('studentId') studentId: string, @Req() req: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getStudentById(studentId, schoolId);
  }

  @Get('dashboard/stats')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDashboardStats(@Req() req: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getDashboardStats(schoolId);
  }

  @Get('dashboard/visits-trend')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getVisitsTrend(@Req() req: any, @Query('period') period: string = '7days') {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getVisitsTrend(schoolId, period);
  }

  @Get('dashboard/health-overview')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getHealthOverview(@Req() req: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getHealthOverview(schoolId);
  }

  @Get('dashboard/recent-visits')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getRecentVisits(@Req() req: any, @Query('limit') limit: string = '5') {
    const schoolId = await this.getSchoolIdFromReq(req);
    return await this.nurseService.getRecentVisits(schoolId, parseInt(limit));
  }

  @Get('visits/stats')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getNurseVisitStats(@Req() req: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      if (!schoolId) {
        return {
          success: false,
          statusCode: 400,
          message: 'School ID is required',
          data: {
            totalVisits: 0,
            visitsToday: 0,
            emergencyVisits: 0,
            followUpRequired: 0
          }
        };
      }
      const stats = await this.nurseService.getNurseVisitStats(schoolId);
      return {
        success: true,
        statusCode: 200,
        message: 'Nurse visit stats retrieved successfully',
        data: stats
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve nurse visit stats',
        data: {
          totalVisits: 0,
          visitsToday: 0,
          emergencyVisits: 0,
          followUpRequired: 0
        }
      };
    }
  }

  @Get('visits')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getAllNurseVisits(@Req() req: any, @Query() filters: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      console.log('[getAllNurseVisits Controller] SchoolId:', schoolId, 'Filters:', filters);
      
      if (!schoolId) {
        return {
          success: false,
          statusCode: 400,
          message: 'School ID is required',
          visits: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 10,
            totalPages: 0
          }
        };
      }
      
      const result = await this.nurseService.getAllNurseVisits(schoolId, filters);
      console.log('[getAllNurseVisits Controller] Result:', { 
        totalVisits: result.visits?.length || 0, 
        pagination: result.pagination 
      });
      
      return {
        success: true,
        statusCode: 200,
        message: 'Nurse visits retrieved successfully',
        ...result
      };
    } catch (error: any) {
      console.error('[getAllNurseVisits Controller] Error:', error);
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to retrieve nurse visits',
        visits: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10,
          totalPages: 0
        }
      };
    }
  }

  // ==================== MISSING ENDPOINTS FOR FEATURES ====================

  @Put('health-records/student/:studentId/dismiss-health-alert')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async dismissHealthAlert(@Param('studentId') studentId: string, @Body() body: { alertId: string }, @Req() req: any) {
    const updatedBy = req.user._id.toString();
    return await this.nurseService.dismissHealthAlert(studentId, body.alertId, updatedBy);
  }

  @Put('health-records/student/:studentId/health-alert/:alertId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateHealthAlert(@Param('studentId') studentId: string, @Param('alertId') alertId: string, @Body() updateData: any, @Req() req: any) {
    try {
      const updatedBy = req.user._id.toString();
      const result = await this.nurseService.updateHealthAlert(studentId, alertId, updateData, updatedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Health alert updated successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to update health alert',
        data: null
      };
    }
  }

  @Delete('health-records/student/:studentId/health-alert/:alertId')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteHealthAlert(@Param('studentId') studentId: string, @Param('alertId') alertId: string, @Req() req: any) {
    try {
      const deletedBy = req.user._id.toString();
      const result = await this.nurseService.deleteHealthAlert(studentId, alertId, deletedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Health alert deleted successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to delete health alert',
        data: null
      };
    }
  }

  @Post('health-records/student/:studentId/upload-document')
  @UseInterceptors(FileInterceptor('file'))
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async uploadDocument(@Param('studentId') studentId: string, @UploadedFile() file: any, @Body() body: any, @Req() req: any) {
    try {
      const uploadedBy = req.user._id.toString();
      const documentData = {
        file,
        category: body.category,
        description: body.description,
        isConfidential: body.isConfidential === 'true',
        accessLevel: body.accessLevel,
        tags: body.tags ? body.tags.split(',').map((tag: string) => tag.trim()) : []
      };
      const result = await this.nurseService.uploadDocument(studentId, documentData, uploadedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Document uploaded successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to upload document',
        data: null
      };
    }
  }

  @Post('health-records/student/:studentId/download-document')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async downloadDocument(@Param('studentId') studentId: string, @Body() body: { documentId: string }) {
    try {
      const result = await this.nurseService.downloadDocument(studentId, body.documentId);
      return {
        success: true,
        statusCode: 200,
        message: 'Download URL generated successfully',
        data: result
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to generate download URL',
        data: null
      };
    }
  }

  @Delete('health-records/student/:studentId/delete-document')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deleteDocument(@Param('studentId') studentId: string, @Body() body: { documentId: string }, @Req() req: any) {
    try {
      const deletedBy = req.user._id.toString();
      const result = await this.nurseService.deleteDocument(studentId, body.documentId, deletedBy);
      return {
        success: true,
        statusCode: 200,
        message: 'Document deleted successfully',
        data: null
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: error.status || 500,
        message: error.message || 'Failed to delete document',
        data: null
      };
    }
  }

  @Post('reports/generate')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateReport(@Body() reportConfig: any, @Req() req: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.generateReport(schoolId, reportConfig);
    
    // Generate CSV content
    const csvContent = this.generateCSVFromReportData(reportData, reportConfig.reportType);
    const fileName = `${reportConfig.reportType}-report-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  @Get('reports/medication')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getMedicationReport(@Req() req: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.getMedicationReport(schoolId);
    
    const csvContent = this.generateCSVFromReportData(reportData, 'medication-log');
    const fileName = `medication-report-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  @Get('reports/visits')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getVisitsReport(@Req() req: any, @Res() res: any) {
    try {
      const schoolId = await this.getSchoolIdFromReq(req);
      if (!schoolId) {
        return res.status(400).json({
          success: false,
          message: 'School ID is required'
        });
      }
      
      const reportData = await this.nurseService.getVisitsReport(schoolId);
      
      const csvContent = this.generateCSVFromReportData(reportData, 'nurse-visits');
      const fileName = `visits-report-${new Date().toISOString().split('T')[0]}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(csvContent);
    } catch (error: any) {
      console.error('Error generating visits report:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate visits report'
      });
    }
  }

  @Get('reports/health-alerts')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getHealthAlertsReport(@Req() req: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.getHealthAlertsReport(schoolId);
    
    const csvContent = this.generateCSVFromReportData(reportData, 'health-alerts');
    const fileName = `health-alerts-report-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  @Get('reports/health-overview')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getHealthOverviewReport(@Req() req: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.generateHealthReport(schoolId, 'health-overview', {});
    
    const csvContent = this.generateCSVFromReportData(reportData, 'health-overview');
    const fileName = `health-overview-report-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  @Get('reports/nurse-visit-medication')
  @Roles(UserRole.NURSE, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getNurseVisitMedicationReport(@Req() req: any, @Res() res: any) {
    const schoolId = await this.getSchoolIdFromReq(req);
    const reportData = await this.nurseService.generateHealthReport(schoolId, 'nurse-visit-medication', {});
    const csvContent = this.generateCSVFromReportData(reportData, 'nurse-visit-medication');
    const fileName = `nurse-visit-medication-report-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    return res.send(csvContent);
  }

  private generateCSVFromReportData(reportData: any, reportType: string): string {
    let csvContent = '';
    
    switch (reportType) {
      case 'health-overview':
        csvContent = 'Report Type,Total Students,Students with Health Records,Total Nurse Visits,Active Alerts,Active Medications\n';
        csvContent += `Health Overview,${reportData.totalStudents},${reportData.studentsWithHealthRecords},${reportData.totalNurseVisits},${reportData.activeAlerts},${reportData.activeMedications}\n`;
        if (reportData.studentOverviews && Array.isArray(reportData.studentOverviews)) {
          csvContent += '\nStudent Name,Grade,Age,Nurse Name (Last Visit),Medication Names,Total Visits,Active Alerts\n';
          reportData.studentOverviews.forEach((s: any) => {
            const name = (s.studentName || 'Unknown').replace(/"/g, '""');
            const grade = (s.grade || 'N/A').replace(/"/g, '""');
            const age = s.age != null ? String(s.age) : 'N/A';
            const nurse = (s.nurseName || 'N/A').replace(/"/g, '""');
            const meds = (s.medicationNamesStr ?? (s.medicationNames && s.medicationNames.length ? s.medicationNames.join('; ') : 'None')).replace(/"/g, '""');
            const visits = s.totalNurseVisits != null ? String(s.totalNurseVisits) : '0';
            const alerts = s.activeAlerts != null ? String(s.activeAlerts) : '0';
            csvContent += `"${name}","${grade}",${age},"${nurse}","${meds}",${visits},${alerts}\n`;
          });
        }
        break;
        
      case 'immunization-status':
        csvContent = 'Student Name,Grade,Vaccine Name,Date Administered,Administrator,Next Due Date\n';
        if (reportData.immunizations && Array.isArray(reportData.immunizations)) {
          reportData.immunizations.forEach((immunization: any) => {
            const name = (immunization.studentName || 'Unknown').replace(/"/g, '""');
            const grade = (immunization.gradeLevel || 'N/A').replace(/"/g, '""');
            csvContent += `"${name}","${grade}","${immunization.vaccineName || 'N/A'}","${immunization.dateAdministered || 'N/A'}","${immunization.administrator || 'N/A'}","${immunization.nextDueDate || 'N/A'}"\n`;
          });
        }
        break;
        
      case 'medication-log':
        csvContent = 'Student Name,Grade,Medication Name,Dosage,Frequency,Start Date,End Date,Status\n';
        if (reportData.activeMedications && Array.isArray(reportData.activeMedications)) {
          reportData.activeMedications.forEach((med: any) => {
            const name = (med.studentName || 'Unknown').replace(/"/g, '""');
            const grade = (med.gradeLevel || 'N/A').replace(/"/g, '""');
            csvContent += `"${name}","${grade}","${med.medicationName || 'N/A'}","${med.dosage || 'N/A'}","${med.frequency || 'N/A'}","${med.startDate || 'N/A'}","${med.endDate || 'N/A'}","${med.status || 'Active'}"\n`;
          });
        }
        break;
        
      case 'nurse-visits':
        csvContent = 'Date,Student Name,Grade,Reason,Disposition,Priority,Status\n';
        if (reportData.visits && Array.isArray(reportData.visits) && reportData.visits.length > 0) {
          reportData.visits.forEach((visit: any) => {
            const date = visit.date || 'N/A';
            const studentName = (visit.studentName || 'Unknown').replace(/"/g, '""');
            const grade = visit.grade || 'N/A';
            const reason = (visit.reason || 'N/A').replace(/"/g, '""');
            const disposition = (visit.disposition || 'N/A').replace(/"/g, '""');
            const priority = visit.priority || 'N/A';
            const status = visit.status || 'N/A';
            csvContent += `"${date}","${studentName}","${grade}","${reason}","${disposition}","${priority}","${status}"\n`;
          });
        } else {
          // Add a row indicating no visits found
          csvContent += '"No visits found","","","","","",""\n';
        }
        break;

      case 'nurse-visit-medication':
        csvContent = 'Nurse Name,Student Name,Visit Date,Reason,Medication Name\n';
        if (reportData.rows && Array.isArray(reportData.rows)) {
          reportData.rows.forEach((row: any) => {
            const nurse = (row.nurseName || 'N/A').replace(/"/g, '""');
            const student = (row.studentName || 'Unknown').replace(/"/g, '""');
            const date = row.visitDate || 'N/A';
            const reason = (row.reason || 'N/A').replace(/"/g, '""');
            const med = (row.medicationName || 'N/A').replace(/"/g, '""');
            csvContent += `"${nurse}","${student}","${date}","${reason}","${med}"\n`;
          });
        }
        break;
        
      case 'health-alerts':
        csvContent = 'Student Name,Grade,Alert Type,Severity,Description,Status,Created Date\n';
        if (reportData.activeAlerts && Array.isArray(reportData.activeAlerts)) {
          reportData.activeAlerts.forEach((alert: any) => {
            const name = (alert.studentName || 'Unknown').replace(/"/g, '""');
            const grade = (alert.gradeLevel || 'N/A').replace(/"/g, '""');
            csvContent += `"${name}","${grade}","${alert.type || 'N/A'}","${alert.severity || 'N/A'}","${(alert.description || 'N/A').replace(/"/g, '""')}","Active","${alert.createdDate || 'N/A'}"\n`;
          });
        }
        break;
        
      default:
        csvContent = 'Report Type,Data\n';
        csvContent += `${reportType},"${JSON.stringify(reportData)}"\n`;
    }
    
    return csvContent;
  }
}
