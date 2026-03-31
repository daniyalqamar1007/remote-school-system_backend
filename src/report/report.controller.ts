import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  HttpStatus,
  BadRequestException
} from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto, UpdateReportDto, ExecuteReportDto } from './dto/create-report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { Response } from 'express';
import { customResponse } from '../utils/responses';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async create(@Req() req: any, @Body() createReportDto: CreateReportDto, @Res() res: Response) {
    try {
      const userId = req.user._id.toString();
      const schoolId = req.user.schoolId?.toString() || req.query.schoolId;

      const report = await this.reportService.create(createReportDto, userId, schoolId);
      return customResponse(
        res as any,
        HttpStatus.CREATED,
        'Report created successfully',
        report
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to create report',
        null
      );
    }
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async findAll(
    @Req() req: any,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('type') type: string,
    @Query('isTemplate') isTemplate: string,
    @Res() res: Response
  ) {
    try {
      const userId = req.user._id.toString();
      const schoolId = req.user.schoolId?.toString() || req.query.schoolId;

      const filters: any = {};
      if (status) filters.status = status;
      if (type) filters.type = type;
      if (isTemplate !== undefined) filters.isTemplate = isTemplate === 'true';

      const result = await this.reportService.findAll(
        userId,
        schoolId,
        filters,
        parseInt(page) || 1,
        parseInt(limit) || 10
      );

      return customResponse(
        res as any,
        HttpStatus.OK,
        'Reports retrieved successfully',
        result
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve reports',
        null
      );
    }
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async findOne(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    try {
      const userId = req.user._id.toString();
      const schoolId = req.user.schoolId?.toString() || req.query.schoolId;

      const report = await this.reportService.findOne(id, userId, schoolId);
      return customResponse(
        res as any,
        HttpStatus.OK,
        'Report retrieved successfully',
        report
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.NOT_FOUND,
        error.message || 'Report not found',
        null
      );
    }
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateReportDto: UpdateReportDto,
    @Res() res: Response
  ) {
    try {
      const userId = req.user._id.toString();
      const schoolId = req.user.schoolId?.toString() || req.query.schoolId;

      const report = await this.reportService.update(id, updateReportDto, userId, schoolId);
      return customResponse(
        res as any,
        HttpStatus.OK,
        'Report updated successfully',
        report
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to update report',
        null
      );
    }
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async remove(@Req() req: any, @Param('id') id: string, @Res() res: Response) {
    try {
      const userId = req.user._id.toString();
      const schoolId = req.user.schoolId?.toString() || req.query.schoolId;

      await this.reportService.delete(id, userId, schoolId);
      return customResponse(
        res as any,
        HttpStatus.OK,
        'Report deleted successfully',
        null
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to delete report',
        null
      );
    }
  }

  @Post(':id/execute')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async execute(
    @Req() req: any,
    @Param('id') id: string,
    @Body() executeDto: ExecuteReportDto,
    @Res() res: Response
  ) {
    try {
      const userId = req.user._id.toString();
      const schoolId = req.user.schoolId?.toString() || req.query.schoolId;

      const result = await this.reportService.executeReport(id, executeDto, userId, schoolId);
      return customResponse(
        res as any,
        HttpStatus.ACCEPTED,
        'Report execution started',
        result
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to execute report',
        null
      );
    }
  }

  @Get('executions/:executionId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getExecutionStatus(
    @Req() req: any,
    @Param('executionId') executionId: string,
    @Res() res: Response
  ) {
    try {
      const userId = req.user._id.toString();
      const execution = await this.reportService.getExecutionStatus(executionId, userId);
      return customResponse(
        res as any,
        HttpStatus.OK,
        'Execution status retrieved successfully',
        execution
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.NOT_FOUND,
        error.message || 'Execution not found',
        null
      );
    }
  }

  @Get(':id/executions')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async getExecutionHistory(
    @Req() req: any,
    @Param('id') id: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Res() res: Response
  ) {
    try {
      const userId = req.user._id.toString();
      const result = await this.reportService.getExecutionHistory(
        id,
        userId,
        parseInt(page) || 1,
        parseInt(limit) || 10
      );
      return customResponse(
        res as any,
        HttpStatus.OK,
        'Execution history retrieved successfully',
        result
      );
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to retrieve execution history',
        null
      );
    }
  }

  @Get('executions/:executionId/download')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.SECRETARY, UserRole.TEACHER)
  async downloadReport(
    @Req() req: any,
    @Param('executionId') executionId: string,
    @Res() res: Response
  ) {
    try {
      const userId = req.user._id.toString();
      const execution = await this.reportService.getExecutionStatus(executionId, userId);

      if (execution.status !== 'completed' || !execution.fileUrl) {
        throw new BadRequestException('Report is not ready for download');
      }

      // Redirect to S3 URL or proxy the file
      res.redirect(execution.fileUrl);
    } catch (error) {
      return customResponse(
        res as any,
        error.getStatus ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
        error.message || 'Failed to download report',
        null
      );
    }
  }
}

