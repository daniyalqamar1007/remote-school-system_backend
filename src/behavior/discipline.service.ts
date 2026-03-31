import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DisciplinaryAction, DisciplinaryActionDocument } from './schema/disciplinary-action.schema';
import { Student } from '../student/schema/student.schema';
import { CourseAssignment } from '../course/schema/course-assignment.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Alert, AlertDocument } from '../alert/schema/alert.schema';

@Injectable()
export class DisciplineService {
  constructor(
    @InjectModel(DisciplinaryAction.name) private actionModel: Model<DisciplinaryActionDocument>,
    @InjectModel(Student.name) private studentModel: Model<Student>,
    @InjectModel(CourseAssignment.name) private courseAssignmentModel: Model<any>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
  ) {}

  async assignAction(actionData: any, assignedBy: string): Promise<DisciplinaryAction> {
    // Convert schoolId to ObjectId if it's a string
    const schoolId = Types.ObjectId.isValid(actionData.schoolId) 
      ? new Types.ObjectId(actionData.schoolId) 
      : actionData.schoolId;

    // Convert studentId to ObjectId
    const studentId = Types.ObjectId.isValid(actionData.studentId)
      ? new Types.ObjectId(actionData.studentId)
      : actionData.studentId;

    // Parse date and time
    const incidentDate = actionData.date ? new Date(actionData.date) : new Date();
    const consequenceStartDate = actionData.consequenceStartDate 
      ? new Date(actionData.consequenceStartDate) 
      : incidentDate;

    // Calculate end date if duration is provided
    let consequenceEndDate: Date | undefined;
    if (actionData.consequenceDuration) {
      const duration = actionData.consequenceDuration.toLowerCase();
      consequenceEndDate = new Date(consequenceStartDate);
      
      if (duration.includes('day')) {
        const days = parseInt(duration) || 1;
        consequenceEndDate.setDate(consequenceEndDate.getDate() + days);
      } else if (duration.includes('week')) {
        const weeks = parseInt(duration) || 1;
        consequenceEndDate.setDate(consequenceEndDate.getDate() + (weeks * 7));
      } else if (duration.includes('month')) {
        const months = parseInt(duration) || 1;
        consequenceEndDate.setMonth(consequenceEndDate.getMonth() + months);
      }
    }

    const action = new this.actionModel({
      studentId,
      schoolId,
      type: actionData.type, // Incident type
      description: actionData.description || actionData.reason,
      location: actionData.location,
      date: incidentDate,
      time: actionData.time,
      severity: actionData.severity || 'minor',
      actionType: actionData.consequenceType || actionData.actionType, // Consequence type
      startDate: consequenceStartDate,
      endDate: consequenceEndDate,
      duration: actionData.consequenceDuration || actionData.duration,
      reason: actionData.description || actionData.reason,
      assignedBy: new Types.ObjectId(assignedBy),
      status: actionData.status || 'pending',
      approvalStatus: 'pending_approval', // NEW: Requires approval from admin/counselor
      verificationRequired: actionData.verificationRequired || false,
      parentNotified: false,
      consequence: actionData.consequence || {
        type: actionData.consequenceType || actionData.actionType,
        duration: actionData.consequenceDuration || actionData.duration,
        startDate: consequenceStartDate,
        endDate: consequenceEndDate,
        description: actionData.consequenceDescription || ''
      }
    });
    
    const savedAction = await action.save();
    return savedAction;
  }

  async getActions(filters: any = {}): Promise<any> {
    const query: any = {};

    if (filters.studentId) {
      query.studentId = Types.ObjectId.isValid(filters.studentId) 
        ? new Types.ObjectId(filters.studentId) 
        : filters.studentId;
    }
    if (filters.incidentId) {
      query.incidentId = Types.ObjectId.isValid(filters.incidentId)
        ? new Types.ObjectId(filters.incidentId)
        : filters.incidentId;
    }
    if (filters.status) query.status = filters.status;
    if (filters.actionType) query.actionType = filters.actionType;
    if (filters.type) query.type = filters.type;
    if (filters.schoolId) {
      query.schoolId = Types.ObjectId.isValid(filters.schoolId)
        ? new Types.ObjectId(filters.schoolId)
        : filters.schoolId;
    }

    // Filter by teacher's assigned students if teacherId is provided
    if (filters.teacherId) {
      try {
        const teacherId = Types.ObjectId.isValid(filters.teacherId)
          ? new Types.ObjectId(filters.teacherId)
          : filters.teacherId;

        // Get course assignments for this teacher
        const assignments = await this.courseAssignmentModel.find({
          teacherId: teacherId,
          schoolId: query.schoolId || undefined
        }).select('grades').lean();

        // Extract grade/section combinations
        const gradeSections = new Set<string>();
        assignments.forEach((assignment: any) => {
          if (assignment.grades && Array.isArray(assignment.grades)) {
            assignment.grades.forEach((grade: any) => {
              const level = grade.level || 0;
              const section = String(grade.section || '').trim().toUpperCase();
              if (section) {
                gradeSections.add(`${level}-${section}`);
              }
            });
          }
        });

        // Find students matching these grade/section combinations
        if (gradeSections.size > 0) {
          const studentQueries: any[] = [];
          gradeSections.forEach((gs) => {
            const [level, section] = gs.split('-');
            // Handle different class formats: "Grade 1", "1", etc.
            const gradeLevel = level === '0' ? 'Kindergarten' : `Grade ${level}`;
            studentQueries.push({
              $and: [
                {
                  $or: [
                    { class: gradeLevel },
                    { class: `Grade ${level}` },
                    { class: level },
                    { class: `Grade${level}` }
                  ]
                },
                { section: section }
              ]
            });
          });

          const assignedStudents = await this.userModel.find({
            role: 'STUDENT',
            schoolId: query.schoolId || undefined,
            $or: studentQueries,
            isActive: true
          }).select('_id').lean();

          const studentIds = assignedStudents.map(s => s._id);
          
          if (studentIds.length > 0) {
            query.studentId = { $in: studentIds };
          } else {
            // No assigned students, return empty result
            query.studentId = null;
          }
        } else {
          // No course assignments, return empty result
          query.studentId = null;
        }
      } catch (error) {
        console.error('Error filtering by teacher assigned students:', error);
        // If error, don't filter (show all for safety)
      }
    }

    // Search functionality - will search in multiple fields including student fields
    if (filters.search) {
      const searchRegex = new RegExp(filters.search, 'i');
      const searchConditions: any[] = [
        { description: searchRegex },
        { location: searchRegex },
        { reason: searchRegex },
        { type: searchRegex },
        { actionType: searchRegex }
      ];

      // Also search in student fields (firstName, lastName, studentId)
      // First, find students matching the search term
      const matchingStudents = await this.studentModel.find({
        $or: [
          { firstName: searchRegex },
          { lastName: searchRegex },
          { studentId: searchRegex }
        ]
      }).select('_id').lean();

      // If students found, add their IDs to the search conditions
      if (matchingStudents.length > 0) {
        const studentIds = matchingStudents.map(s => s._id);
        searchConditions.push({ studentId: { $in: studentIds } });
      }

      query.$or = searchConditions;
    }

    // Pagination
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip = (page - 1) * limit;

    // Get total count
    const total = await this.actionModel.countDocuments(query);

    // Get paginated results
    const actions = await this.actionModel.find(query)
      .populate('studentId', 'firstName lastName studentId class section email')
      .populate('schoolId', 'name address city state zip code country')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('supervisedBy', 'firstName lastName email')
      .populate('incidentId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log("Actions: ", actions);

    // Transform the response to match frontend expectations
    const transformedActions = actions.map((action: any) => ({
      ...action,
      student: action.studentId || null,
      assignedBy: action.assignedBy || null,
      school: action.schoolId || null
    }));

    return {
      data: transformedActions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async getStats(schoolId: string): Promise<any> {
    const query: any = {};
    
    if (schoolId) {
      query.schoolId = Types.ObjectId.isValid(schoolId)
        ? new Types.ObjectId(schoolId)
        : schoolId;
    }

    const actions = await this.actionModel.find(query).lean();

    const stats = {
      total: actions.length,
      pending: actions.filter(a => a.status === 'pending').length,
      inProgress: actions.filter(a => a.status === 'in-progress').length,
      completed: actions.filter(a => a.status === 'completed').length,
      cancelled: actions.filter(a => a.status === 'cancelled').length,
      byType: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
    };

    actions.forEach(action => {
      const type = action.type || 'other';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      const severity = action.severity || 'minor';
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    });

    return stats;
  }

  async updateAction(id: string, updateData: any, user?: any): Promise<DisciplinaryAction> {
    const action = await this.actionModel.findByIdAndUpdate(id, updateData, { new: true })
      .populate('studentId', 'firstName lastName studentId class section email')
      .populate('assignedBy', 'firstName lastName email role')
      .populate('supervisedBy', 'firstName lastName email');
    
    if (!action) throw new NotFoundException('Disciplinary action not found');
    return action;
  }

  async completeAction(id: string, completionData: any, verifiedBy: string): Promise<DisciplinaryAction> {
    const action = await this.actionModel.findByIdAndUpdate(
      id,
      { 
        status: 'completed',
        completion: {
          completed: true,
          completionDate: new Date(),
          notes: completionData.notes,
          verifiedBy
        }
      },
      { new: true }
    )
      .populate('studentId', 'firstName lastName studentId class section email')
      .populate('assignedBy', 'firstName lastName email role');
    
    if (!action) throw new NotFoundException('Disciplinary action not found');
    return action;
  }

  async notifyParent(id: string, notificationData: any, notifiedBy: string): Promise<DisciplinaryAction> {
    const action = await this.actionModel.findById(id)
      .populate('studentId', 'firstName lastName parentIds')
      .lean();
    
    if (!action) throw new NotFoundException('Disciplinary action not found');

    const approvalStatus = (action as any).approvalStatus;
    const status = (action as any).status;
    if (approvalStatus !== 'approved') {
      throw new BadRequestException('Discipline must be approved before notifying the parent. It cannot be in pending or rejected state.');
    }
    if (status === 'cancelled') {
      throw new BadRequestException('Cannot notify parent for a cancelled disciplinary action.');
    }

    const updatedAction = await this.actionModel.findByIdAndUpdate(
      id,
      {
        parentNotified: true,
        parentNotificationDate: new Date(),
        parentNotificationMethod: notificationData.method || 'email',
        parentContact: {
          method: notificationData.method || 'email',
          date: new Date(),
          contactedBy: notifiedBy,
          notes: notificationData.notes || ''
        }
      },
      { new: true }
    )
      .populate('studentId', 'firstName lastName studentId class section email parentIds')
      .populate('assignedBy', 'firstName lastName email role');

    try {
      await this.createParentAlertForDisciplinaryAction(action);
    } catch (alertError) {
      console.error('Failed to create parent alert on notify:', alertError);
    }

    return updatedAction;
  }

  async generateConductLetter(id: string, generatedBy: string): Promise<DisciplinaryAction> {
    const action = await this.actionModel.findById(id)
      .populate('studentId', 'firstName lastName studentId class section')
      .populate('assignedBy', 'firstName lastName email role')
      .lean();
    
    if (!action) throw new NotFoundException('Disciplinary action not found');

    // TODO: Generate actual PDF letter
    // This would use a PDF generation library like pdfkit or puppeteer
    // For now, we'll just mark it as generated
    const letterUrl = `/documents/conduct-letters/${id}.pdf`; // Placeholder URL

    const updatedAction = await this.actionModel.findByIdAndUpdate(
      id,
      {
        conductLetterGenerated: true,
        conductLetterUrl: letterUrl,
        conductLetterGeneratedDate: new Date(),
        $push: { documentUrls: letterUrl }
      },
      { new: true }
    )
      .populate('studentId', 'firstName lastName studentId class section email')
      .populate('assignedBy', 'firstName lastName email role');

    return updatedAction;
  }

  async generateReports(filters: any = {}): Promise<any> {
    const query: any = {};

    if (filters.schoolId) {
      query.schoolId = Types.ObjectId.isValid(filters.schoolId)
        ? new Types.ObjectId(filters.schoolId)
        : filters.schoolId;
    }
    if (filters.startDate) {
      query.date = { $gte: new Date(filters.startDate) };
    }
    if (filters.endDate) {
      query.date = { ...query.date, $lte: new Date(filters.endDate) };
    }
    if (filters.type) query.type = filters.type;
    if (filters.status) query.status = filters.status;

    const actions = await this.actionModel.find(query)
      .populate('studentId', 'firstName lastName studentId class section')
      .populate('assignedBy', 'firstName lastName email role')
      .sort({ date: -1 })
      .lean();

    // Generate report statistics
    const stats = {
      total: actions.length,
      byType: {},
      byStatus: {},
      bySeverity: {},
      parentNotified: actions.filter(a => a.parentNotified).length,
      conductLettersGenerated: actions.filter(a => a.conductLetterGenerated).length
    };

    actions.forEach(action => {
      // Count by type
      const type = action.type || 'other';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      // Count by status
      const status = action.status || 'pending';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

      // Count by severity
      const severity = action.severity || 'minor';
      stats.bySeverity[severity] = (stats.bySeverity[severity] || 0) + 1;
    });

    return {
      actions,
      statistics: stats,
      generatedAt: new Date()
    };
  }

  async deleteAction(id: string, user?: any): Promise<{ message: string }> {
    const action = await this.actionModel.findById(id);
    
    if (!action) {
      throw new NotFoundException('Disciplinary action not found');
    }

    const userId = user?.userId || user?._id;
    const userRole = user?.role;

    // Check if user is admin/super-admin/secretary - they can delete any action
    const isAdmin = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'SECRETARY';
    
    // Check if user is teacher and if they assigned this action
    const isTeacher = userRole === 'TEACHER';
    const isAssignedByTeacher = isTeacher && action.assignedBy && 
                                action.assignedBy.toString() === userId?.toString();

    // Only allow deletion if:
    // 1. Action is in pending status, OR
    // 2. User is admin/super-admin/secretary, OR
    // 3. User is teacher and they assigned this action
    const canDelete = action.status === 'pending' || 
                      isAdmin ||
                      isAssignedByTeacher;

    if (!canDelete) {
      throw new BadRequestException('Only pending actions can be deleted, or deletion must be done by an administrator or the teacher who assigned the action');
    }

    await this.actionModel.findByIdAndDelete(id);

    return { message: 'Disciplinary action deleted successfully' };
  }

  /**
   * Create alert for parents when disciplinary action is assigned
   */
  private async createParentAlertForDisciplinaryAction(action: any): Promise<void> {
    try {
      const studentId = (action.studentId && typeof action.studentId === 'object' && (action.studentId as any)._id)
        ? (action.studentId as any)._id
        : action.studentId;
      console.log(`\n📢 ========== CREATING PARENT ALERT FOR DISCIPLINARY ACTION ==========`);
      console.log(`📋 Action ID: ${action._id}`);
      console.log(`📋 Student ID: ${studentId}`);

      const studentUser = await this.userModel
        .findById(studentId)
        .select('_id firstName lastName parentIds schoolId')
        .lean();

      if (!studentUser) {
        console.log(`⚠️ Student User not found for disciplinary action (User ID: ${studentId})`);
        return;
      }

      // Get parent IDs directly from User record's parentIds array
      const parentIds = (studentUser as any).parentIds || [];
      
      if (!parentIds || parentIds.length === 0) {
        console.log(`⚠️ No parents found for student User: ${studentId}`);
        return;
      }

      console.log(`✅ Found ${parentIds.length} parent ID(s) for student User: ${studentId}`);

      const parentUserIds = parentIds
        .map((parentId: any) => {
          const parentIdStr = parentId.toString ? parentId.toString() : parentId._id ? parentId._id.toString() : parentId;
          return parentIdStr;
        })
        .filter((id: string) => id != null && id !== '');

      console.log(`✅ Extracted ${parentUserIds.length} parent User ID(s) from parentIds array`);

      const studentName = `${(studentUser as any).firstName || ''} ${(studentUser as any).lastName || ''}`.trim() || 'Student';
      
      // Create alert title and description
      const title = `Disciplinary Action: ${action.type || 'Incident'}`;
      
      let description = `A disciplinary action has been assigned to ${studentName}.\n\n`;
      description += `Type: ${action.type || 'N/A'}\n`;
      description += `Severity: ${action.severity || 'N/A'}\n`;
      description += `Date: ${action.date ? new Date(action.date).toLocaleDateString() : 'N/A'}\n`;
      
      if (action.description || action.reason) {
        description += `Description: ${action.description || action.reason || 'N/A'}\n`;
      }
      
      if (action.location) {
        description += `Location: ${action.location}\n`;
      }
      
      if (action.actionType) {
        description += `Consequence: ${action.actionType}\n`;
      }
      
      if (action.duration) {
        description += `Duration: ${action.duration}\n`;
      }

      // Create alerts for each parent
      const alertsToCreate = parentUserIds.map((parentUserId: string) => ({
        parentId: new Types.ObjectId(parentUserId),
        title,
        description: description.trim(),
        read: false,
        studentId: new Types.ObjectId(studentId.toString()),
        alertType: 'disciplinary',
        schoolId: (studentUser as any).schoolId ? new Types.ObjectId((studentUser as any).schoolId) : undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      if (alertsToCreate.length > 0) {
        console.log(`📋 Creating ${alertsToCreate.length} alert(s) for parents...`);
        await this.alertModel.insertMany(alertsToCreate);
        console.log(`✅ Successfully created ${alertsToCreate.length} parent alert(s)`);
      } else {
        console.log(`⚠️ No alerts to create (no parents found for student)`);
      }

      console.log(`📢 ========== END PARENT ALERT CREATION ==========\n`);
    } catch (error) {
      console.error('Error creating parent alert for disciplinary action:', error);
      throw error;
    }
  }

  // ==================== APPROVAL WORKFLOW ====================
  // Admin/Counselor must approve discipline actions before they take effect

  async approveDiscipline(id: string, approvedBy: string): Promise<DisciplinaryAction> {
    console.log(`✅ APPROVING discipline action:`, id);

    const action = await this.actionModel.findByIdAndUpdate(
      id,
      {
        approvalStatus: 'approved',
        approvedBy: new Types.ObjectId(approvedBy),
        approvalDate: new Date()
      },
      { new: true }
    );

    if (!action) {
      throw new NotFoundException(`Discipline action ${id} not found`);
    }

    console.log(`✅ Discipline action approved:`, action._id);
    return action;
  }

  async rejectDiscipline(id: string, reason: string, rejectedBy: string): Promise<DisciplinaryAction> {
    console.log(`❌ REJECTING discipline action:`, id, `Reason:`, reason);

    const action = await this.actionModel.findByIdAndUpdate(
      id,
      {
        approvalStatus: 'rejected',
        rejectionReason: reason,
        approvedBy: new Types.ObjectId(rejectedBy),
        approvalDate: new Date()
      },
      { new: true }
    );

    if (!action) {
      throw new NotFoundException(`Discipline action ${id} not found`);
    }

    console.log(`❌ Discipline action rejected:`, action._id);
    return action;
  }

  async getPendingDisciplines(schoolId: string, filters: any = {}): Promise<any> {
    console.log(`📋 Fetching pending discipline approvals for school:`, schoolId);

    const query: any = {
      schoolId: Types.ObjectId.isValid(schoolId) ? new Types.ObjectId(schoolId) : schoolId,
      approvalStatus: 'pending_approval'
    };

    if (filters.studentId) {
      query.studentId = Types.ObjectId.isValid(filters.studentId)
        ? new Types.ObjectId(filters.studentId)
        : filters.studentId;
    }

    if (filters.severity) {
      query.severity = filters.severity;
    }

    if (filters.type) {
      query.type = filters.type;
    }

    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip = (page - 1) * limit;

    const [actions, total] = await Promise.all([
      this.actionModel
        .find(query)
        .populate('studentId', 'name email')
        .populate('assignedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.actionModel.countDocuments(query)
    ]);

    console.log(`📊 Found ${total} pending discipline action(s), showing ${actions.length}`);

    return {
      data: actions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getActionById(id: string): Promise<DisciplinaryAction> {
    console.log(`🔍 Fetching discipline action:`, id);

    const action = await this.actionModel
      .findById(id)
      .populate('studentId', 'name email')
      .populate('assignedBy', 'name email')
      .populate('approvedBy', 'name email')
      .lean();

    if (!action) {
      throw new NotFoundException(`Discipline action ${id} not found`);
    }

    console.log(`✅ Found discipline action:`, action._id);
    return action as any;
  }
}
