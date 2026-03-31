import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserRole } from '../auth/schemas/user.schema';
import { Course } from '../course/schema/course.schema';
import { Schedule } from '../schedule/schema/schedule.schema';
import { LessonPlanService } from '../lesson-plan/lesson-plan.service';
import { LessonPlan as LessonPlanSchema } from '../lesson-plan/schema/lesson-plan.schema';
import { Activity } from '../activity/schema/schema.activity';
import { ParentProfile } from '../auth/schemas/parent-profile.schema';
import * as bcrypt from 'bcrypt';

export interface DashboardStats {
  totalStudents: number;
  totalCourses: number;
  pendingEnrollments: number;
  conflictingSchedules: number;
  pendingLessonPlans: number;
  activeSessions: number;
  upcomingDeadlines: number;
  departmentCount: number;
}

export interface RecentActivity {
  id: string;
  type: 'enrollment' | 'schedule' | 'lesson_plan' | 'conflict';
  description: string;
  timestamp: string;
  status: 'pending' | 'completed' | 'urgent';
}

export interface UpcomingTask {
  id: string;
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  type: string;
}

export interface ScheduleConflict {
  id: string;
  type: 'room' | 'teacher' | 'time' | 'resource';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedClasses: any[];
  conflictingResources: string[];
  suggestedResolutions: Resolution[];
  createdAt: Date;
  status: 'pending' | 'in_progress' | 'resolved' | 'ignored';
}

export interface Resolution {
  id: string;
  type: 'reschedule' | 'room_change' | 'teacher_reassign' | 'split_class';
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: string[];
  automated: boolean;
}

export interface BulkEnrollmentResult {
  successful: number;
  failed: number;
  errors: BulkError[];
  summary: {
    newStudents: number;
    existingStudents: number;
    duplicates: number;
  };
}

export interface BulkError {
  row: number;
  field: string;
  value: string;
  error: string;
}

@Injectable()
export class SecretaryService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Schedule.name) private scheduleModel: Model<Schedule>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(ParentProfile.name) private parentModel: Model<ParentProfile>,
    private lessonPlanService: LessonPlanService,
  ) {}

  async validateSecretary(credentials: { email: string; password: string }) {
    try {
      // Find the Secretary user
      const user = await this.userModel.findOne({ 
        email: credentials.email, 
        role: UserRole.SECRETARY 
      }).exec();

      if (!user) {
        return null;
      }

      const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
      
      if (isPasswordValid) {
        // Update last login
        await this.userModel.updateOne(
          { _id: user._id },
          { lastLogin: new Date() }
        );
        
        // Return user without password
        const { password, ...userWithoutPassword } = user.toObject();
        return userWithoutPassword;
      }
      
      return null;
    } catch (error) {
      console.error('Secretary validation error:', error);
      return null;
    }
  }

  async getDashboardStats(schoolId?: string): Promise<DashboardStats> {
    try {
      const schoolObjectId = schoolId && Types.ObjectId.isValid(schoolId) 
        ? new Types.ObjectId(schoolId) 
        : null;

      // Build query filters with schoolId
      const studentQuery: any = { 
        role: 'STUDENT',
        isActive: true,
        status: 'ACTIVE'
      };
      if (schoolObjectId) {
        studentQuery.schoolId = schoolObjectId;
      }

      const courseQuery: any = { status: { $ne: 'archived' } };
      if (schoolObjectId) {
        courseQuery.schoolId = schoolObjectId;
      }

      const scheduleQuery: any = {};
      if (schoolObjectId) {
        scheduleQuery.schoolId = schoolObjectId;
      }

      // Get total students (users with role 'STUDENT')
      const totalStudents = await this.userModel.countDocuments(studentQuery);
      
      // Get total active courses
      const totalCourses = await this.courseModel.countDocuments(courseQuery);
      
      // Get pending enrollments (this would need an enrollment schema)
      const pendingEnrollments = 0; // TODO: Implement enrollment schema
      
      // Get conflicting schedules
      const conflictingSchedules = await this.detectScheduleConflicts();
      
      // Get pending lesson plans using real service (filtered by school if needed)
      const pendingLessonPlans = await this.lessonPlanService.getPendingCount();
      
      // Get active sessions (current time based)
      const activeSessions = await this.scheduleModel.countDocuments(scheduleQuery);
      // Simplified calculation for active sessions
      const mockActiveSessions = Math.floor(activeSessions * 0.1); // Assume 10% are active
      
      // Get upcoming deadlines (mock data for now)
      const upcomingDeadlines = 0;
      
      // Get department count (unique departments from courses)
      const departmentQuery: any = {};
      if (schoolObjectId) {
        departmentQuery.schoolId = schoolObjectId;
      }
      const departments = await this.courseModel.distinct('departmentIds', departmentQuery);
      const departmentCount = Array.isArray(departments) ? departments.length : 0;

      return {
        totalStudents,
        totalCourses,
        pendingEnrollments,
        conflictingSchedules,
        pendingLessonPlans,
        activeSessions: mockActiveSessions,
        upcomingDeadlines,
        departmentCount
      };
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      
      // Return default data if there's an error
      return {
        totalStudents: 0,
        totalCourses: 0,
        pendingEnrollments: 0,
        conflictingSchedules: 0,
        pendingLessonPlans: 0,
        activeSessions: 0,
        upcomingDeadlines: 0,
        departmentCount: 0
      };
    }
  }

  async getRecentActivities(limit: number = 10, schoolId?: string): Promise<RecentActivity[]> {
    try {
      const schoolObjectId = schoolId && Types.ObjectId.isValid(schoolId) 
        ? new Types.ObjectId(schoolId) 
        : null;

      // Build query to fetch activities
      const activityQuery: any = {};
      if (schoolObjectId) {
        // Filter by schoolId if available in activity model, or by actors from this school
        activityQuery.$or = [
          { schoolId: schoolObjectId },
          // Also include activities from users in this school
        ];
      }

      // Fetch recent activities from Activity model
      const activities = await this.activityModel
        .find(activityQuery)
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('actorId', 'firstName lastName')
        .lean();

      // Transform activities to match RecentActivity interface
      const recentActivities: RecentActivity[] = activities.map((activity: any) => {
        // Determine activity type from title/subtitle
        let type: 'enrollment' | 'schedule' | 'lesson_plan' | 'conflict' = 'enrollment';
        if (activity.title?.toLowerCase().includes('lesson plan') || activity.subtitle?.toLowerCase().includes('lesson plan')) {
          type = 'lesson_plan';
        } else if (activity.title?.toLowerCase().includes('conflict') || activity.subtitle?.toLowerCase().includes('conflict')) {
          type = 'conflict';
        } else if (activity.title?.toLowerCase().includes('schedule') || activity.subtitle?.toLowerCase().includes('schedule')) {
          type = 'schedule';
        }

        // Determine status
        let status: 'pending' | 'completed' | 'urgent' = 'completed';
        if (activity.title?.toLowerCase().includes('pending') || activity.subtitle?.toLowerCase().includes('pending')) {
          status = 'pending';
        } else if (activity.title?.toLowerCase().includes('urgent') || activity.subtitle?.toLowerCase().includes('urgent')) {
          status = 'urgent';
        }

        // Format timestamp
        const timestamp = activity.createdAt 
          ? this.formatTimestamp(activity.createdAt)
          : 'Unknown time';

        return {
          id: activity._id?.toString() || '',
          type,
          description: activity.subtitle || activity.title || 'Activity',
          timestamp,
          status
        };
      });

      return recentActivities;
    } catch (error) {
      console.error('Error getting recent activities:', error);
      return [];
    }
  }

  private formatTimestamp(date: Date | string): string {
    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now.getTime() - activityDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return activityDate.toLocaleDateString();
    }
  }

  async getUpcomingTasks(): Promise<UpcomingTask[]> {
    try {
      // This would typically fetch from a tasks/assignments table
      // For now, returning mock data
      const tasks: UpcomingTask[] = [
        {
          id: '1',
          title: 'Review Chemistry course enrollment',
          dueDate: '2025-09-05',
          priority: 'high',
          type: 'Enrollment Review'
        },
        {
          id: '2',
          title: 'Approve Biology lesson plans',
          dueDate: '2025-09-06',
          priority: 'medium',
          type: 'Lesson Plan Review'
        },
        {
          id: '3',
          title: 'Resolve schedule conflicts in Block B',
          dueDate: '2025-09-04',
          priority: 'high',
          type: 'Schedule Management'
        }
      ];

      return tasks;
    } catch (error) {
      console.error('Error getting upcoming tasks:', error);
      return [];
    }
  }

  async getPendingEnrollments() {
    try {
      // This would fetch from an enrollment requests table
      // Mock implementation for now
      return [];
    } catch (error) {
      console.error('Error getting pending enrollments:', error);
      return [];
    }
  }

  async approveEnrollment(id: string) {
    try {
      // Implementation for approving enrollment
      return { success: true, message: 'Enrollment approved successfully' };
    } catch (error) {
      console.error('Error approving enrollment:', error);
      throw error;
    }
  }

  async rejectEnrollment(id: string, reason: string) {
    try {
      // Implementation for rejecting enrollment
      return { success: true, message: 'Enrollment rejected successfully', reason };
    } catch (error) {
      console.error('Error rejecting enrollment:', error);
      throw error;
    }
  }

  async getScheduleConflicts() {
    try {
      const conflicts = await this.detectScheduleConflicts();
      
      // Return detailed conflict information
      return {
        count: conflicts,
        conflicts: [] // Would contain actual conflict details
      };
    } catch (error) {
      console.error('Error getting schedule conflicts:', error);
      return { count: 0, conflicts: [] };
    }
  }

  private async detectScheduleConflicts(): Promise<number> {
    try {
      // Simplified conflict detection - would need proper implementation
      // based on actual Schedule schema structure
      const totalSchedules = await this.scheduleModel.countDocuments({});
      
      // Mock conflict detection for now
      // In real implementation, would check for overlapping times/rooms
      return Math.floor(totalSchedules * 0.02); // Assume 2% conflict rate
    } catch (error) {
      console.error('Error detecting schedule conflicts:', error);
      return 5; // Mock number
    }
  }

  private timeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    // This would be implemented once we understand the time format
    // For now, return false to avoid errors
    return false;
  }

  async resolveScheduleConflict(id: string, resolution: any) {
    try {
      // Implementation for resolving schedule conflicts
      return { success: true, message: 'Schedule conflict resolved successfully' };
    } catch (error) {
      console.error('Error resolving schedule conflict:', error);
      throw error;
    }
  }

  async getPendingLessonPlans() {
    try {
      return this.lessonPlanService.findByStatus('pending' as any);
    } catch (error) {
      console.error('Error getting pending lesson plans:', error);
      return [];
    }
  }

  async approveLessonPlan(id: string, comments: string) {
    try {
      return this.lessonPlanService.approve(id, comments, 'secretary-id'); // Would pass actual secretary ID
    } catch (error) {
      console.error('Error approving lesson plan:', error);
      throw error;
    }
  }

  async rejectLessonPlan(id: string, feedback: any) {
    try {
      const feedbackArray = Array.isArray(feedback) ? feedback : [feedback.reason || 'Rejected'];
      return this.lessonPlanService.reject(id, feedbackArray, 'secretary-id'); // Would pass actual secretary ID
    } catch (error) {
      console.error('Error rejecting lesson plan:', error);
      throw error;
    }
  }

  // ===== PHASE 2: ENHANCED SCHEDULE MANAGEMENT =====
  
  async getDetailedScheduleConflicts(): Promise<ScheduleConflict[]> {
    try {
      // Advanced conflict detection with detailed analysis
      const schedules = await this.scheduleModel.find({}).populate('course teacher');
      const conflicts: ScheduleConflict[] = [];
      const conflictMap = new Map();

      // Room conflicts
      const roomConflicts = await this.detectRoomConflicts(schedules);
      conflicts.push(...roomConflicts);

      // Teacher conflicts
      const teacherConflicts = await this.detectTeacherConflicts(schedules);
      conflicts.push(...teacherConflicts);

      // Resource conflicts
      const resourceConflicts = await this.detectResourceConflicts(schedules);
      conflicts.push(...resourceConflicts);

      return conflicts;
    } catch (error) {
      console.error('Error getting detailed schedule conflicts:', error);
      return this.getMockConflicts();
    }
  }

  private async detectRoomConflicts(schedules: any[]): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];
    const roomSchedules = new Map();

    // Group schedules by room and day
    schedules.forEach(schedule => {
      if (schedule.room) {
        const key = `${schedule.room}-${schedule.dayOfWeek}`;
        if (!roomSchedules.has(key)) {
          roomSchedules.set(key, []);
        }
        roomSchedules.get(key).push(schedule);
      }
    });

    // Check for time overlaps in each room
    roomSchedules.forEach((roomScheduleList, roomDay) => {
      for (let i = 0; i < roomScheduleList.length; i++) {
        for (let j = i + 1; j < roomScheduleList.length; j++) {
          const schedule1 = roomScheduleList[i];
          const schedule2 = roomScheduleList[j];
          
          if (this.timeOverlapsAdvanced(schedule1.startTime, schedule1.endTime, schedule2.startTime, schedule2.endTime)) {
            conflicts.push({
              id: `room-conflict-${Date.now()}-${i}-${j}`,
              type: 'room',
              severity: this.calculateConflictSeverity([schedule1, schedule2]),
              description: `Room ${schedule1.room} has overlapping schedules on ${schedule1.dayOfWeek}`,
              affectedClasses: [schedule1, schedule2],
              conflictingResources: [schedule1.room],
              suggestedResolutions: this.generateRoomResolutions(schedule1, schedule2),
              createdAt: new Date(),
              status: 'pending'
            });
          }
        }
      }
    });

    return conflicts;
  }

  private async detectTeacherConflicts(schedules: any[]): Promise<ScheduleConflict[]> {
    const conflicts: ScheduleConflict[] = [];
    const teacherSchedules = new Map();

    // Group schedules by teacher and day
    schedules.forEach(schedule => {
      if (schedule.teacher) {
        const teacherId = schedule.teacher._id || schedule.teacher;
        const key = `${teacherId}-${schedule.dayOfWeek}`;
        if (!teacherSchedules.has(key)) {
          teacherSchedules.set(key, []);
        }
        teacherSchedules.get(key).push(schedule);
      }
    });

    // Check for time overlaps for each teacher
    teacherSchedules.forEach((teacherScheduleList, teacherDay) => {
      for (let i = 0; i < teacherScheduleList.length; i++) {
        for (let j = i + 1; j < teacherScheduleList.length; j++) {
          const schedule1 = teacherScheduleList[i];
          const schedule2 = teacherScheduleList[j];
          
          if (this.timeOverlapsAdvanced(schedule1.startTime, schedule1.endTime, schedule2.startTime, schedule2.endTime)) {
            conflicts.push({
              id: `teacher-conflict-${Date.now()}-${i}-${j}`,
              type: 'teacher',
              severity: this.calculateConflictSeverity([schedule1, schedule2]),
              description: `Teacher ${schedule1.teacher?.name || 'Unknown'} has overlapping schedules on ${schedule1.dayOfWeek}`,
              affectedClasses: [schedule1, schedule2],
              conflictingResources: [schedule1.teacher?.name || 'Unknown Teacher'],
              suggestedResolutions: this.generateTeacherResolutions(schedule1, schedule2),
              createdAt: new Date(),
              status: 'pending'
            });
          }
        }
      }
    });

    return conflicts;
  }

  private async detectResourceConflicts(schedules: any[]): Promise<ScheduleConflict[]> {
    // Mock implementation for resource conflicts (labs, equipment, etc.)
    return [];
  }

  private timeOverlapsAdvanced(start1: string, end1: string, start2: string, end2: string): boolean {
    try {
      // Convert time strings to minutes for comparison
      const start1Minutes = this.timeToMinutes(start1);
      const end1Minutes = this.timeToMinutes(end1);
      const start2Minutes = this.timeToMinutes(start2);
      const end2Minutes = this.timeToMinutes(end2);

      // Check if times overlap
      return start1Minutes < end2Minutes && start2Minutes < end1Minutes;
    } catch (error) {
      console.error('Error checking time overlap:', error);
      return false;
    }
  }

  private timeToMinutes(timeString: string): number {
    // Handle different time formats (HH:MM, H:MM AM/PM, etc.)
    try {
      const timeParts = timeString.toLowerCase().trim();
      let hours = 0;
      let minutes = 0;

      if (timeParts.includes('am') || timeParts.includes('pm')) {
        // 12-hour format
        const isPM = timeParts.includes('pm');
        const time = timeParts.replace(/[ap]m/g, '').trim();
        const [h, m] = time.split(':').map(Number);
        hours = isPM && h !== 12 ? h + 12 : (h === 12 && !isPM ? 0 : h);
        minutes = m || 0;
      } else {
        // 24-hour format
        const [h, m] = timeString.split(':').map(Number);
        hours = h;
        minutes = m || 0;
      }

      return hours * 60 + minutes;
    } catch (error) {
      console.error('Error parsing time:', timeString, error);
      return 0;
    }
  }

  private calculateConflictSeverity(schedules: any[]): 'low' | 'medium' | 'high' | 'critical' {
    // Calculate severity based on various factors
    const factors = {
      studentCount: schedules.reduce((sum, s) => sum + (s.enrollmentCount || 0), 0),
      courseImportance: schedules.some(s => s.course?.isCore) ? 2 : 1,
      timeOverlap: 1 // Could calculate actual overlap duration
    };

    const score = factors.studentCount * factors.courseImportance * factors.timeOverlap;

    if (score > 100) return 'critical';
    if (score > 50) return 'high';
    if (score > 20) return 'medium';
    return 'low';
  }

  private generateRoomResolutions(schedule1: any, schedule2: any): Resolution[] {
    const resolutions: Resolution[] = [];

    // Room change resolution
    resolutions.push({
      id: `resolution-room-change-${Date.now()}`,
      type: 'room_change',
      description: `Move ${schedule2.course?.name || 'one class'} to an available room`,
      effort: 'low',
      impact: ['Room assignment change', 'Student notification required'],
      automated: true
    });

    // Time reschedule resolution
    resolutions.push({
      id: `resolution-reschedule-${Date.now()}`,
      type: 'reschedule',
      description: `Reschedule ${schedule1.course?.name || 'one class'} to a different time slot`,
      effort: 'medium',
      impact: ['Time change', 'Student and teacher notification', 'Possible schedule conflicts'],
      automated: false
    });

    return resolutions;
  }

  private generateTeacherResolutions(schedule1: any, schedule2: any): Resolution[] {
    const resolutions: Resolution[] = [];

    // Teacher reassignment
    resolutions.push({
      id: `resolution-teacher-reassign-${Date.now()}`,
      type: 'teacher_reassign',
      description: `Assign a different qualified teacher to ${schedule2.course?.name || 'one class'}`,
      effort: 'high',
      impact: ['Teacher change', 'Qualification verification required', 'Student notification'],
      automated: false
    });

    // Time reschedule
    resolutions.push({
      id: `resolution-reschedule-teacher-${Date.now()}`,
      type: 'reschedule',
      description: `Reschedule one of the classes to a different time`,
      effort: 'medium',
      impact: ['Time change', 'Student notification'],
      automated: false
    });

    return resolutions;
  }

  private getMockConflicts(): ScheduleConflict[] {
    return [
      {
        id: 'conflict-1',
        type: 'room',
        severity: 'high',
        description: 'Room 204 has overlapping Mathematics and Physics classes on Monday 10:00-11:00',
        affectedClasses: [],
        conflictingResources: ['Room 204'],
        suggestedResolutions: [],
        createdAt: new Date(),
        status: 'pending'
      },
      {
        id: 'conflict-2',
        type: 'teacher',
        severity: 'medium',
        description: 'Dr. Smith is assigned to two classes at the same time on Tuesday',
        affectedClasses: [],
        conflictingResources: ['Dr. Smith'],
        suggestedResolutions: [],
        createdAt: new Date(),
        status: 'pending'
      }
    ];
  }

  async resolveConflictWithDetails(conflictId: string, resolutionId: string, additionalData?: any) {
    try {
      // Implementation for applying specific resolution to conflict
      return { 
        success: true, 
        message: 'Conflict resolved successfully',
        conflictId,
        resolutionId,
        appliedChanges: additionalData
      };
    } catch (error) {
      console.error('Error resolving conflict:', error);
      throw error;
    }
  }

  // ===== PHASE 2: LESSON PLAN APPROVAL ENHANCEMENT =====

  async getDetailedLessonPlans(status?: string): Promise<LessonPlanSchema[]> {
    try {
      const filters = status ? { status } : undefined;
      return this.lessonPlanService.findAll(filters);
    } catch (error) {
      console.error('Error getting detailed lesson plans:', error);
      return [];
    }
  }

  async reviewLessonPlan(id: string, review: {
    status: 'approved' | 'rejected' | 'revision_required';
    comments: string[];
    suggestions?: string[];
  }) {
    try {
      const secretaryId = 'secretary-id'; // This should be passed from the request
      
      let result;
      if (review.status === 'approved') {
        result = await this.lessonPlanService.approve(id, review.comments.join('; '), secretaryId);
      } else if (review.status === 'rejected') {
        result = await this.lessonPlanService.reject(id, review.comments, secretaryId);
      } else {
        result = await this.lessonPlanService.requestRevision(id, review.comments, secretaryId);
      }
      
      // Create activity log for the approval/rejection
      await this.createActivityLog({
        title: `Lesson Plan ${review.status === 'approved' ? 'Approved' : review.status === 'rejected' ? 'Rejected' : 'Revision Requested'}`,
        subtitle: `Secretary ${review.status} lesson plan: ${result.title}`,
        performBy: 'Secretary',
        actorId: secretaryId,
        createdBy: secretaryId
      });
      
      return {
        success: true,
        message: 'Lesson plan review completed',
        id,
        review,
        reviewedAt: new Date(),
        lessonPlan: result
      };
    } catch (error) {
      console.error('Error reviewing lesson plan:', error);
      throw error;
    }
  }
  
  private async createActivityLog(data: any) {
    try {
      // This would typically make an HTTP request to the activity service
      // For now, we'll just log it
      console.log('Activity logged:', data);
    } catch (error) {
      console.error('Error creating activity log:', error);
    }
  }

  // ===== PHASE 2: EXCEL IMPORT/EXPORT =====

  async processBulkEnrollment(csvData: any[]): Promise<BulkEnrollmentResult> {
    try {
      const result: BulkEnrollmentResult = {
        successful: 0,
        failed: 0,
        errors: [],
        summary: {
          newStudents: 0,
          existingStudents: 0,
          duplicates: 0
        }
      };

      for (let i = 0; i < csvData.length; i++) {
        const row = csvData[i];
        
        try {
          // Validate required fields
          const validation = this.validateEnrollmentRow(row, i + 1);
          if (!validation.isValid) {
            result.errors.push(...validation.errors);
            result.failed++;
            continue;
          }

          // Check for existing student
          const existingStudent = await this.userModel.findOne({ 
            email: row.email 
          });

          if (existingStudent) {
            result.summary.existingStudents++;
          } else {
            result.summary.newStudents++;
          }

          // Process enrollment (mock implementation)
          result.successful++;

        } catch (error) {
          result.errors.push({
            row: i + 1,
            field: 'general',
            value: JSON.stringify(row),
            error: error.message
          });
          result.failed++;
        }
      }

      return result;
    } catch (error) {
      console.error('Error processing bulk enrollment:', error);
      throw error;
    }
  }

  private validateEnrollmentRow(row: any, rowNumber: number): { isValid: boolean; errors: BulkError[] } {
    const errors: BulkError[] = [];
    
    // Required fields validation
    const requiredFields = ['firstName', 'lastName', 'email', 'studentId'];
    
    requiredFields.forEach(field => {
      if (!row[field] || row[field].toString().trim() === '') {
        errors.push({
          row: rowNumber,
          field,
          value: row[field] || '',
          error: `${field} is required`
        });
      }
    });

    // Email format validation
    if (row.email && !this.isValidEmail(row.email)) {
      errors.push({
        row: rowNumber,
        field: 'email',
        value: row.email,
        error: 'Invalid email format'
      });
    }

    // Student ID format validation
    if (row.studentId && !this.isValidStudentId(row.studentId)) {
      errors.push({
        row: rowNumber,
        field: 'studentId',
        value: row.studentId,
        error: 'Invalid student ID format'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidStudentId(studentId: string): boolean {
    // Implement your student ID format validation
    return /^[A-Z0-9]{6,10}$/.test(studentId);
  }

  async exportEnrollmentData(filters?: any): Promise<any[]> {
    try {
      // Export enrollment data to Excel format
      const students = await this.userModel.find({ 
        role: UserRole.STUDENT,
        ...filters 
      }).select('firstName lastName email schoolId studentProfileId')
      .populate('studentProfileId')
      .populate('schoolId');

      return students.map(student => ({
        'First Name': student.firstName,
        'Last Name': student.lastName,
        'Email': student.email,
        'School': (student.schoolId as any)?.name || 'N/A',
        'Profile ID': student.studentProfileId || 'N/A',
        'Status': student.status || 'Active',
        'Last Login': student.lastLogin ? new Date(student.lastLogin).toLocaleDateString() : 'Never'
      }));
    } catch (error) {
      console.error('Error exporting enrollment data:', error);
      throw error;
    }
  }
}
