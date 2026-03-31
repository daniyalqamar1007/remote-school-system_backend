import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IEP, IEPDocument } from './schema/iep.schema';
import { ServiceLog, ServiceLogDocument } from './schema/service-log.schema';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { CourseAssignment, CourseAssignmentDocument } from '../course/schema/course-assignment.schema';

@Injectable()
export class IEPService {
  constructor(
    @InjectModel(IEP.name) private iepModel: Model<IEPDocument>,
    @InjectModel(ServiceLog.name) private serviceLogModel: Model<ServiceLogDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CourseAssignment.name) private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  /**
   * Check if teacher can access an IEP for a student
   * Teachers can only access IEPs for students in their assigned grades/sections
   */
  private async canTeacherAccessStudent(teacherId: string, studentId: string, schoolId: string): Promise<boolean> {
    try {
      // Get student's grade and section
      const student = await this.userModel.findById(studentId).select('gradeLevel section').lean();
      if (!student || !student.gradeLevel || !student.section) {
        return false;
      }

      // Get teacher's course assignments to find which grades/sections they teach
      const assignments = await this.courseAssignmentModel.find({
        teacherId: new Types.ObjectId(teacherId),
        schoolId: new Types.ObjectId(schoolId)
      }).lean();

      // Check if any assignment matches the student's grade/section
      const isAssigned = assignments.some((assignment: any) => {
        if (!assignment.grades || !Array.isArray(assignment.grades)) return false;
        return assignment.grades.some((grade: any) => 
          grade.level.toString() === student.gradeLevel.toString() && 
          grade.section === student.section
        );
      });

      return isAssigned;
    } catch (error) {
      console.error('Error checking teacher access:', error);
      return false;
    }
  }

  // ==================== IEP MANAGEMENT ====================

  async createIEP(iepData: any, createdBy: string): Promise<IEP> {
    // Generate unique IEP ID
    const iepId = await this.generateIEPId(iepData.schoolId);
    
    const iep = new this.iepModel({
      ...iepData,
      iepId,
      createdBy,
      goals: iepData.goals || [],
      accommodations: iepData.accommodations || [],
      modifications: iepData.modifications || [],
      services: iepData.services || [],
      assessments: iepData.assessments || [],
      teamMembers: iepData.teamMembers || [],
      meetingHistory: iepData.meetingHistory || [],
      documentUrls: iepData.documentUrls || []
    });

    return iep.save();
  }

  async getIEPsBySchool(schoolId: string, filters: any = {}, userRole?: string, userId?: string): Promise<IEP[]> {
    const query: any = { schoolId, isActive: true };
    
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;
    if (filters.classification) query.classification = filters.classification;
    if (filters.caseManager) query.caseManager = filters.caseManager;
    if (filters.academicYear) query.academicYear = filters.academicYear;

    let ieps = await this.iepModel.find(query)
      .populate('studentId', 'firstName lastName gradeLevel section')
      .sort({ createdAt: -1 });

    // If user is a teacher, filter to only their assigned students
    if (userRole === UserRole.TEACHER && userId) {
      ieps = await Promise.all(
        ieps.map(async (iep) => {
          const canAccess = await this.canTeacherAccessStudent(userId, iep.studentId.toString(), schoolId);
          return canAccess ? iep : null;
        })
      ).then(results => results.filter(Boolean));
    }

    return ieps;
  }

  async getIEPById(iepId: string, userRole?: string, userId?: string, schoolId?: string): Promise<IEP> {
    const iep = await this.iepModel.findById(iepId)
      .populate('studentId', 'firstName lastName gradeLevel section dateOfBirth parentId')
      .populate('teamMembers', 'firstName lastName email role')
      .populate('caseManager', 'firstName lastName email');

    if (!iep) {
      throw new NotFoundException('IEP not found');
    }

    // Check if teacher can access this IEP
    if (userRole === UserRole.TEACHER && userId && schoolId) {
      const canAccess = await this.canTeacherAccessStudent(userId, iep.studentId.toString(), schoolId);
      if (!canAccess) {
        throw new ForbiddenException('You do not have access to this student\'s IEP');
      }
    }

    return iep;
  }

  async updateIEP(iepId: string, updateData: any, updatedBy: string): Promise<IEP> {
    const iep = await this.iepModel.findByIdAndUpdate(
      iepId,
      { ...updateData, updatedBy },
      { new: true }
    );

    if (!iep) {
      throw new NotFoundException('IEP not found');
    }

    return iep;
  }

  async addGoal(iepId: string, goalData: any, updatedBy: string): Promise<IEP> {
    const goal = {
      id: new Types.ObjectId().toString(),
      ...goalData,
      currentProgress: 0,
      lastUpdated: new Date()
    };

    const iep = await this.iepModel.findByIdAndUpdate(
      iepId,
      { 
        $push: { goals: goal },
        updatedBy 
      },
      { new: true }
    );

    if (!iep) {
      throw new NotFoundException('IEP not found');
    }

    return iep;
  }

  async updateGoalProgress(iepId: string, goalId: string, progressData: any, updatedBy: string): Promise<IEP> {
    const iep = await this.iepModel.findOneAndUpdate(
      { _id: iepId, 'goals.id': goalId },
      { 
        $set: { 
          'goals.$.currentProgress': progressData.progress,
          'goals.$.lastUpdated': new Date()
        },
        updatedBy 
      },
      { new: true }
    );

    if (!iep) {
      throw new NotFoundException('IEP or goal not found');
    }

    return iep;
  }

  async addAccommodation(iepId: string, accommodationData: any, updatedBy: string): Promise<IEP> {
    const iep = await this.iepModel.findByIdAndUpdate(
      iepId,
      { 
        $push: { accommodations: { ...accommodationData, isActive: true } },
        updatedBy 
      },
      { new: true }
    );

    if (!iep) {
      throw new NotFoundException('IEP not found');
    }

    return iep;
  }

  async addService(iepId: string, serviceData: any, updatedBy: string): Promise<IEP> {
    const service = {
      ...serviceData,
      isActive: true,
      startDate: serviceData.startDate || new Date(),
      endDate: serviceData.endDate
    };

    const iep = await this.iepModel.findByIdAndUpdate(
      iepId,
      { 
        $push: { services: service },
        updatedBy 
      },
      { new: true }
    );

    if (!iep) {
      throw new NotFoundException('IEP not found');
    }

    return iep;
  }

  async addMeetingRecord(iepId: string, meetingData: any, updatedBy: string): Promise<IEP> {
    const meeting = {
      ...meetingData,
      date: meetingData.date || new Date()
    };

    const iep = await this.iepModel.findByIdAndUpdate(
      iepId,
      { 
        $push: { meetingHistory: meeting },
        updatedBy 
      },
      { new: true }
    );

    if (!iep) {
      throw new NotFoundException('IEP not found');
    }

    return iep;
  }

  // ==================== SERVICE LOGS ====================

  async createServiceLog(serviceLogData: any, loggedBy: string): Promise<ServiceLog> {
    const serviceLog = new this.serviceLogModel({
      ...serviceLogData,
      loggedBy,
      progressData: serviceLogData.progressData || {}
    });

    const savedLog = await serviceLog.save();

    // Update goal progress if provided
    if (serviceLogData.progressData && Object.keys(serviceLogData.progressData).length > 0) {
      await this.updateGoalsFromServiceLog(serviceLogData.iepId, serviceLogData.progressData);
    }

    return savedLog;
  }

  async getServiceLogs(filters: any = {}): Promise<ServiceLog[]> {
    const query: any = {};
    
    if (filters.studentId) query.studentId = filters.studentId;
    if (filters.iepId) query.iepId = filters.iepId;
    if (filters.serviceType) query.serviceType = filters.serviceType;
    if (filters.provider) query.provider = filters.provider;
    if (filters.startDate && filters.endDate) {
      query.serviceDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    return this.serviceLogModel.find(query)
      .populate('studentId', 'firstName lastName gradeLevel')
      .populate('iepId', 'iepId type classification')
      .sort({ serviceDate: -1 });
  }

  async updateServiceLog(logId: string, updateData: any, updatedBy: string): Promise<ServiceLog> {
    const serviceLog = await this.serviceLogModel.findByIdAndUpdate(
      logId,
      updateData,
      { new: true }
    );

    if (!serviceLog) {
      throw new NotFoundException('Service log not found');
    }

    return serviceLog;
  }

  private async updateGoalsFromServiceLog(iepId: string, progressData: any): Promise<void> {
    for (const goalId of Object.keys(progressData)) {
      const progress = progressData[goalId];
      await this.updateGoalProgress(iepId, goalId, { progress: progress.progressLevel }, 'system');
    }
  }

  // ==================== REPORTS & ANALYTICS ====================

  async getIEPAnalytics(schoolId: string, filters: any = {}): Promise<any> {
    const matchStage: any = { schoolId, isActive: true };
    
    if (filters.academicYear) matchStage.academicYear = filters.academicYear;

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalIEPs: { $sum: 1 },
          activeIEPs: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          expiredIEPs: {
            $sum: {
              $cond: [{ $eq: ['$status', 'expired'] }, 1, 0]
            }
          },
          byClassification: {
            $push: '$classification'
          },
          byType: {
            $push: '$type'
          }
        }
      }
    ];

    const analyticsResult = await this.iepModel.aggregate(pipeline);
    
    if (analyticsResult.length === 0) {
      return {
        totalIEPs: 0,
        activeIEPs: 0,
        expiredIEPs: 0,
        byClassification: {},
        byType: {}
      };
    }

    const result = analyticsResult[0];
    
    // Count classifications
    const classificationCounts = result.byClassification.reduce((acc: any, classification: string) => {
      acc[classification] = (acc[classification] || 0) + 1;
      return acc;
    }, {});

    // Count types
    const typeCounts = result.byType.reduce((acc: any, type: string) => {
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return {
      totalIEPs: result.totalIEPs,
      activeIEPs: result.activeIEPs,
      expiredIEPs: result.expiredIEPs,
      byClassification: classificationCounts,
      byType: typeCounts
    };
  }

  async getStudentIEPHistory(studentId: string): Promise<IEP[]> {
    return this.iepModel.find({
      studentId,
      isActive: true
    })
    .populate('teamMembers', 'firstName lastName role')
    .populate('caseManager', 'firstName lastName')
    .sort({ startDate: -1 });
  }

  async getExpiringIEPs(schoolId: string, daysAhead: number = 30): Promise<IEP[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.iepModel.find({
      schoolId,
      status: 'active',
      endDate: {
        $lte: futureDate,
        $gte: new Date()
      }
    })
    .populate('studentId', 'firstName lastName gradeLevel')
    .populate('caseManager', 'firstName lastName email')
    .sort({ endDate: 1 });
  }

  async getServiceUtilizationReport(schoolId: string, filters: any = {}): Promise<any> {
    const matchStage: any = { schoolId };
    
    if (filters.startDate && filters.endDate) {
      matchStage.serviceDate = {
        $gte: new Date(filters.startDate),
        $lte: new Date(filters.endDate)
      };
    }

    const pipeline = [
      { $match: matchStage },
      {
        $group: {
          _id: '$serviceType',
          totalSessions: { $sum: 1 },
          totalDuration: { $sum: '$duration' },
          uniqueStudents: { $addToSet: '$studentId' },
          providers: { $addToSet: '$provider' }
        }
      },
      {
        $project: {
          serviceType: '$_id',
          totalSessions: 1,
          totalDuration: 1,
          uniqueStudentCount: { $size: '$uniqueStudents' },
          uniqueProviderCount: { $size: '$providers' },
          averageDuration: { $divide: ['$totalDuration', '$totalSessions'] }
        }
      },
      {
        $sort: { totalSessions: -1 as const }
      }
    ];

    return this.serviceLogModel.aggregate(pipeline);
  }

  // ==================== UTILITY METHODS ====================

  private async generateIEPId(schoolId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.iepModel.countDocuments({
      schoolId,
      academicYear: `${year}-${year + 1}`
    });
    
    return `IEP-${schoolId}-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  async getStudentCurrentIEP(studentId: string): Promise<IEP | null> {
    return this.iepModel.findOne({
      studentId,
      status: 'active',
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    })
    .populate('teamMembers', 'firstName lastName role email')
    .populate('caseManager', 'firstName lastName email');
  }

  async getParentUser(parentId: string): Promise<any> {
    return this.userModel.findById(parentId).select('children').lean();
  }

  async getIEPsForStudents(studentIds: string[]): Promise<IEP[]> {
    return this.iepModel.find({
      studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) },
      isActive: true
    })
    .populate('studentId', 'firstName lastName gradeLevel section')
    .populate('caseManager', 'firstName lastName email phone')
    .populate('teamMembers', 'firstName lastName role email')
    .sort({ startDate: -1 })
    .lean();
  }
}
