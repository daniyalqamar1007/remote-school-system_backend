import { Injectable, NotFoundException, BadRequestException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Report, ReportDocument, ReportExecution, ReportExecutionDocument } from './schema/report.schema';
import { CreateReportDto, UpdateReportDto, ExecuteReportDto } from './dto/create-report.dto';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Student } from '../student/schema/student.schema';
import { Teacher } from '../teacher/schema/schema.teacher';
import { Grade } from '../grade/schema/schema.garde';
import { Attendance } from '../attendance/schema/schema.attendance';
import { DisciplinaryAction } from '../behavior/schema/disciplinary-action.schema';
import { Club } from '../club/schema/club.schema';
import { Course } from '../course/schema/course.schema';
import { Parent } from '../parent/schema/parent.schema';
import { School, SchoolDocument } from '../auth/schemas/school.schema';
import * as XLSX from 'xlsx';
import { AwsService } from '../aws/aws.service';
import { uploadBufferToS3, buildS3KeyPath } from '../../utils/s3Helpers';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<ReportDocument>,
    @InjectModel(ReportExecution.name) private reportExecutionModel: Model<ReportExecutionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Student.name) private studentModel: Model<Student>,
    @InjectModel(Teacher.name) private teacherModel: Model<Teacher>,
    @InjectModel(Grade.name) private gradeModel: Model<Grade>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(DisciplinaryAction.name) private disciplineModel: Model<DisciplinaryAction>,
    @InjectModel(Club.name) private clubModel: Model<Club>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Parent.name) private parentModel: Model<Parent>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    private awsService: AwsService,
  ) {}

  // ==================== REPORT CRUD ====================

  async create(createReportDto: CreateReportDto, userId: string, schoolId?: string): Promise<ReportDocument> {
    const reportData: any = {
      ...createReportDto,
      createdBy: new Types.ObjectId(userId),
      lastModifiedBy: new Types.ObjectId(userId),
    };

    if (schoolId) {
      reportData.schoolId = new Types.ObjectId(schoolId);
    }

    const report = new this.reportModel(reportData);
    const savedReport = await report.save();
    return await this.reportModel.findById(savedReport._id)
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .lean()
      .exec() as any;
  }

  async findAll(
    userId: string,
    schoolId?: string,
    filters?: { status?: string; type?: string; isTemplate?: boolean },
    page: number = 1,
    limit: number = 10
  ): Promise<{ reports: ReportDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = {
      $or: [
        { createdBy: new Types.ObjectId(userId) },
        { isPublic: true },
        { isTemplate: true }
      ]
    };

    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.type) {
      query.type = filters.type;
    }

    if (filters?.isTemplate !== undefined) {
      query.isTemplate = filters.isTemplate;
    }

    const skip = (page - 1) * limit;
    const [reports, total] = await Promise.all([
      this.reportModel.find(query)
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.reportModel.countDocuments(query).exec()
    ]);

    return {
      reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async findOne(id: string, userId: string, schoolId?: string): Promise<ReportDocument> {
    const query: any = {
      _id: new Types.ObjectId(id),
      $or: [
        { createdBy: new Types.ObjectId(userId) },
        { isPublic: true },
        { isTemplate: true }
      ]
    };

    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const report = await this.reportModel.findOne(query)
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .lean()
      .exec();
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report as any;
  }

  async update(id: string, updateReportDto: UpdateReportDto, userId: string, schoolId?: string): Promise<ReportDocument> {
    const query: any = {
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId)
    };

    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const report = await this.reportModel.findOne(query).exec();
    if (!report) {
      throw new NotFoundException('Report not found or you do not have permission to update it');
    }

    Object.assign(report, {
      ...updateReportDto,
      lastModifiedBy: new Types.ObjectId(userId),
      lastModified: new Date()
    });

    const savedReport = await report.save();
    return await this.reportModel.findById(savedReport._id)
      .populate('createdBy', 'firstName lastName email')
      .populate('lastModifiedBy', 'firstName lastName email')
      .lean()
      .exec() as any;
  }

  async delete(id: string, userId: string, schoolId?: string): Promise<void> {
    const query: any = {
      _id: new Types.ObjectId(id),
      createdBy: new Types.ObjectId(userId)
    };

    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const result = await this.reportModel.deleteOne(query).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('Report not found or you do not have permission to delete it');
    }
  }

  // ==================== REPORT EXECUTION ====================

  async executeReport(
    reportId: string,
    executeDto: ExecuteReportDto,
    userId: string,
    schoolId?: string
  ): Promise<{ executionId: string; status: string }> {
    try {
      const report = await this.reportModel.findById(new Types.ObjectId(reportId))
        .populate('createdBy', 'firstName lastName email')
        .lean()
        .exec();
      
      if (!report) {
        throw new NotFoundException('Report not found');
      }

      // Validate schoolId
      if (!schoolId) {
        throw new BadRequestException('School ID is required to execute report');
      }

      // Create execution record
      const execution = new this.reportExecutionModel({
        reportId: new Types.ObjectId(reportId),
        status: 'pending',
        executedBy: new Types.ObjectId(userId),
        schoolId: new Types.ObjectId(schoolId),
        parameters: executeDto.parameters,
        format: executeDto.format || 'excel',
        startedAt: new Date()
      });

      await execution.save();

      // Execute report asynchronously
      this.generateReportData(report as any, executeDto, execution._id.toString(), schoolId).catch((error) => {
        console.error('Error generating report:', error);
        this.reportExecutionModel.updateOne(
          { _id: execution._id },
          {
            status: 'failed',
            completedAt: new Date(),
            error: error.message || 'Unknown error occurred'
          }
        ).exec().catch(err => console.error('Error updating execution status:', err));
      });

      return {
        executionId: execution._id.toString(),
        status: 'pending'
      };
    } catch (error) {
      console.error('Error in executeReport:', error);
      throw error;
    }
  }

  async getExecutionStatus(executionId: string, userId: string): Promise<ReportExecutionDocument> {
    const execution = await this.reportExecutionModel
      .findOne({
        _id: new Types.ObjectId(executionId),
        executedBy: new Types.ObjectId(userId)
      })
      .populate('reportId')
      .exec();

    if (!execution) {
      throw new NotFoundException('Report execution not found');
    }

    return execution;
  }

  async getExecutionHistory(
    reportId: string,
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ executions: ReportExecutionDocument[]; total: number; page: number; limit: number; totalPages: number }> {
    const query: any = {
      reportId: new Types.ObjectId(reportId),
      executedBy: new Types.ObjectId(userId)
    };

    const skip = (page - 1) * limit;
    const [executions, total] = await Promise.all([
      this.reportExecutionModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.reportExecutionModel.countDocuments(query).exec()
    ]);

    return {
      executions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  // ==================== REPORT DATA GENERATION ====================

  private async generateReportData(
    report: ReportDocument | any,
    executeDto: ExecuteReportDto,
    executionId: string,
    schoolId?: string
  ): Promise<void> {
    const execution = await this.reportExecutionModel.findById(executionId).exec();
    if (!execution) return;

    try {
      // Validate inputs
      if (!report || !report.dataSource) {
        throw new BadRequestException('Invalid report configuration: dataSource missing');
      }

      if (!schoolId) {
        throw new BadRequestException('School ID required for report execution');
      }

      // Update status to running
      execution.status = 'running';
      await execution.save();

      // Get data based on data source
      let data: any[] = [];
      const filters = executeDto.filters || report.filters || [];

      switch (report.dataSource) {
        case 'students':
          data = await this.getStudentData(filters, schoolId);
          break;
        case 'teachers':
          data = await this.getTeacherData(filters, schoolId);
          break;
        case 'grades':
          data = await this.getGradeData(filters, schoolId);
          break;
        case 'attendance':
          data = await this.getAttendanceData(filters, schoolId);
          break;
        case 'behavior':
        case 'discipline':
          data = await this.getDisciplineData(filters, schoolId);
          break;
        case 'clubs':
          data = await this.getClubData(filters, schoolId);
          break;
        case 'courses':
          data = await this.getCourseData(filters, schoolId);
          break;
        case 'parents':
          data = await this.getParentData(filters, schoolId);
          break;
        default:
          throw new BadRequestException(`Unsupported data source: ${report.dataSource}`);
      }

      // Apply filters
      data = this.applyFilters(data, filters);

      // Apply grouping
      if (report.groupBy && report.groupBy.length > 0) {
        data = this.applyGrouping(data, report.groupBy, report.columns);
      }

      // Apply sorting
      if (report.orderBy && report.orderBy.length > 0) {
        data = this.sortData(data, report.orderBy);
      }

      // Format columns
      const formattedData = this.formatData(data, report.columns);

      // Generate file based on format
      const format = executeDto.format || 'excel';
      const { fileUrl, fileSize } = await this.generateFile(formattedData, report, format, schoolId);

      // Update execution record
      execution.status = 'completed';
      execution.completedAt = new Date();
      execution.fileUrl = fileUrl;
      execution.fileSize = fileSize;
      execution.recordCount = formattedData.length;
      await execution.save();

      // Update report stats - use findByIdAndUpdate to avoid save() on lean document
      const reportId = report._id || (report as any).id;
      if (reportId) {
        await this.reportModel.findByIdAndUpdate(
          reportId,
          {
            $set: {
              lastRun: new Date(),
              runCount: ((report.runCount || 0) + 1)
            }
          }
        ).exec().catch(err => console.error('Error updating report stats:', err));
      }

    } catch (error) {
      console.error('Error in generateReportData:', error);
      execution.status = 'failed';
      execution.completedAt = new Date();
      execution.error = error.message || 'Unknown error occurred during report generation';
      await execution.save().catch(err => console.error('Error saving execution error state:', err));
      throw error;
    }
  }

  // ==================== DATA FETCHING METHODS ====================

  private async getStudentData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = { role: 'STUDENT', isActive: true, status: 'ACTIVE' };
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const students = await this.userModel.find(query)
      .populate('schoolId', 'name')
      .lean()
      .exec();

    return students.map((student: any) => ({
      studentId: student.studentId || student._id,
      firstName: student.firstName,
      lastName: student.lastName,
      fullName: `${student.firstName} ${student.lastName}`,
      email: student.email,
      phone: student.phone,
      gender: student.gender,
      class: student.class,
      section: student.section,
      dob: student.dob,
      enrollDate: student.enrollDate,
      address: student.address,
      schoolName: student.schoolId?.name,
      createdAt: student.createdAt,
      updatedAt: student.updatedAt
    }));
  }

  private async getTeacherData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = { role: 'TEACHER', isActive: true };
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const teachers = await this.userModel.find(query)
      .populate('schoolId', 'name')
      .lean()
      .exec();

    const teacherProfiles = await this.teacherModel.find({
      schoolId: schoolId ? new Types.ObjectId(schoolId) : { $exists: true }
    }).lean().exec();

    const profileMap = new Map(teacherProfiles.map((tp: any) => [tp.userId.toString(), tp]));

    return teachers.map((teacher: any) => {
      const profile = profileMap.get(teacher._id.toString());
      return {
        employeeId: profile?.employeeId || teacher._id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        fullName: `${teacher.firstName} ${teacher.lastName}`,
        email: teacher.email,
        phone: teacher.phone,
        gender: teacher.gender,
        designation: profile?.designation,
        dateOfJoining: profile?.dateOfJoining,
        schoolName: teacher.schoolId?.name,
        createdAt: teacher.createdAt,
        updatedAt: teacher.updatedAt
      };
    });
  }

  private async getGradeData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = {};
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const grades = await this.gradeModel.find(query)
      .populate('studentId', 'firstName lastName studentId class section')
      .populate('courseId', 'courseName courseCode')
      .populate('teacherId', 'firstName lastName')
      .lean()
      .exec();

    return grades.map((grade: any) => ({
      studentId: grade.studentId?.studentId || grade.studentId?._id,
      studentName: grade.studentId ? `${grade.studentId.firstName} ${grade.studentId.lastName}` : 'N/A',
      courseName: grade.courseId?.courseName,
      courseCode: grade.courseId?.courseCode,
      className: grade.className || grade.studentId?.class,
      section: grade.section || grade.studentId?.section,
      markingType: grade.markingType,
      term: grade.term,
      totalMarks: grade.totalMarks || grade.maxMarks,
      marksObtained: grade.marksObtained || grade.obtainedMarks || grade.score,
      percentage: grade.percentage,
      grade: grade.grade,
      date: grade.date || grade.createdAt,
      teacherName: grade.teacherId ? `${grade.teacherId.firstName} ${grade.teacherId.lastName}` : 'N/A'
    }));
  }

  private async getAttendanceData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = {};
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const attendance = await this.attendanceModel.find(query)
      .populate('studentId', 'firstName lastName studentId class section')
      .populate('courseId', 'courseName')
      .lean()
      .exec();

    return attendance.map((att: any) => ({
      studentId: att.studentId?.studentId || att.studentId?._id,
      studentName: att.studentId ? `${att.studentId.firstName} ${att.studentId.lastName}` : 'N/A',
      courseName: att.courseId?.courseName,
      className: att.className || att.studentId?.class,
      section: att.section || att.studentId?.section,
      date: att.date || att.attendanceDate,
      status: att.status || att.attendanceStatus,
      checkInTime: att.checkInTime,
      checkOutTime: att.checkOutTime
    }));
  }

  private async getDisciplineData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = {};
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const actions = await this.disciplineModel.find(query)
      .populate('studentId', 'firstName lastName studentId class section')
      .populate('recordedBy', 'firstName lastName')
      .lean()
      .exec();

    return actions.map((action: any) => ({
      studentId: action.studentId?.studentId || action.studentId?._id,
      studentName: action.studentId ? `${action.studentId.firstName} ${action.studentId.lastName}` : 'N/A',
      type: action.type || action.behaviorType,
      description: action.description || action.notes,
      severity: action.severity,
      date: action.date || action.createdAt,
      recordedBy: action.recordedBy ? `${action.recordedBy.firstName} ${action.recordedBy.lastName}` : 'N/A',
      status: action.status
    }));
  }

  private async getClubData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = {};
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const clubs = await this.clubModel.find(query)
      .populate('advisorId', 'firstName lastName')
      .lean()
      .exec();

    return clubs.map((club: any) => ({
      name: club.name,
      type: club.type,
      description: club.description,
      advisor: club.advisorId ? `${club.advisorId.firstName} ${club.advisorId.lastName}` : 'N/A',
      maxMembers: club.maxMembers,
      currentMembers: club.memberCount || club.members?.length || 0,
      location: club.location,
      status: club.status || (club.isActive ? 'Active' : 'Inactive'),
      createdAt: club.createdAt
    }));
  }

  private async getCourseData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = {};
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const courses = await this.courseModel.find(query).lean().exec();

    return courses.map((course: any) => ({
      courseName: course.courseName,
      courseCode: course.courseCode,
      description: course.description,
      department: course.department,
      credits: course.credits,
      gradeLevel: course.gradeLevel,
      createdAt: course.createdAt
    }));
  }

  private async getParentData(filters: any[], schoolId?: string): Promise<any[]> {
    const query: any = { role: 'PARENT', isActive: true };
    if (schoolId) {
      query.schoolId = new Types.ObjectId(schoolId);
    }

    const parents = await this.userModel.find(query)
      .populate('schoolId', 'name')
      .lean()
      .exec();

    return parents.map((parent: any) => ({
      firstName: parent.firstName,
      lastName: parent.lastName,
      fullName: `${parent.firstName} ${parent.lastName}`,
      email: parent.email,
      phone: parent.phone,
      address: parent.address,
      schoolName: parent.schoolId?.name,
      createdAt: parent.createdAt
    }));
  }

  // ==================== DATA PROCESSING METHODS ====================

  private applyFilters(data: any[], filters: any[]): any[] {
    if (!filters || filters.length === 0) return data;

    return data.filter((item) => {
      return filters.every((filter) => {
        const fieldValue = this.getNestedValue(item, filter.field);
        const filterValue = filter.value;

        switch (filter.operator) {
          case 'equals':
            return String(fieldValue).toLowerCase() === String(filterValue).toLowerCase();
          case 'not_equals':
            return String(fieldValue).toLowerCase() !== String(filterValue).toLowerCase();
          case 'contains':
            return String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());
          case 'not_contains':
            return !String(fieldValue).toLowerCase().includes(String(filterValue).toLowerCase());
          case 'greater_than':
            return Number(fieldValue) > Number(filterValue);
          case 'less_than':
            return Number(fieldValue) < Number(filterValue);
          case 'greater_equal':
            return Number(fieldValue) >= Number(filterValue);
          case 'less_equal':
            return Number(fieldValue) <= Number(filterValue);
          case 'between':
            return Number(fieldValue) >= Number(filterValue) && Number(fieldValue) <= Number(filter.value2);
          case 'in':
            const inValues = Array.isArray(filterValue) ? filterValue : [filterValue];
            return inValues.includes(fieldValue);
          case 'not_in':
            const notInValues = Array.isArray(filterValue) ? filterValue : [filterValue];
            return !notInValues.includes(fieldValue);
          case 'is_null':
            return fieldValue === null || fieldValue === undefined || fieldValue === '';
          case 'is_not_null':
            return fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
          case 'starts_with':
            return String(fieldValue).toLowerCase().startsWith(String(filterValue).toLowerCase());
          case 'ends_with':
            return String(fieldValue).toLowerCase().endsWith(String(filterValue).toLowerCase());
          default:
            return true;
        }
      });
    });
  }

  private applyGrouping(data: any[], groupBy: string[], columns: any[]): any[] {
    if (!groupBy || groupBy.length === 0) return data;

    const grouped = new Map<string, any[]>();

    data.forEach((item) => {
      const key = groupBy.map((field) => this.getNestedValue(item, field)).join('|');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    const result: any[] = [];
    grouped.forEach((items, key) => {
      const groupItem: any = {};
      groupBy.forEach((field) => {
        groupItem[field] = items[0] ? this.getNestedValue(items[0], field) : null;
      });

      columns.forEach((col) => {
        if (col.aggregation) {
          switch (col.aggregation) {
            case 'sum':
              groupItem[col.field] = items.reduce((sum, item) => sum + (Number(this.getNestedValue(item, col.field)) || 0), 0);
              break;
            case 'avg':
              const sum = items.reduce((s, item) => s + (Number(this.getNestedValue(item, col.field)) || 0), 0);
              groupItem[col.field] = items.length > 0 ? sum / items.length : 0;
              break;
            case 'count':
              groupItem[col.field] = items.length;
              break;
            case 'min':
              groupItem[col.field] = Math.min(...items.map((item) => Number(this.getNestedValue(item, col.field)) || 0));
              break;
            case 'max':
              groupItem[col.field] = Math.max(...items.map((item) => Number(this.getNestedValue(item, col.field)) || 0));
              break;
          }
        } else {
          groupItem[col.field] = items[0] ? this.getNestedValue(items[0], col.field) : null;
        }
      });

      result.push(groupItem);
    });

    return result;
  }

  private sortData(data: any[], orderBy: any[]): any[] {
    if (!orderBy || orderBy.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const sort of orderBy) {
        const aVal = this.getNestedValue(a, sort.field);
        const bVal = this.getNestedValue(b, sort.field);

        if (aVal === bVal) continue;

        const comparison = aVal < bVal ? -1 : 1;
        return sort.direction === 'desc' ? -comparison : comparison;
      }
      return 0;
    });
  }

  private formatData(data: any[], columns: any[]): any[] {
    return data.map((item) => {
      const formatted: any = {};
      columns.forEach((col) => {
        if (col.visible !== false) {
          let value = this.getNestedValue(item, col.field);

          // Apply formatting
          switch (col.format) {
            case 'date':
              value = value ? new Date(value).toLocaleDateString() : '';
              break;
            case 'currency':
              value = value ? `$${Number(value).toFixed(2)}` : '$0.00';
              break;
            case 'percentage':
              value = value ? `${Number(value).toFixed(2)}%` : '0%';
              break;
            case 'number':
              value = value ? Number(value).toFixed(2) : '0';
              break;
            case 'boolean':
              value = value ? 'Yes' : 'No';
              break;
            default:
              value = value || '';
          }

          formatted[col.label || col.field] = value;
        }
      });
      return formatted;
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }

  // ==================== FILE GENERATION ====================

  private async generateFile(
    data: any[],
    report: ReportDocument,
    format: string,
    schoolId?: string
  ): Promise<{ fileUrl: string; fileSize: number }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${report.name.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;

    let buffer: Buffer;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case 'excel':
      case 'xlsx':
        buffer = await this.generateExcel(data, report);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        extension = 'xlsx';
        break;
      case 'csv':
        buffer = await this.generateCSV(data, report);
        mimeType = 'text/csv';
        extension = 'csv';
        break;
      case 'json':
        buffer = Buffer.from(JSON.stringify(data, null, 2));
        mimeType = 'application/json';
        extension = 'json';
        break;
      default:
        throw new BadRequestException(`Unsupported format: ${format}`);
    }

    // Upload to S3
    let schoolName = 'default';
    if (schoolId) {
      try {
        const school = await this.schoolModel.findById(schoolId).select('name').lean().exec();
        if (school) {
          schoolName = school.name || 'default';
        }
      } catch (error) {
        console.error('Error fetching school name:', error);
      }
    }
    const s3Key = buildS3KeyPath(schoolName, schoolId || 'default', 'reports', 'generated', `${filename}.${extension}`);

    const fileUrl = await uploadBufferToS3(
      this.awsService.getS3Client(),
      this.awsService.getBucketName(),
      s3Key,
      buffer,
      mimeType
    );

    return {
      fileUrl,
      fileSize: buffer.length
    };
  }

  private async generateExcel(data: any[], report: ReportDocument): Promise<Buffer> {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  private async generateCSV(data: any[], report: ReportDocument): Promise<Buffer> {
    if (data.length === 0) {
      return Buffer.from('');
    }

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
        headers.map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',')
      )
    ];

    return Buffer.from(csvRows.join('\n'), 'utf-8');
  }
}

