import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { Attendance, AttendanceDocument } from './schema/schema.attendance';
import { Schedule, ScheduleDocument } from '../schedule/schema/schedule.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Activity } from '../activity/schema/schema.activity';
import { CourseAssignment, CourseAssignmentDocument } from '../course/schema/course-assignment.schema';
import { Alert, AlertDocument } from '../alert/schema/alert.schema';
import { Course, CourseDocument } from '../course/schema/course.schema';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name)
    private attendanceModel: Model<AttendanceDocument>,
    @InjectModel(Schedule.name)
    private scheduleModel: Model<ScheduleDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectModel(Activity.name)
    private activityModel: Model<any>,
    @InjectModel(CourseAssignment.name)
    private courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Alert.name)
    private alertModel: Model<AlertDocument>,
    @InjectModel(Course.name)
    private courseModel: Model<CourseDocument>,
  ) {}

  async markAttendance(
    createAttendanceDto: CreateAttendanceDto,
  ): Promise<Attendance> {
    try {
      const exists = await this.attendanceModel.findOne({
        teacherId: createAttendanceDto.teacherId,
        courseId: createAttendanceDto.courseId,
        class: createAttendanceDto.class,
        section: createAttendanceDto.section,
        date: createAttendanceDto.date,
      });

      // If attendance already exists, update it instead of throwing error
      if (exists) {
        // Map DTO students to schema format
        exists.students = createAttendanceDto.students.map((student) => ({
          _id: new Types.ObjectId(student._id),
          studentId: student.studentId,
          studentName: student.studentName,
          attendance: student.attendance,
          note: student.note || '',
          checkInTime: undefined,
          checkOutTime: undefined,
          reason: undefined,
        })) as any;
        const updatedAttendance = await exists.save();

        // Log activity for update
        try {
          const teacher = await this.userModel.findById(createAttendanceDto.teacherId).select('role').lean();
          const userRole = teacher?.role || 'TEACHER';
          let performByValue = 'TEACHER';
          if (userRole === 'ADMIN') {
            performByValue = 'ADMIN';
          } else if (userRole === 'SUPER_ADMIN') {
            performByValue = 'SUPER_ADMIN';
          }

          await this.activityModel.create({
            title: 'Attendance Updated',
            subtitle: `Attendance updated for ${createAttendanceDto.class}-${createAttendanceDto.section} on ${createAttendanceDto.date}`,
            performBy: performByValue,
            actorId: new Types.ObjectId(createAttendanceDto.teacherId),
            teacherId: createAttendanceDto.teacherId.toString(),
          });
        } catch (activityError) {
          console.error('Failed to create activity for attendance update:', activityError);
        }

        // Create alerts for parents when attendance is updated
        try {
          console.log('Creating parent alerts for attendance update:', updatedAttendance);
          await this.createParentAlertsForAttendance(updatedAttendance);
        } catch (alertError) {
          console.error('Failed to create parent alerts for attendance update:', alertError);
          // Don't fail attendance update if alert creation fails
        }

        return updatedAttendance;
      }

      const attendance = new this.attendanceModel(createAttendanceDto);
      const savedAttendance = await attendance.save();

      // Log activity
      try {
        const teacher = await this.userModel.findById(createAttendanceDto.teacherId).select('role').lean();
        const userRole = teacher?.role || 'TEACHER';
        let performByValue = 'TEACHER';
        if (userRole === 'ADMIN') {
          performByValue = 'ADMIN';
        } else if (userRole === 'SUPER_ADMIN') {
          performByValue = 'SUPER_ADMIN';
        }

        await this.activityModel.create({
          title: 'Attendance Recorded',
          subtitle: `Attendance recorded for ${createAttendanceDto.class}-${createAttendanceDto.section} on ${createAttendanceDto.date}`,
          performBy: performByValue,
          actorId: new Types.ObjectId(createAttendanceDto.teacherId),
          teacherId: createAttendanceDto.teacherId.toString(),
        });
      } catch (activityError) {
        console.error('Failed to create activity for attendance:', activityError);
      }

      // Create alerts for parents
      try {
        console.log('Creating parent alerts for attendance:', savedAttendance);
        await this.createParentAlertsForAttendance(savedAttendance);
      } catch (alertError) {
        console.error('Failed to create parent alerts for attendance:', alertError);
        // Don't fail attendance creation if alert creation fails
      }

      return savedAttendance;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(error);
      }
      console.error('Error marking attendance:', error);
      throw new InternalServerErrorException('Failed to mark attendance');
    }
  }

  async summarizeAttendanceByStatus(data: any[]) {
    try {
      const summary = {
        Present: { count: 0, students: [] },
        Absent: { count: 0, students: [] },
        Late: { count: 0, students: [] },
        Excused: { count: 0, students: [] },
      };

      for (const student of data) {
        const status = student.attendance;
        if (summary[status]) {
          summary[status].count += 1;
          summary[status].students.push(student.studentName);
        }
      }

      const total = data.length;

      const result = Object.entries(summary).map(
        ([status, { count, students }]) => ({
          status,
          percentage: total ? Math.round((count / total) * 100) : 0,
          count,
          students,
        }),
      );
      return result;
    } catch (error) {
      console.error('Error summarizing attendance:', error);
      throw new InternalServerErrorException('Could not summarize attendance');
    }
  }

  async getTeacherViewAttendance(
    courseId: string,
    room: string,
    section: string,
    date: string,
    teacherId?: string,
  ): Promise<Attendance[]> {
    try {
      if (!courseId || !room || !section || !date) {
        throw new BadRequestException('Missing required parameters');
      }

      const filters: any = {
        courseId,
        class: room,
        section,
        date,
      };

      if (teacherId) {
        filters.teacherId = teacherId;
      }

      console.log(filters);

      let result: any = await this.attendanceModel.findOne(filters).exec();

      if (result != null) {
        const attendanceReport = await this.summarizeAttendanceByStatus(
          result['students'],
        );
        result = result.toObject();
        result['attendanceReport'] = attendanceReport;
      }

      return result;
    } catch (error) {
      console.error('Error in getTeacherViewAttendance:', error);
      throw new InternalServerErrorException('Failed to retrieve attendance');
    }
  }

  async findByStudent(studentId: string): Promise<Attendance[]> {
    return this.attendanceModel
      .find({ studentId })
      .populate('teacherId courseId')
      .exec();
  }

  async getTeacherAttendanceRecords(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    filters?: { courseId?: string; class?: string; section?: string; date?: string; search?: string },
  ): Promise<{ data: Attendance[]; total: number; page: number; totalPages: number }> {
    try {
      const query: any = { teacherId };

      if (filters?.courseId) {
        query.courseId = filters.courseId;
      }
      if (filters?.class) {
        query.class = filters.class;
      }
      if (filters?.section) {
        query.section = filters.section;
      }
      if (filters?.date) {
        query.date = filters.date;
      }

      // Search functionality - search in course name, course code, class, section
      if (filters?.search && filters.search.trim()) {
        const searchRegex = new RegExp(filters.search.trim(), 'i');
        query.$or = [
          { class: searchRegex },
          { section: searchRegex },
        ];
      }

      const skip = (page - 1) * limit;
      let dataQuery = this.attendanceModel
        .find(query)
        .populate('courseId', 'courseName courseCode')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // If search is provided, also filter by course name/code after population
      const [data, total] = await Promise.all([
        dataQuery.lean().exec(),
        this.attendanceModel.countDocuments(query),
      ]);

      // Filter by search term in populated course data if search is provided
      let filteredData = data;
      if (filters?.search && filters.search.trim()) {
        const searchTerm = filters.search.trim().toLowerCase();
        filteredData = data.filter((record: any) => {
          const courseName = record.courseId?.courseName?.toLowerCase() || '';
          const courseCode = record.courseId?.courseCode?.toLowerCase() || '';
          const className = record.class?.toLowerCase() || '';
          const section = record.section?.toLowerCase() || '';
          return courseName.includes(searchTerm) || 
                 courseCode.includes(searchTerm) || 
                 className.includes(searchTerm) || 
                 section.includes(searchTerm);
        });
      }

      return {
        data: filteredData,
        total: filters?.search ? filteredData.length : total,
        page,
        totalPages: filters?.search ? Math.ceil(filteredData.length / limit) : Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error getting teacher attendance records:', error);
      throw new InternalServerErrorException('Failed to retrieve attendance records');
    }
  }

  async updateAttendance(
    attendanceId: string,
    teacherId: string,
    updateData: { students: any[]; date?: string },
  ): Promise<Attendance> {
    try {
      const attendance = await this.attendanceModel.findOne({
        _id: attendanceId,
        teacherId,
      });

      if (!attendance) {
        throw new BadRequestException('Attendance record not found');
      }

      if (updateData.students) {
        attendance.students = updateData.students;
      }
      if (updateData.date) {
        attendance.date = updateData.date;
      }

      const updatedAttendance = await attendance.save();

      // Log activity
      try {
        const teacher = await this.userModel.findById(teacherId).select('role').lean();
        const userRole = teacher?.role || 'TEACHER';
        let performByValue = 'TEACHER';
        if (userRole === 'ADMIN') {
          performByValue = 'ADMIN';
        } else if (userRole === 'SUPER_ADMIN') {
          performByValue = 'SUPER_ADMIN';
        }

        await this.activityModel.create({
          title: 'Attendance Updated',
          subtitle: `Attendance updated for ${attendance.class}-${attendance.section} on ${attendance.date}`,
          performBy: performByValue,
          actorId: new Types.ObjectId(teacherId),
          teacherId: teacherId.toString(),
        });
      } catch (activityError) {
        console.error('Failed to create activity for attendance update:', activityError);
      }

      return updatedAttendance;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error updating attendance:', error);
      throw new InternalServerErrorException('Failed to update attendance');
    }
  }

  async deleteAttendance(attendanceId: string, teacherId: string): Promise<void> {
    try {
      const attendance = await this.attendanceModel.findOne({
        _id: attendanceId,
        teacherId,
      });

      if (!attendance) {
        throw new BadRequestException('Attendance record not found');
      }

      const attendanceData = attendance.toObject();
      await this.attendanceModel.deleteOne({
        _id: attendanceId,
        teacherId,
      });

      // Log activity
      try {
        const teacher = await this.userModel.findById(teacherId).select('role').lean();
        const userRole = teacher?.role || 'TEACHER';
        let performByValue = 'TEACHER';
        if (userRole === 'ADMIN') {
          performByValue = 'ADMIN';
        } else if (userRole === 'SUPER_ADMIN') {
          performByValue = 'SUPER_ADMIN';
        }

        await this.activityModel.create({
          title: 'Attendance Deleted',
          subtitle: `Attendance deleted for ${attendanceData.class}-${attendanceData.section} on ${attendanceData.date}`,
          performBy: performByValue,
          actorId: new Types.ObjectId(teacherId),
          teacherId: teacherId.toString(),
        });
      } catch (activityError) {
        console.error('Failed to create activity for attendance deletion:', activityError);
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error deleting attendance:', error);
      throw new InternalServerErrorException('Failed to delete attendance');
    }
  }

  async getAttendanceById(attendanceId: string, teacherId: string): Promise<Attendance> {
    try {
      // Prevent route conflicts - if id is "courses" or "students", it's a route conflict
      if (attendanceId === 'courses' || attendanceId === 'students' || attendanceId === 'records') {
        throw new BadRequestException('Invalid attendance ID. This endpoint is for attendance records only.');
      }

      // Validate ObjectId format
      if (!Types.ObjectId.isValid(attendanceId)) {
        throw new BadRequestException('Invalid attendance ID format');
      }

      const attendance = await this.attendanceModel
        .findOne({
          _id: new Types.ObjectId(attendanceId),
          teacherId,
        })
        .populate('courseId', 'courseName courseCode')
        .lean()
        .exec();

      if (!attendance) {
        throw new BadRequestException('Attendance record not found');
      }

      const attendanceReport = await this.summarizeAttendanceByStatus(attendance.students);
      return {
        ...attendance,
        attendanceReport,
      } as any;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error getting attendance by ID:', error);
      throw new InternalServerErrorException('Failed to retrieve attendance');
    }
  }

  async getTeacherCoursesForAttendance(teacherId: string): Promise<any[]> {
    try {
      // Fetch course assignments from CourseAssignment model (where admin assigns courses)
      const courseAssignments = await this.courseAssignmentModel
        .find({ teacherId: new Types.ObjectId(teacherId) })
        .populate('courseId', 'courseName courseCode')
        .lean()
        .exec();

      console.log(`Found ${courseAssignments.length} course assignments for teacher ${teacherId}`);

      // Group by course, grade, and section
      const courseMap = new Map<string, any>();

      courseAssignments.forEach((assignment: any) => {
        if (!assignment.courseId) {
          console.warn('Course assignment missing courseId:', assignment._id);
          return;
        }

        const courseId = assignment.courseId._id?.toString() || assignment.courseId.toString();
        const courseName = assignment.courseId.courseName || 'Unknown Course';
        const courseCode = assignment.courseId.courseCode || '';

        // Each assignment can have multiple grades/sections
        if (assignment.grades && Array.isArray(assignment.grades)) {
          assignment.grades.forEach((grade: any) => {
            const gradeLevel = `Grade ${grade.level}`;
            const section = grade.section || 'A';
            const key = `${courseId}-${gradeLevel}-${section}`;

            if (!courseMap.has(key)) {
              courseMap.set(key, {
                courseId: courseId,
                courseName: courseName,
                courseCode: courseCode,
                gradeLevel: gradeLevel,
                section: section,
                timeSlots: [],
              });
            }

            const courseData = courseMap.get(key);
            // Add time slots from this grade
            if (grade.timeSlots && Array.isArray(grade.timeSlots)) {
              grade.timeSlots.forEach((slot: any) => {
                courseData.timeSlots.push({
                  day: slot.day,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                });
              });
            }
          });
        }
      });

      const result = Array.from(courseMap.values());
      console.log(`Returning ${result.length} unique course-grade-section combinations`);
      return result;
    } catch (error) {
      console.error('Error getting teacher courses for attendance:', error);
      throw new InternalServerErrorException('Failed to retrieve courses');
    }
  }

  async getStudentsForAttendance(
    gradeLevel: string,
    section: string,
    schoolId: string,
  ): Promise<any[]> {
    try {
      console.log('Fetching students for attendance:', { gradeLevel, section, schoolId });
      
      // Handle different grade level formats
      // gradeLevel could be: "Grade 1", "1", "Grade1", etc.
      // Try to match both formats
      let gradeQuery: any = {};
      
      // Extract number from gradeLevel if it's in "Grade X" format
      const gradeMatch = gradeLevel.match(/(\d+)/);
      const gradeNumber = gradeMatch ? gradeMatch[1] : null;
      
      if (gradeNumber) {
        // Try both "Grade X" and just the number
        gradeQuery = {
          $or: [
            { class: gradeLevel }, // Exact match (e.g., "Grade 1")
            { class: `Grade ${gradeNumber}` }, // Normalized format
            { class: gradeNumber }, // Just the number
            { class: `Grade${gradeNumber}` }, // No space format
          ]
        };
      } else {
        // If no number found, use exact match
        gradeQuery = { class: gradeLevel };
      }

      const query = {
        role: 'STUDENT',
        schoolId: new Types.ObjectId(schoolId),
        ...gradeQuery,
        section: section,
        isActive: true,
      };

      console.log('Student query:', JSON.stringify(query, null, 2));

      const students = await this.userModel
        .find(query)
        .select('_id firstName lastName studentId class section email')
        .sort({ firstName: 1, lastName: 1 })
        .lean()
        .exec();

      console.log(`Found ${students.length} students for gradeLevel: ${gradeLevel}, section: ${section}`);

      return students.map((student: any) => ({
        _id: student._id.toString(),
        studentId: student.studentId || student._id.toString(),
        studentName: `${student.firstName} ${student.lastName}`,
        attendance: 'Present',
        note: '',
      }));
    } catch (error) {
      console.error('Error getting students for attendance:', error);
      throw new InternalServerErrorException('Failed to retrieve students');
    }
  }

  /**
   * Create alerts for parents when attendance is created/updated
   * Mimics the grade creation alert logic pattern
   */
  private async createParentAlertsForAttendance(attendance: any): Promise<void> {
    try {
      console.log(`\n📢 ========== CREATING PARENT ALERTS FOR ATTENDANCE ==========`);
      console.log(`📋 Attendance ID: ${attendance._id}`);
      console.log(`📋 Date: ${attendance.date}`);
      console.log(`📋 Students count: ${attendance.students?.length || 0}`);

      if (!attendance.students || attendance.students.length === 0) {
        console.log(`⚠️ No students in attendance record. No alerts to create.`);
        return;
      }

      // Get unique student User IDs from attendance
      // Note: student._id in attendance.students should be the User ID (same as grade.studentId)
      const studentUserIds = [...new Set(
        attendance.students
          .map((student: any) => {
            // Extract User ID from student entry
            const studentUserId = student._id?.toString() || student._id;
            return studentUserId;
          })
          .filter((id: any) => id != null && id !== '')
      )];
      console.log(`📋 Unique student User IDs: ${studentUserIds.length}`);

      if (studentUserIds.length === 0) {
        console.log(`⚠️ No valid student IDs found. No alerts to create.`);
        return;
      }

      // Get User records directly with parentIds array (same as grade creation)
      const studentUsers = await this.userModel
        .find({ _id: { $in: studentUserIds.map((id: string) => new Types.ObjectId(id)) } })
        .select('_id firstName lastName parentIds schoolId')
        .lean();

      console.log(`📋 Student Users found: ${studentUsers.length}`);

      // Create a map: studentUserId -> User record
      const userMap = new Map<string, any>();
      for (const user of studentUsers) {
        userMap.set(user._id.toString(), user);
      }

      // Get course details for attendance descriptions
      const course = await this.courseModel
        .findById(attendance.courseId)
        .select('courseName')
        .lean();
      
      const courseName = (course as any)?.courseName || 'Unknown Course';

      // Create alerts for each parent
      const alertsToCreate: any[] = [];
      const parentAttendanceMap = new Map<string, any[]>(); // parentId -> attendance entries[]

      // Group attendance by student and collect parent IDs directly from User record (same pattern as grades)
      for (const studentEntry of attendance.students) {
        // Get student User ID (should be User ID, not Student profile ID)
        const studentUserId = studentEntry._id?.toString() || studentEntry._id;
        const studentUser = userMap.get(studentUserId);
        
        if (!studentUser) {
          console.log(`⚠️ Student User not found for attendance entry (User ID: ${studentUserId})`);
          continue;
        }

        // Only create alerts for Absent, Late, or Excused status
        const attendanceStatus = studentEntry.attendance || 'Present';
        if (attendanceStatus === 'Present') {
          continue; // Skip present students
        }

        // Get parent IDs directly from User record's parentIds array (same as grade creation)
        const parentIds = (studentUser as any).parentIds || [];
        
        if (!parentIds || parentIds.length === 0) {
          console.log(`⚠️ No parents found for student User: ${studentUserId}`);
          continue;
        }

        console.log(`✅ Found ${parentIds.length} parent ID(s) for student User: ${studentUserId}`);

        // Extract parent User IDs from parentIds array (same pattern as grades)
        const parentUserIds = parentIds
          .map((parentId: any) => {
            const parentIdStr = parentId.toString ? parentId.toString() : parentId._id ? parentId._id.toString() : parentId;
            return parentIdStr;
          })
          .filter((id: string) => id != null && id !== '');

        console.log(`✅ Extracted ${parentUserIds.length} parent User ID(s) from parentIds array`);

        // Create alert for each parent User ID
        for (const parentUserId of parentUserIds) {
          if (!parentUserId) continue;

          // Group attendance entries by parent User ID to create consolidated alerts
          if (!parentAttendanceMap.has(parentUserId)) {
            parentAttendanceMap.set(parentUserId, []);
          }
          parentAttendanceMap.get(parentUserId)!.push({
            studentEntry,
            studentUser,
            courseName,
            studentId: studentUserId
          });
        }
      }

      // Create alerts for each parent (same pattern as grades)
      for (const [parentId, attendanceData] of parentAttendanceMap.entries()) {
        // Group by student to create separate alerts per student
        const studentGroups = new Map<string, any[]>();
        
        for (const item of attendanceData) {
          const studentId = item.studentId;
          if (!studentGroups.has(studentId)) {
            studentGroups.set(studentId, []);
          }
          studentGroups.get(studentId)!.push(item);
        }

        // Create one alert per student for this parent
        for (const [studentId, studentAttendance] of studentGroups.entries()) {
          const firstEntry = studentAttendance[0];
          const studentUser = firstEntry.studentUser;
          const studentName = `${(studentUser as any).firstName || ''} ${(studentUser as any).lastName || ''}`.trim() || 'Student';
          
          // Get attendance status
          const attendanceStatus = firstEntry.studentEntry.attendance || 'Absent';
          
          // Create alert title and description
          const title = `Attendance Alert: ${attendanceStatus}`;
          
          let description = `${studentName} was marked as ${attendanceStatus} on ${attendance.date}.\n\n`;
          description += `Course: ${firstEntry.courseName}\n`;
          description += `Class: ${attendance.class}-${attendance.section}\n`;
          
          if (firstEntry.studentEntry.note) {
            description += `Note: ${firstEntry.studentEntry.note}\n`;
          }

          alertsToCreate.push({
            parentId: new Types.ObjectId(parentId), // parentId is the User ID (same as grades)
            title,
            description: description.trim(),
            read: false,
            studentId: new Types.ObjectId(firstEntry.studentId), // studentId is the User ID
            alertType: 'attendance',
            schoolId: (firstEntry.studentUser as any).schoolId ? new Types.ObjectId((firstEntry.studentUser as any).schoolId) : undefined,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }

      if (alertsToCreate.length > 0) {
        console.log(`📋 Creating ${alertsToCreate.length} alert(s) for parents...`);
        await this.alertModel.insertMany(alertsToCreate);
        console.log(`✅ Successfully created ${alertsToCreate.length} parent alert(s)`);
      } else {
        console.log(`⚠️ No alerts to create (no parents found for students or all students are present)`);
      }

      console.log(`📢 ========== END PARENT ALERTS CREATION ==========\n`);
    } catch (error) {
      console.error('Error creating parent alerts for attendance:', error);
      throw error;
    }
  }

  // ==================== ATTENDANCE REPORTS ====================

  async generateLateReport(schoolId: string, filters: any): Promise<any> {
    try {
      const query: any = { 'students.attendance': { $in: ['Late', 'late'] } };
      const schoolIdObj = new Types.ObjectId(schoolId);
      query.$or = [{ schoolId: schoolIdObj }, { schoolId: { $exists: false } }];

      if (filters.gradeLevel) query.class = filters.gradeLevel;
      if (filters.class) query.section = filters.class;
      if (filters.teacherId) query.teacherId = new Types.ObjectId(filters.teacherId);
      if (filters.studentId) query['students._id'] = new Types.ObjectId(filters.studentId);
      
      if (filters.startDate || filters.endDate) {
        query.date = {};
        if (filters.startDate) query.date.$gte = new Date(filters.startDate);
        if (filters.endDate) query.date.$lte = new Date(filters.endDate);
      }

      let records = await this.attendanceModel.find(query)
        .populate('teacherId', 'firstName lastName email')
        .populate('courseId', 'name schoolId')
        .lean()
        .exec();

      records = records.filter((r: any) => {
        if (r.schoolId && r.schoolId.toString() === schoolId) return true;
        const course = r.courseId as any;
        return course?.schoolId && course.schoolId.toString() === schoolId;
      });

      const lateStudents = [];
      for (const record of records) {
        for (const student of record.students || []) {
          const status = (student.attendance || '').toLowerCase();
          if (status === 'late') {
            lateStudents.push({
              studentId: student.studentId,
              studentName: student.studentName,
              gradeLevel: record.class || 'N/A',
              section: record.section || 'N/A',
              date: new Date(record.date).toLocaleDateString(),
              course: (record.courseId as any)?.name || 'N/A',
              teacher: record.teacherId ? `${(record.teacherId as any).firstName} ${(record.teacherId as any).lastName}` : 'N/A',
              note: student.note || 'N/A'
            });
          }
        }
      }

      return {
        reportType: 'Late Attendance Report',
        generatedAt: new Date(),
        totalRecords: lateStudents.length,
        filters,
        data: lateStudents
      };
    } catch (error) {
      console.error('Error generating late report:', error);
      throw error;
    }
  }

  async generateAbsentReport(schoolId: string, filters: any): Promise<any> {
    try {
      const query: any = { 'students.attendance': { $in: ['Absent', 'absent'] } };
      const schoolIdObj = new Types.ObjectId(schoolId);
      query.$or = [{ schoolId: schoolIdObj }, { schoolId: { $exists: false } }];

      if (filters.gradeLevel) query.class = filters.gradeLevel;
      if (filters.class) query.section = filters.class;
      if (filters.teacherId) query.teacherId = new Types.ObjectId(filters.teacherId);
      if (filters.studentId) query['students._id'] = new Types.ObjectId(filters.studentId);
      if (filters.startDate || filters.endDate) {
        query.date = {};
        if (filters.startDate) query.date.$gte = new Date(filters.startDate);
        if (filters.endDate) query.date.$lte = new Date(filters.endDate);
      }

      let records = await this.attendanceModel.find(query)
        .populate('teacherId', 'firstName lastName email')
        .populate('courseId', 'name schoolId')
        .lean()
        .exec();

      records = records.filter((r: any) => r.schoolId?.toString() === schoolId || (r.courseId as any)?.schoolId?.toString() === schoolId);

      const absentStudents = [];
      for (const record of records) {
        for (const student of record.students || []) {
          const status = (student.attendance || '').toLowerCase();
          if (status === 'absent') {
            absentStudents.push({
              studentId: student.studentId,
              studentName: student.studentName,
              gradeLevel: record.class || 'N/A',
              section: record.section || 'N/A',
              date: new Date(record.date).toLocaleDateString(),
              course: (record.courseId as any)?.name || 'N/A',
              teacher: record.teacherId ? `${(record.teacherId as any).firstName} ${(record.teacherId as any).lastName}` : 'N/A',
              note: student.note || 'N/A'
            });
          }
        }
      }

      return {
        reportType: 'Absent Attendance Report',
        generatedAt: new Date(),
        totalRecords: absentStudents.length,
        filters,
        data: absentStudents
      };
    } catch (error) {
      console.error('Error generating absent report:', error);
      throw error;
    }
  }

  async generateExcusedReport(schoolId: string, filters: any): Promise<any> {
    try {
      const query: any = { 'students.attendance': { $in: ['Excused', 'excused'] } };
      const schoolIdObj = new Types.ObjectId(schoolId);
      query.$or = [{ schoolId: schoolIdObj }, { schoolId: { $exists: false } }];

      if (filters.gradeLevel) query.class = filters.gradeLevel;
      if (filters.class) query.section = filters.class;
      if (filters.teacherId) query.teacherId = new Types.ObjectId(filters.teacherId);
      if (filters.studentId) query['students._id'] = new Types.ObjectId(filters.studentId);
      if (filters.startDate || filters.endDate) {
        query.date = {};
        if (filters.startDate) query.date.$gte = new Date(filters.startDate);
        if (filters.endDate) query.date.$lte = new Date(filters.endDate);
      }

      let records = await this.attendanceModel.find(query)
        .populate('teacherId', 'firstName lastName email')
        .populate('courseId', 'name schoolId')
        .lean()
        .exec();

      records = records.filter((r: any) => r.schoolId?.toString() === schoolId || (r.courseId as any)?.schoolId?.toString() === schoolId);

      const excusedStudents = [];
      for (const record of records) {
        for (const student of record.students || []) {
          const status = (student.attendance || '').toLowerCase();
          if (status === 'excused') {
            excusedStudents.push({
              studentId: student.studentId,
              studentName: student.studentName,
              gradeLevel: record.class || 'N/A',
              section: record.section || 'N/A',
              date: new Date(record.date).toLocaleDateString(),
              course: (record.courseId as any)?.name || 'N/A',
              teacher: record.teacherId ? `${(record.teacherId as any).firstName} ${(record.teacherId as any).lastName}` : 'N/A',
              reason: student.note || 'No reason provided'
            });
          }
        }
      }

      return {
        reportType: 'Excused Attendance Report',
        generatedAt: new Date(),
        totalRecords: excusedStudents.length,
        filters,
        data: excusedStudents
      };
    } catch (error) {
      console.error('Error generating excused report:', error);
      throw error;
    }
  }
}
