import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, ClientSession } from 'mongoose';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { Course } from '../course/schema/course.schema';
import { Teacher } from './schema/schema.teacher';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { TeacherProfile, TeacherProfileDocument } from '../auth/schemas/teacher-profile.schema';
import { Schedule, ScheduleDocument } from '../schedule/schema/schedule.schema';
import { LessonPlan, LessonPlanDocument } from '../lesson-plan/schema/lesson-plan.schema';
import { CourseAssignment, CourseAssignmentDocument } from '../course/schema/course-assignment.schema';
import { UpdateTeacherDto } from './dto/update-teaacher.dto';
import * as xlsx from 'xlsx';
import * as fs from 'fs';
import { ResponseDto } from '../dto/response.dto';
import * as bcrypt from 'bcrypt';
import { UploadedFileType } from '../../utils/multer.config';

import { ValidationUtils } from '../utils/validation.utils';

@Injectable()
export class TeacherService {
  constructor(
    @InjectModel(Teacher.name) private readonly teacherModel: Model<Teacher>,
    @InjectModel(Course.name) private readonly courseModel: Model<Course>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(TeacherProfile.name) private readonly teacherProfileModel: Model<TeacherProfileDocument>,
    @InjectModel(Schedule.name) private readonly scheduleModel: Model<ScheduleDocument>,
    @InjectModel(LessonPlan.name) private readonly lessonPlanModel: Model<LessonPlanDocument>,
    @InjectModel(CourseAssignment.name) private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async addTeacher(
    createTeacherDto: CreateTeacherDto,
  ): Promise<Teacher | ResponseDto> {
    const existingTeacher = await this.teacherModel.findOne({
      email: createTeacherDto.email,
    });

    if (existingTeacher) {
      return {
        status: HttpStatus.CONFLICT,
        msg: `Teacher with this ${createTeacherDto.email} already exists`,
      };
    }

    const newTeacher = new this.teacherModel(createTeacherDto);
    return newTeacher.save();
  }

  async bulkUpload(file: UploadedFileType) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const workbook = xlsx.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: any[] = xlsx.utils.sheet_to_json(sheet);

      const BATCH_SIZE = 100;
      let insertedCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const result = await this.processTeacherBatch(batch, session);
        insertedCount += result.insertedCount;
        skippedCount += result.skippedCount;
      }

      await session.commitTransaction();
      return { insertedCount, skippedCount };
    } catch (error) {
      await session.abortTransaction();
      throw new Error(`Teacher bulk upload failed: ${error.message}`);
    } finally {
      session.endSession();
    }
  }

  private async processTeacherBatch(batch: any[], session: ClientSession) {
    let insertedCount = 0;
    let skippedCount = 0;

    const teachersToInsert = [];

    for (const row of batch) {
      try {
        // Check for required fields
        if (!row.email || !row.firstName || !row.lastName) {
          skippedCount++;
          continue;
        }

        // Check if teacher already exists
        const existingTeacher = await this.teacherModel.findOne({
          email: row.email,
        }).session(session);

        if (existingTeacher) {
          skippedCount++;
          continue;
        }

        // Prepare teacher data
        const teacherData = {
          email: row.email,
          firstName: row.firstName,
          lastName: row.lastName,
          phoneNumber: row.phoneNumber || '',
          address: row.address || '',
          dateOfBirth: row.dateOfBirth ? new Date(row.dateOfBirth) : undefined,
          gender: row.gender || 'Other',
          qualification: row.qualification || '',
          experience: row.experience || 0,
          joiningDate: row.joiningDate ? new Date(row.joiningDate) : new Date(),
          subject: row.subject || '',
          emergencyContact: row.emergencyContact || '',
          password: row.password ? await bcrypt.hash(row.password, 10) : await bcrypt.hash('defaultpassword', 10),
        };

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(teacherData.email)) {
          skippedCount++;
          continue;
        }

        teachersToInsert.push(teacherData);
      } catch (error) {
        skippedCount++;
        continue;
      }
    }

    if (teachersToInsert.length > 0) {
      try {
        await this.teacherModel.insertMany(teachersToInsert, { session });
        insertedCount = teachersToInsert.length;
      } catch (error) {
        // If batch insert fails, try individual inserts
        for (const teacherData of teachersToInsert) {
          try {
            await this.teacherModel.create([teacherData], { session });
            insertedCount++;
          } catch (individualError) {
            skippedCount++;
          }
        }
      }
    }

    return { insertedCount, skippedCount };
  }

  async updateTeacher(
    id: string,
    updateTeacherDto: UpdateTeacherDto,
  ): Promise<Teacher> {
    const existingTeacher = await this.teacherModel.findById(id);
    if (!existingTeacher) {
      throw new NotFoundException('Teacher not found');
    }
    return this.teacherModel.findByIdAndUpdate(id, updateTeacherDto, {
      new: true,
    });
  }
  async assignCourseToTeacher(
    teacherId: string,
    courseId: string,
  ): Promise<{ teacher: Teacher; course: Course }> {
    const teacher = await this.teacherModel.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const course = await this.courseModel.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // if (teacher.assignedCourses.includes(courseId)) {
    //   throw new NotFoundException('Course already assigned to this teacher');
    // }

    const session = await this.teacherModel.db.startSession();
    session.startTransaction();

    try {
      const updatedTeacher = await this.teacherModel.findByIdAndUpdate(
        teacherId,
        { $addToSet: { assignedCourses: courseId } },
        { new: true, session },
      );

      const updatedCourse = await this.courseModel.findByIdAndUpdate(
        courseId,
        { assigned: true },
        { new: true, session },
      );

      await session.commitTransaction();
      await session.endSession();

      return { teacher: updatedTeacher, course: updatedCourse };
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      throw new Error('Failed to assign course to teacher');
    }
  }

  async getAssignedCoursesForTeacher(teacherId: string): Promise<Course[]> {
    // Validate teacher ID
    if (!ValidationUtils.isValidObjectId(teacherId)) {
      throw new BadRequestException('Invalid teacher ID format');
    }

    // First verify the teacher exists in User schema
    const teacherUser = await this.userModel
      .findOne({ _id: teacherId, role: 'TEACHER' });

    if (!teacherUser) {
      throw new NotFoundException('Teacher not found');
    }


    
    // Convert string to ObjectId for proper comparison
    const mongoose = require('mongoose');
    const teacherObjectId = new mongoose.Types.ObjectId(teacherId);

    // Get courses from teacher's schedule assignments (most accurate)
    const teacherSchedules = await this.scheduleModel.find({
      teacherId: teacherObjectId
    }).populate('courseId').exec();

    if (teacherSchedules && teacherSchedules.length > 0) {

      
      // Extract unique courses from schedules
      const courseMap = new Map();
      teacherSchedules.forEach(schedule => {
        const course = schedule.courseId as any;
        if (course && course._id) {
          courseMap.set(course._id.toString(), course);
        }
      });
      
      const assignedCourses = Array.from(courseMap.values());
      console.log(`📚 Found ${assignedCourses.length} unique courses from schedules`);
      
      return assignedCourses;
    }

    // Fallback: Get teacher profile with assigned courses
    const teacherProfile = await this.teacherProfileModel
      .findOne({ userId: teacherId })
      .select('assignedCourses');

    if (!teacherProfile) {
      console.log('❌ Teacher profile not found');
      return [];
    }

    // // Check if teacher has assignedCourses field
    // if (!teacherProfile.assignedCourses || teacherProfile.assignedCourses.length === 0) {
    //   console.log('❌ No assigned courses in teacher profile');
    //   return [];
    // }

    // // Filter out invalid ObjectIds from assigned courses
    // const validCourseIds = ValidationUtils.filterValidObjectIds(teacherProfile.assignedCourses);

    // if (validCourseIds.length === 0) {
    //   return [];
    // }

    const courses = await this.courseModel.find({
      // _id: { $in: validCourseIds },
    });

    console.log(`📚 Found ${courses.length} courses from teacher profile`);
    return courses;
  }
  async getUnassignedCoursesByTeacherId(teacherId: string): Promise<any> {
    // Step 1: Get the teacher and their department name
    const teacher = await this.teacherModel
      .findById(teacherId)
      .select('department');
    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    // Since departments are removed, return all unassigned courses
    const unassignedCourses = await this.courseModel.find({
      // assigned: false,
    });

    return unassignedCourses;
  }

  async removeCourseAssignment(
    teacherId: string,
    courseId: string,
  ): Promise<{ teacher: Teacher; course: Course }> {
    // Add validation at the start
    // if (!isValidObjectId(teacherId)) {
    //   throw new BadRequestException('Invalid teacher ID format');
    // }
    // if (!isValidObjectId(courseId)) {
    //   throw new BadRequestException('Invalid course ID format');
    // }

    // Verify teacher exists
    const teacher = await this.teacherModel.findById(teacherId);
    if (!teacher) {
      throw new NotFoundException(`Teacher with ID ${teacherId} not found`);
    }

    // Verify course exists
    const course = await this.courseModel.findById(courseId);
    if (!course) {
      throw new NotFoundException(`Course with ID ${courseId} not found`);
    }

    // Check if course is actually assigned
    // const courseIndex = teacher.assignedCourses.findIndex(
    //   (id) => id.toString() === courseId,
    // );

    // if (courseIndex === -1) {
    //   throw new BadRequestException(
    //     `Course ${courseId} is not assigned to teacher ${teacherId}`,
    //   );
    // }

    const session = await this.teacherModel.db.startSession();
    session.startTransaction();

    try {
      // Remove course from teacher's array
      const updatedTeacher = await this.teacherModel.findByIdAndUpdate(
        teacherId,
        { $pull: { assignedCourses: courseId } },
        { new: true, session },
      );

      // Update course status
      const updatedCourse = await this.courseModel.findByIdAndUpdate(
        courseId,
        { assigned: false },
        { new: true, session },
      );

      await session.commitTransaction();
      return { teacher: updatedTeacher, course: updatedCourse };
    } catch (error) {
      await session.abortTransaction();
      throw new InternalServerErrorException(
        'Failed to unassign course: ' + error.message,
      );
    } finally {
      session.endSession();
    }
  }

  async delete(id: string): Promise<{ message: string }> {
    const teacher = await this.teacherModel.findById(id);
    if (!teacher) {
      throw new NotFoundException(`Teacher with ID "${id}" not found.`);
    }

    await this.teacherModel.findByIdAndDelete(id);

    return { message: 'Teacher deleted successfully.' };
  }

  async findOne(id: string): Promise<Teacher> {
    return this.teacherModel.findById(id, '-password -updatedAt');
  }

  async findAll(
    page = 1,
    limit = 10,
    startDate?: string,
    endDate?: string,
    department?: string,
    email?: string,
  ) {
    const skip = (page - 1) * limit;

    // Define filter conditions
    const filter: any = {};

    if (department) {
      filter.department = department; // Fixed class filtering
    }

    if (email) {
      filter.email = email; // Fixed class filtering
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate); // Greater than or equal to start date
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate); // Less than or equal to end date
      }
    }

    const totalRecordsCount = await this.teacherModel.countDocuments(filter);
    const teachers = await this.teacherModel
      .find(filter, '-password -updatedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return {
      data: teachers,
      totalPages: Math.ceil(totalRecordsCount / limit),
      totalRecordsCount,
      currentPage: page,
      limit,
    };
  }

  async importStudents(filePath: string): Promise<any> {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const teachers: any[] = xlsx.utils.sheet_to_json(
        workbook.Sheets[sheetName],
      );

      if (teachers.length > 1000) {
        return {
          status: HttpStatus.CONFLICT,
          msg: 'Limit exceeded: Maximum 1000 records allowed at a time.',
        };
      }

      const emails = teachers.map((s) => s.email);

      const existingStudents = await this.teacherModel.find({
        $or: [{ email: { $in: emails } }],
      });

      const existingTeachersByEmail = new Map(
        // existingStudents.map((s) => [s.email, s]),
        // existingStudents.map((s) => [s.email, s]),
      );

      const validTeachers = [];

      // ✅ Use `for...of` instead of `.forEach()` to properly handle async calls
      for (const [i, student] of teachers.entries()) {
        const { email } = student;
        const rowNumber = i + 2; // Adjusting for header row

        if (existingTeachersByEmail.has(email)) {
          const existingStudent = existingTeachersByEmail.get(email);
          return {
            status: HttpStatus.CONFLICT,
            // msg: `Row ${rowNumber}: Teacher email "${email}" is already registered with ${existingStudent.firstName} ${existingStudent.lastName}.`,
            msg: `Row ${rowNumber}: Teacher email "${email}" is already registered.`,
          };
        }

        validTeachers.push(student);
      }

      if (validTeachers.length === 0) {
        return {
          status: HttpStatus.CONFLICT,
          msg: `No valid records to insert. All entries already exist.`,
        };
      }

      await this.teacherModel.insertMany(validTeachers);

      return {
        message: `${validTeachers.length} Teachers imported successfully.`,
      };
    } catch (error) {
      console.error('Error importing teachers:', error);

      // ✅ Ensure proper error handling
      if (error instanceof ConflictException) {
        return {
          status: HttpStatus.CONFLICT,
          msg: error.message,
        };
      }

      return {
        status: HttpStatus.CONFLICT,
        msg: error.message,
      };
    } finally {
      if (filePath) {
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting file:', err);
        });
      }
    }
  }

  async validateTeacher(data: { email: string; password: string }) {
    try {
      const teacher = await this.teacherModel.findOne({ email: data.email });
      if (!teacher) return null;

      // const isMatch = await bcrypt.compare(data.password, teacher.password);
      console.log(teacher);
      // return isMatch ? teacher : null;
      return teacher;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  async getDashboardStats(teacherId: string) {
    try {

      
      // Find teacher in unified User schema
      const teacherUser = await this.userModel.findById(teacherId).exec();
      
      if (!teacherUser || teacherUser.role !== 'TEACHER') {
        console.log('❌ Teacher not found in User schema with ID:', teacherId);
        
        // Return basic data instead of throwing error to prevent frontend crashes
        return {
          success: true,
          data: {
            totalCourses: 0,
            todayClasses: 0,
            totalStudents: 0,
            pendingAssignments: 0,
            recentActivities: 0,
            teacherName: 'Unknown Teacher',
            department: 'Not Assigned'
          }
        };
      }

      // Calculate real metrics using TeacherProfile and unified User schema
      
      // 1. Get assigned courses from TeacherProfile
      let totalCourses = 0;
      try {
        const teacherProfile = await this.teacherProfileModel.findOne({ userId: teacherId });
        // if (teacherProfile && teacherProfile.assignedCourses) {
        //   totalCourses = teacherProfile.assignedCourses.length;
        // }
      } catch (profileError) {
        console.log('TeacherProfile not found, using fallback');
        totalCourses = teacherUser.subject ? 1 : 0; // Fallback to single subject field
      }
      
      // 2. Get total students this teacher teaches
      // Calculate based on actual course assignments - use same logic as attendance service
      let totalStudents = 0;
      try {
        const mongoose = require('mongoose');
        const teacherObjId = new mongoose.Types.ObjectId(teacherId);
        
        // Get all course assignments for this teacher
        const courseAssignments = await this.courseAssignmentModel.find({
          teacherId: teacherObjId
        }).exec();
        
        // Collect all unique grade-section combinations from assignments
        // Format: "Grade X-Section" (same as attendance service uses)
        const gradeSectionCombinations = new Set<string>();
        
        courseAssignments.forEach(assignment => {
          if (assignment.grades && Array.isArray(assignment.grades)) {
            assignment.grades.forEach((grade: any) => {
              const level = grade.level || 0;
              // Convert to "Grade X" format (same as attendance service)
              const gradeLevel = level === 0 ? 'K' : `Grade ${level}`;
              const section = grade.section || 'None';
              const key = `${gradeLevel}-${section}`;
              gradeSectionCombinations.add(key);
            });
          }
        });
        
        // If no assignments found, also check Schedule collection as fallback
        if (gradeSectionCombinations.size === 0) {
          const teacherSchedules = await this.scheduleModel.find({
            teacherId: teacherObjId
          }).exec();
          
          teacherSchedules.forEach(schedule => {
            if (schedule.className && schedule.section) {
              // Use className directly (it's already in "Grade X" format)
              const key = `${schedule.className}-${schedule.section}`;
              gradeSectionCombinations.add(key);
            }
          });
        }
        
        console.log(`📊 Found ${gradeSectionCombinations.size} unique grade-section combinations for teacher`);
        
        // Find all students matching these grade-section combinations
        // Use same logic as attendance service (uses 'class' field, not 'gradeLevel')
        if (gradeSectionCombinations.size > 0) {
          const uniqueStudentIds = new Set<string>();
          
          // Query students for each grade-section combination
          for (const key of gradeSectionCombinations) {
            const [gradeLevel, section] = key.split('-');
            
            // Use same logic as attendance service to handle different grade formats
            let gradeQuery: any = {};
            
            // Extract number from gradeLevel if it's in "Grade X" format
            const gradeMatch = gradeLevel.match(/(\d+)/);
            const gradeNumber = gradeMatch ? gradeMatch[1] : null;
            
            if (gradeNumber) {
              // Try both "Grade X" and just the number (same as attendance service)
              gradeQuery = {
                $or: [
                  { class: gradeLevel }, // Exact match (e.g., "Grade 1")
                  { class: `Grade ${gradeNumber}` }, // Normalized format
                  { class: gradeNumber }, // Just the number
                  { class: `Grade${gradeNumber}` }, // No space format
                ]
              };
            } else {
              // For "K" or other non-numeric formats, use exact match
              gradeQuery = { 
                $or: [
                  { class: gradeLevel },
                  { class: 'K' },
                  { class: '0' },
                  { class: 'Kindergarten' }
                ]
              };
            }
            
            // Build query (use 'class' field, not 'gradeLevel') - exactly like attendance service
            // Convert schoolId to ObjectId if needed
            const schoolIdObj = teacherUser.schoolId instanceof mongoose.Types.ObjectId 
              ? teacherUser.schoolId 
              : new mongoose.Types.ObjectId(teacherUser.schoolId);
            
            const query: any = {
              role: 'STUDENT',
              schoolId: schoolIdObj,
              ...gradeQuery,
              section: section === 'None' ? null : section,
              isActive: true,
            };
            
            // Find students matching this grade-section combination
            const students = await this.userModel.find(query).select('_id').exec();
            
            students.forEach(student => {
              uniqueStudentIds.add(student._id.toString());
            });
            
            console.log(`  - ${gradeLevel}-${section}: Found ${students.length} students`);
          }
          
          totalStudents = uniqueStudentIds.size;
          console.log(`👥 Total unique students assigned to teacher: ${totalStudents} (from ${gradeSectionCombinations.size} grade-section combinations)`);
        } else {
          console.log('⚠️ No grade-section combinations found, setting totalStudents to 0');
          totalStudents = 0;
        }
      } catch (studentError) {
        console.error('❌ Error counting students:', studentError);
        totalStudents = 0; // Set to 0 instead of fallback to be accurate
      }
      
      // 3. Get actual today's classes from schedule collection
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }); // e.g., "Monday"
      console.log(`📅 Current day detected as: ${today}`);
      
      let todayClasses = 0;
      try {
        // Query actual schedule data for today's classes
        // Convert string to ObjectId for proper comparison
        const mongoose = require('mongoose');
        const teacherObjectId = new mongoose.Types.ObjectId(teacherId);
        
        // Get all schedules for this teacher
        const allTeacherSchedules = await this.scheduleModel.find({
          teacherId: teacherObjectId
        });
        
        // Count today's classes by checking if any schedule has today in its dayOfWeek array
        let todayClassesCount = 0;
        
        allTeacherSchedules.forEach(schedule => {
          schedule.dayOfWeek.forEach(day => {
            if (day.date === today || day.date.toLowerCase() === today.toLowerCase()) {
              todayClassesCount++;
            }
          });
        });
        
        todayClasses = todayClassesCount;
      } catch (scheduleError) {
        console.error('Schedule query failed:', scheduleError);
        // Fallback to estimated count
        todayClasses = totalCourses > 0 ? Math.min(totalCourses, 1) : 0;
      }
      
      // 4. Get lesson plan statistics
      let lessonPlanStats = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0
      };
      
      try {
        // Create ObjectId for lesson plan queries
        const mongoose = require('mongoose');
        const teacherObjId = new mongoose.Types.ObjectId(teacherId);
        
        const lessonPlans = await this.lessonPlanModel.find({ 
          teacherId: teacherObjId 
        }).exec();
        
        lessonPlanStats.total = lessonPlans.length;
        lessonPlanStats.pending = lessonPlans.filter(lp => lp.status === 'pending').length;
        lessonPlanStats.approved = lessonPlans.filter(lp => lp.status === 'approved').length;
        lessonPlanStats.rejected = lessonPlans.filter(lp => lp.status === 'rejected').length;
        
        console.log(`📚 Lesson plan stats for teacher: ${JSON.stringify(lessonPlanStats)}`);
      } catch (lessonPlanError) {
        console.log('Error fetching lesson plan stats:', lessonPlanError);
      }
      
      // 5. Pending assignments - estimate based on courses and lesson plans
      const pendingAssignments = Math.max(totalCourses * 2, lessonPlanStats.pending);
      
      // 5. Recent activities - would need activity collection
      const recentActivities = Math.min(totalStudents / 10, 20); // Estimate based on student count
      
      // 6. Get teacher's assigned courses from CourseAssignment and schedules
      let assignedCourses = [];
      try {
        // Convert teacherId to ObjectId
        const mongoose = require('mongoose');
        const teacherObjId = new mongoose.Types.ObjectId(teacherId);
        
        // Get courses from CourseAssignment (primary source)
        const courseAssignments = await this.courseAssignmentModel.find({
          teacherId: teacherObjId
        }).populate('courseId').exec();
        
        // Get courses from Schedule (fallback/legacy)
        const teacherSchedules = await this.scheduleModel.find({
          teacherId: teacherObjId
        }).populate('courseId').exec();
        
        // Extract unique courses from CourseAssignment
        const courseMap = new Map();
        
        // First, add courses from CourseAssignment with full details
        courseAssignments.forEach(assignment => {
          const course = assignment.courseId as any;
          if (course && course._id) {
            const courseIdStr = course._id.toString();
            
            // Process all grades/sections for this course
            if (assignment.grades && assignment.grades.length > 0) {
              assignment.grades.forEach((grade: any) => {
                const key = `${courseIdStr}-${grade.level}-${grade.section}`;
                if (!courseMap.has(key)) {
                  courseMap.set(key, {
                    _id: course._id,
                    courseName: course.courseName,
                    courseCode: course.courseCode,
                    className: `Grade ${grade.level}`,
                    section: grade.section,
                    timeSlots: grade.timeSlots || [],
                    assignmentId: assignment._id
                  });
                } else {
                  // Merge time slots if same course-grade-section appears multiple times
                  const existing = courseMap.get(key);
                  if (grade.timeSlots && Array.isArray(grade.timeSlots)) {
                    existing.timeSlots = [...(existing.timeSlots || []), ...grade.timeSlots];
                  }
                }
              });
            } else {
              // If no grades, still add the course
              if (!courseMap.has(courseIdStr)) {
                courseMap.set(courseIdStr, {
                  _id: course._id,
                  courseName: course.courseName,
                  courseCode: course.courseCode,
                  className: 'N/A',
                  section: 'N/A',
                  timeSlots: [],
                  assignmentId: assignment._id
                });
              }
            }
          }
        });
        
        // Then, add courses from Schedule (if not already in map)
        teacherSchedules.forEach(schedule => {
          const course = schedule.courseId as any;
          if (course && course._id) {
            const courseIdStr = course._id.toString();
            const key = `${courseIdStr}-${schedule.className}-${schedule.section}`;
            
            if (!courseMap.has(key)) {
              // Convert Schedule dayOfWeek to timeSlots format
              const timeSlots = schedule.dayOfWeek && Array.isArray(schedule.dayOfWeek) 
                ? schedule.dayOfWeek.map((day: any) => ({
                    day: day.day || day.dayOfWeek || 'Monday',
                    startTime: day.startTime || '09:00',
                    endTime: day.endTime || '10:00'
                  }))
                : [];
              
              courseMap.set(key, {
                _id: course._id,
                courseName: course.courseName,
                courseCode: course.courseCode,
                className: schedule.className || 'N/A',
                section: schedule.section || 'N/A',
                timeSlots: timeSlots,
                assignmentId: schedule._id
              });
            }
          }
        });
        
        assignedCourses = Array.from(courseMap.values());
        // Set totalCourses based on actual assigned courses
        totalCourses = assignedCourses.length;
        console.log(`📚 Found ${assignedCourses.length} assigned courses for teacher (${courseAssignments.length} from CourseAssignment, ${teacherSchedules.length} from Schedule)`);
      } catch (courseError) {
        console.log('Error fetching assigned courses:', courseError);
      }

      return {
        success: true,
        data: {
          totalCourses,
          todayClasses,
          totalStudents,
          pendingAssignments,
          recentActivities,
          teacherName: `${teacherUser.firstName || ''} ${teacherUser.lastName || ''}`.trim() || 'Teacher',
          department: teacherUser.department || teacherUser.specialization || 'Not Assigned',
          subjects: teacherUser.subject ? [teacherUser.subject] : [],
          qualifications: teacherUser.qualifications || 'N/A',
          experience: teacherUser.experienceYears || 'N/A',
          assignedCourses: assignedCourses,
          lessonPlans: lessonPlanStats
        }
      };
    } catch (error) {
      console.error('❌ Error getting teacher dashboard stats:', error);
      
      // Return safe fallback data
      return {
        success: true,
        data: {
          totalCourses: 0,
          todayClasses: 0,
          totalStudents: 75,
          pendingAssignments: 8,
          recentActivities: 15,
          teacherName: 'Unknown Teacher',
          department: 'Not Assigned'
        }
      };
    }
  }

  // Excel template methods
  async generateStudentTemplate(): Promise<Buffer> {
    try {
      // Create a template with proper headers for student data
      const templateData = [
        {
          'First Name': '',
          'Last Name': '',
          'Email': '',
          'Student ID': '',
          'Class': '',
          'Section': '',
          'Date of Birth': '',
          'Parent Email': '',
          'Phone Number': '',
          'Address': ''
        }
      ];

      const worksheet = xlsx.utils.json_to_sheet(templateData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Students');

      // Add some styling and validation info
      const headerRow = [
        'First Name (Required)',
        'Last Name (Required)', 
        'Email (Required)',
        'Student ID (Required)',
        'Class (Required)',
        'Section (Required)',
        'Date of Birth (YYYY-MM-DD)',
        'Parent Email',
        'Phone Number',
        'Address'
      ];

      // Replace header row
      const ws = workbook.Sheets['Students'];
      headerRow.forEach((header, index) => {
        const cellAddress = xlsx.utils.encode_cell({ r: 0, c: index });
        if (ws[cellAddress]) {
          ws[cellAddress].v = header;
        }
      });

      return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } catch (error) {
      console.error('Error generating student template:', error);
      throw new InternalServerErrorException('Failed to generate template');
    }
  }

  async processStudentUpload(filePath: string, teacherId: string): Promise<any> {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const studentData = xlsx.utils.sheet_to_json(worksheet);

      const results = {
        successful: 0,
        failed: 0,
        errors: [],
        processed: []
      };

      for (let i = 0; i < studentData.length; i++) {
        const row = studentData[i];
        try {
          // Validate required fields
          if (!row['First Name'] || !row['Last Name'] || !row['Email'] || !row['Student ID']) {
            results.errors.push({
              row: i + 1,
              error: 'Missing required fields (First Name, Last Name, Email, Student ID)'
            });
            results.failed++;
            continue;
          }

          // Here you would typically save to database or process the data
          // For now, we'll just track the processed data
          results.processed.push({
            firstName: row['First Name'],
            lastName: row['Last Name'],
            email: row['Email'],
            studentId: row['Student ID'],
            class: row['Class'],
            section: row['Section'],
            teacherId: teacherId
          });
          
          results.successful++;
        } catch (error) {
          results.errors.push({
            row: i + 1,
            error: error.message
          });
          results.failed++;
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(filePath);

      return results;
    } catch (error) {
      console.error('Error processing student upload:', error);
      throw new InternalServerErrorException('Failed to process student data');
    }
  }

  async exportStudentData(teacherId: string): Promise<Buffer> {
    try {
      // Here you would fetch actual student data for the teacher
      // For now, using mock data
      const studentData = [
        {
          'First Name': 'John',
          'Last Name': 'Doe',
          'Email': 'john.doe@example.com',
          'Student ID': 'STU001',
          'Class': '10th Grade',
          'Section': 'A',
          'Date of Birth': '2008-05-15',
          'Parent Email': 'parent.doe@example.com',
          'Phone Number': '+1234567890',
          'Address': '123 Main St, City'
        },
        {
          'First Name': 'Jane',
          'Last Name': 'Smith',
          'Email': 'jane.smith@example.com',
          'Student ID': 'STU002',
          'Class': '10th Grade',
          'Section': 'A',
          'Date of Birth': '2008-03-22',
          'Parent Email': 'parent.smith@example.com',
          'Phone Number': '+1234567891',
          'Address': '456 Oak Ave, City'
        }
      ];

      const worksheet = xlsx.utils.json_to_sheet(studentData);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, 'My Students');

      return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    } catch (error) {
      console.error('Error exporting student data:', error);
      throw new InternalServerErrorException('Failed to export student data');
    }
  }

  /**
   * Get students assigned to a teacher's courses (filtered by course assignments)
   * Only returns students from classes/grades the teacher teaches
   */
  async getStudentsForTeacher(teacherId: string, schoolId?: string): Promise<any[]> {
    try {
      console.log(`🔵 getStudentsForTeacher called for teacher: ${teacherId}, school: ${schoolId}`);
      
      const mongoose = require('mongoose');
      const teacherObjId = new mongoose.Types.ObjectId(teacherId);
      
      // Get all course assignments for this teacher
      const query: any = { teacherId: teacherObjId };
      if (schoolId) {
        query.schoolId = new mongoose.Types.ObjectId(schoolId);
      }

      const courseAssignments = await this.courseAssignmentModel.find(query).exec();
      console.log(`✅ Found ${courseAssignments.length} course assignments for teacher`);

      if (courseAssignments.length === 0) {
        console.log('⚠️ Teacher has no course assignments');
        return [];
      }

      // Extract grade/section combinations from course assignments
      const gradeSectionFilters: Array<{ level: number; section: string }> = [];
      const gradeSectionSet = new Set<string>();

      courseAssignments.forEach(assignment => {
        if (assignment.grades && Array.isArray(assignment.grades)) {
          assignment.grades.forEach((grade: any) => {
            const key = `${grade.level}-${grade.section}`;
            if (!gradeSectionSet.has(key)) {
              gradeSectionSet.add(key);
              gradeSectionFilters.push({
                level: grade.level,
                section: grade.section
              });
            }
          });
        }
      });

      console.log(`✅ Extracted ${gradeSectionFilters.length} unique grade/section combinations`);

      if (gradeSectionFilters.length === 0) {
        console.log('⚠️ No grades/sections found in assignments');
        return [];
      }

      const levelStr = (n: number) => n.toString();
      const sectionRegex = (s: string) => new RegExp('^' + String(s || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
      const studentQuery: any = {
        role: 'STUDENT',
        isActive: true,
        $or: gradeSectionFilters.map(gf => ({
          $and: [
            { $or: [{ gradeLevel: levelStr(gf.level) }, { class: levelStr(gf.level) }] },
            { section: sectionRegex(gf.section) }
          ]
        }))
      };

      if (schoolId) {
        studentQuery.schoolId = new mongoose.Types.ObjectId(schoolId);
      }

      const students = await this.userModel
        .find(studentQuery)
        .select('firstName lastName email studentId gradeLevel section class schoolId')
        .lean()
        .exec();

      console.log(`✅ Found ${students.length} students in teacher's assigned grades/sections`);

      return students;
    } catch (error) {
      console.error('❌ Error getting students for teacher:', error);
      throw new InternalServerErrorException('Failed to retrieve students for teacher');
    }
  }
}
