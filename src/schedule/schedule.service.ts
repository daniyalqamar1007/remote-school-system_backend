import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Schedule, ScheduleDocument } from './schema/schedule.schema';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { StudentProfile, StudentProfileDocument } from '../auth/schemas/student-profile.schema';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { CourseAssignment, CourseAssignmentDocument } from '../course/schema/course-assignment.schema';
import * as moment from 'moment';

@Injectable()
export class ScheduleService {
  constructor(
    @InjectModel(Schedule.name) private scheduleModel: Model<ScheduleDocument>,
    @InjectModel(StudentProfile.name) private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CourseAssignment.name) private courseAssignmentModel: Model<CourseAssignmentDocument>,
  ) {}

  private isTimeOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string,
  ): boolean {
    const format = (time: string) => {
      const [timeStr, modifier] = time.split(' ');
      let [hours, minutes] = timeStr.split(':').map(Number);
      if (modifier === 'PM' && hours !== 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    };

    const s1 = format(start1);
    const e1 = format(end1);
    const s2 = format(start2);
    const e2 = format(end2);

    return s1 < e2 && s2 < e1;
  }

  async create(
    createScheduleDto: CreateScheduleDto,
    schoolId?: string,
    createdBy?: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { teacherId, courseId, className, section, dayOfWeek } =
        createScheduleDto;

      for (let i = 0; i < dayOfWeek.length; i++) {
        for (let j = i + 1; j < dayOfWeek.length; j++) {
          if (dayOfWeek[i].date === dayOfWeek[j].date) {
            if (this.isTimeOverlap(
              dayOfWeek[i].startTime,
              dayOfWeek[i].endTime,
              dayOfWeek[j].startTime,
              dayOfWeek[j].endTime,
            )) {
              return {
                success: false,
                message: `Overlapping slots on ${dayOfWeek[i].date}: ${dayOfWeek[i].startTime}-${dayOfWeek[i].endTime} conflicts with ${dayOfWeek[j].startTime}-${dayOfWeek[j].endTime}`,
              };
            }
          }
        }
      }

      // Check for teacher conflicts
      for (const newDay of dayOfWeek) {
        const existingTeacherSchedules = await this.scheduleModel.find({
          teacherId,
          'dayOfWeek.date': newDay.date,
        });

        for (const schedule of existingTeacherSchedules) {
          for (const existingDay of schedule.dayOfWeek) {
            if (existingDay.date === newDay.date) {
              if (
                this.isTimeOverlap(
                  existingDay.startTime,
                  existingDay.endTime,
                  newDay.startTime,
                  newDay.endTime,
                )
              ) {
                return {
                  success: false,
                  message: `Teacher conflict: Teacher already has a class on ${newDay.date} between ${existingDay.startTime} and ${existingDay.endTime}`,
                };
              }
            }
          }
        }
      }

      // Check for classroom conflicts (same class and section at same time)
      for (const newDay of dayOfWeek) {
        const existingClassSchedules = await this.scheduleModel.find({
          className,
          section,
          'dayOfWeek.date': newDay.date,
        });

        for (const schedule of existingClassSchedules) {
          for (const existingDay of schedule.dayOfWeek) {
            if (existingDay.date === newDay.date) {
              if (
                this.isTimeOverlap(
                  existingDay.startTime,
                  existingDay.endTime,
                  newDay.startTime,
                  newDay.endTime,
                )
              ) {
                return {
                  success: false,
                  message: `Classroom conflict: Class ${className}-${section} already has a schedule on ${newDay.date} between ${existingDay.startTime} and ${existingDay.endTime}`,
                };
              }
            }
          }
        }
      }

      // Check for course conflicts (same course shouldn't be scheduled at same time)
      for (const newDay of dayOfWeek) {
        const existingCourseSchedules = await this.scheduleModel.find({
          courseId,
          'dayOfWeek.date': newDay.date,
        });

        for (const schedule of existingCourseSchedules) {
          for (const existingDay of schedule.dayOfWeek) {
            if (existingDay.date === newDay.date) {
              if (
                this.isTimeOverlap(
                  existingDay.startTime,
                  existingDay.endTime,
                  newDay.startTime,
                  newDay.endTime,
                )
              ) {
                return {
                  success: false,
                  message: `Course conflict: This course already has a schedule on ${newDay.date} between ${existingDay.startTime} and ${existingDay.endTime}`,
                };
              }
            }
          }
        }
      }

      // Check if teacher is scheduled for multiple classes at same time in different locations
      // (Assuming you might add classroom/location field later)

      // Check for minimum gap between classes (optional)
      // const MINIMUM_GAP_MINUTES = 15; // Example: 15 minutes between classes
      // You could add this as an additional check in the time overlap function

      // Add schoolId and createdBy to the schedule data
      const mongoose = require('mongoose');
      const scheduleData = {
        ...createScheduleDto,
        ...(schoolId && { schoolId: new mongoose.Types.ObjectId(schoolId) }),
        ...(createdBy && { createdBy: new mongoose.Types.ObjectId(createdBy) }),
      };
      
      const newSchedule = new this.scheduleModel(scheduleData);
      await newSchedule.save();

      return {
        success: true,
        message: 'Schedule created successfully.',
      };
    } catch (error) {
      console.error('Error creating schedule:', error);
      return {
        success: false,
        message: 'An error occurred while creating the schedule.',
      };
    }
  }
  async findAll(
    page: number,
    limit: number,
    className: string,
    section: string,
    email: string,
    teacherId?: string,
    date?: string,
    courseId?: boolean,
    schoolId?: string,
  ): Promise<{ data: Schedule[]; total: number }> {
    const skip = (page - 1) * limit;
    const filter: any = {};

    if (className) filter.className = className;
    if (section) filter.section = section;
    if (email) filter.email = email;
    if (teacherId) {
      const mongoose = require('mongoose');
      filter.teacherId = new mongoose.Types.ObjectId(teacherId);
    }
    if (schoolId) {
      const mongoose = require('mongoose');
      filter.schoolId = new mongoose.Types.ObjectId(schoolId);
    }

    if (date) {
      let dayToMatch: string | null = null;

      if (date === 'today') {
        dayToMatch = moment().format('dddd'); // e.g., "Monday"
      } else if (date === 'tomorrow') {
        dayToMatch = moment().add(1, 'day').format('dddd');
      } else if (date === 'yesterday') {
        dayToMatch = moment().subtract(1, 'day').format('dddd');
      }

      if (dayToMatch) {
        filter['dayOfWeek.date'] = dayToMatch;
      }
    }
    const total = await this.scheduleModel.countDocuments(filter);
    let data;

    if (courseId) {
      data = await this.scheduleModel
        .find(filter)
        .populate('courseId')
        .sort({ createdAt: -1 })
        .exec();
    } else {
      data = await this.scheduleModel
        .find(filter)
        .populate('teacherId')
        .populate('courseId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec();
    }

    return { data, total };
  }

  async findOne(id: string): Promise<Schedule> {
    const schedule = await this.scheduleModel
      .findById(id)
      .populate('teacherId')
      .populate('couseId')
      .exec();
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }
    return schedule;
  }

  formatTime(time24: string): string {
    // If already in 12-hour format (has AM/PM), return as is
    if (time24.includes('AM') || time24.includes('PM') || time24.includes('am') || time24.includes('pm')) {
      return time24;
    }

    // Convert 24-hour format (HH:MM) to 12-hour format (HH:MM AM/PM)
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  capitalizeFirstLetter(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  async findFullScheduleByStudentId(studentId: string) {
    // Try unified auth system first (StudentProfile)
    let studentInfo = null;
    
    try {
      const studentProfile = await this.studentProfileModel.findById(studentId).exec();
      if (studentProfile) {
        console.log('✅ Found student in StudentProfile:', studentProfile.firstName, studentProfile.lastName);
        studentInfo = {
          class: studentProfile.gradeLevel,
          section: studentProfile.section || 'A' // Default section if not specified
        };
      }
    } catch (error) {
      console.log('❌ Error finding StudentProfile, trying old Student schema:', error.message);
    }
    
    // Fall back to User model (unified model) if not found in StudentProfile
    if (!studentInfo) {
      try {
        const student = await this.userModel.findOne({
          _id: new Types.ObjectId(studentId),
          role: UserRole.STUDENT
        }).lean();
        if (student) {
          console.log('✅ Found student in User model:', student.firstName, student.lastName);
          studentInfo = {
            class: (student as any).class || '',
            section: (student as any).section || 'A' // Default section if not specified
          };
        }
      } catch (error) {
        console.log('❌ Error finding student in User model:', error.message);
      }
    }
    
    if (!studentInfo) {
      console.log('❌ Student not found in any schema, returning empty schedule');
      return [];
    }
  
    const filter: any = {
      className: studentInfo.class,
      section: this.capitalizeFirstLetter(studentInfo.section),
    };
  
    // Get ALL schedules for this class/section
    const schedules = await this.scheduleModel
      .find(filter)
      .populate('teacherId')
      .populate('courseId')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  
    return schedules;
  }

  /**
 * Returns the full week's schedule for a student (class/section).
 * Each item: { courseName, teacherName, dayOfWeek, startTime, endTime }
 */
async getWeekScheduleForStudent(studentId: string) {
  // Try to find student info from multiple sources
  let studentInfo = null;
  
  // Try StudentProfile first
  try {
    const studentProfile = await this.studentProfileModel.findById(studentId).exec();
    if (studentProfile) {
      console.log('✅ Found student in StudentProfile:', studentProfile.firstName, studentProfile.lastName);
      studentInfo = {
        class: studentProfile.gradeLevel,
        section: studentProfile.section || 'A'
      };
    }
  } catch (error) {
    console.log('❌ Error finding StudentProfile, trying User schema:', error.message);
  }
  
  // Try User schema (studentId might be a User ID)
  if (!studentInfo) {
    try {
      const user = await this.userModel.findById(studentId).exec();
      if (user && user.studentProfileId) {
        const studentProfile = await this.studentProfileModel.findById(user.studentProfileId).exec();
        if (studentProfile) {
          console.log('✅ Found student via User.studentProfileId:', studentProfile.firstName, studentProfile.lastName);
          studentInfo = {
            class: studentProfile.gradeLevel,
            section: studentProfile.section || 'A'
          };
        }
      }
      // Also check if user has class/section directly (old schema)
      if (!studentInfo && (user?.class || user?.gradeLevel)) {
        console.log('✅ Found student info in User schema');
        studentInfo = {
          class: user.class || user.gradeLevel,
          section: user.section || 'A'
        };
      }
    } catch (error) {
      console.log('❌ Error finding User:', error.message);
    }
  }
  
  // Fall back to User model (unified model) if not found in StudentProfile
  if (!studentInfo) {
    try {
      const student = await this.userModel.findOne({
        _id: new Types.ObjectId(studentId),
        role: UserRole.STUDENT
      }).lean();
      if (student) {
        console.log('✅ Found student in User model:', student.firstName, student.lastName);
        studentInfo = {
          class: (student as any).class || (student as any).gradeLevel || '',
          section: (student as any).section || 'A'
        };
      }
    } catch (error) {
      console.log('❌ Error finding student in User model:', error.message);
    }
  }
  
  if (!studentInfo) {
    console.log('❌ Student not found in any schema for ID:', studentId);
    throw new NotFoundException('Student not found');
  }

  const weekSchedule: Array<{
    courseName: string;
    teacherName: string;
    day: string;
    startTime: string;
    endTime: string;
    note?: string;
  }> = [];

  // 1. Fetch from Schedule collection (old schedule system)
  const schedules = await this.scheduleModel
    .find({
      className: studentInfo.class,
      section: this.capitalizeFirstLetter(studentInfo.section),
    })
    .populate('courseId')
    .populate('teacherId')
    .lean();

  for (const sched of schedules) {
    const courseName = sched.courseId?.courseName || 'N/A';
    const teacher = sched.teacherId as any;
    const teacherName = teacher && teacher.firstName
      ? `${teacher.firstName} ${teacher.lastName}`
      : 'N/A';
    if (sched.dayOfWeek && Array.isArray(sched.dayOfWeek)) {
      for (const day of sched.dayOfWeek) {
        weekSchedule.push({
          courseName,
          teacherName,
          day: day.date,
          startTime: day.startTime,
          endTime: day.endTime,
          note: sched.note,
        });
      }
    }
  }

  // 2. Fetch from CourseAssignment collection (new course assignment system)
  // Convert class/gradeLevel to grade level number
  // Student's class can be: "Grade 1", "Grade 2", "1", "2", etc.
  let gradeLevel: number;
  const classStr = String(studentInfo.class || '');
  
  // Extract number from "Grade 1", "Grade 2", or just "1", "2"
  const gradeMatch = classStr.match(/\d+/);
  if (gradeMatch) {
    gradeLevel = parseInt(gradeMatch[0]);
  } else {
    // Try to parse directly if it's already a number
    gradeLevel = parseInt(classStr) || 1;
  }

  // Normalize section to uppercase for comparison (A, B, C, etc.)
  let studentSection = String(studentInfo.section || 'A').trim().toUpperCase();
  if (studentSection.length === 0) {
    studentSection = 'A';
  }

  console.log(`🔍 Looking for CourseAssignments: Grade Level=${gradeLevel}, Section=${studentSection}`);
  console.log(`📝 Student Info: class="${studentInfo.class}", section="${studentInfo.section}"`);

  // Get student's schoolId if available (from user or studentProfile)
  let schoolId: string | null = null;
  try {
    const user = await this.userModel.findById(studentId).exec();
    if (user?.schoolId) {
      schoolId = user.schoolId.toString();
    } else {
      const studentProfile = await this.studentProfileModel.findById(studentId).exec();
      if (studentProfile?.schoolId) {
        schoolId = studentProfile.schoolId.toString();
      }
    }
  } catch (error) {
    console.log('⚠️ Could not fetch schoolId, will search all schools');
  }

  // Build query - filter by schoolId if available
  const query: any = {};
  if (schoolId) {
    query.schoolId = new Types.ObjectId(schoolId);
    console.log(`🏫 Filtering by schoolId: ${schoolId}`);
  }

  const courseAssignments = await this.courseAssignmentModel
    .find(query)
    .populate('courseId', 'courseName courseCode')
    .populate('teacherId', 'firstName lastName')
    .lean()
    .exec();

  console.log(`📚 Found ${courseAssignments.length} course assignments${schoolId ? ` for school ${schoolId}` : ' (all schools)'}`);

  for (const assignment of courseAssignments) {
    if (!assignment.courseId || !assignment.teacherId) {
      console.log('⚠️ Skipping assignment - missing courseId or teacherId');
      continue;
    }

    // Check each grade object in the grades array
    if (assignment.grades && Array.isArray(assignment.grades)) {
      for (const grade of assignment.grades) {
        // Normalize section from assignment (could be "A", "a", "B", etc.)
        const assignmentSection = String(grade.section || '').trim().toUpperCase();
        
        // Check if level matches AND section matches (case-insensitive)
        const levelMatches = grade.level === gradeLevel;
        const sectionMatches = assignmentSection === studentSection;
        
        console.log(`  📋 Checking: level=${grade.level} (need ${gradeLevel}), section="${assignmentSection}" (need "${studentSection}") - ${levelMatches && sectionMatches ? '✅ MATCH' : '❌'}`);
        
        if (levelMatches && sectionMatches) {
          const course = assignment.courseId as any;
          const courseName = course?.courseName || 'N/A';
          const courseCode = course?.courseCode || '';
          const teacher = assignment.teacherId as any;
          const teacherName = teacher && teacher.firstName
            ? `${teacher.firstName} ${teacher.lastName}`
            : 'N/A';

          console.log(`  ✅ Match found! Course: ${courseName}, Teacher: ${teacherName}`);

          // Add all time slots for this course
          if (grade.timeSlots && Array.isArray(grade.timeSlots)) {
            console.log(`  📅 Found ${grade.timeSlots.length} time slots`);
            for (const timeSlot of grade.timeSlots) {
              if (timeSlot.day && timeSlot.startTime && timeSlot.endTime) {
                // Convert 24-hour format to 12-hour format if needed
                const startTime = this.formatTime(timeSlot.startTime);
                const endTime = this.formatTime(timeSlot.endTime);

                console.log(`    ➕ Adding: ${timeSlot.day} ${startTime}-${endTime}`);

                weekSchedule.push({
                  courseName,
                  teacherName,
                  day: timeSlot.day,
                  startTime,
                  endTime,
                });
              }
            }
          } else {
            console.log(`  ⚠️ No time slots found for this grade`);
          }
        }
      }
    } else {
      console.log('⚠️ Assignment has no grades array');
    }
  }

  console.log(`✅ Total schedule items found: ${weekSchedule.length}`);

  // Sort by day (Monday-Sunday), then startTime
  const dayOrder = [
    'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'
  ];
  weekSchedule.sort(
    (a, b) =>
      dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day) ||
      a.startTime.localeCompare(b.startTime)
  );

  return weekSchedule;
}
  async findSchedulesByStudentIdAndDate(
    studentId: string,
    date: string,
  ): Promise<Schedule[]> {
    // Try unified auth system first (User with STUDENT role)
    let studentInfo = null;
    
    try {
      const user = await this.userModel.findOne({ 
        _id: studentId, 
        role: 'STUDENT' 
      }).exec();
      
      if (user) {
        console.log('✅ Found student in User schema:', user.firstName, user.lastName);
        studentInfo = {
          class: user.class || user.gradeLevel,
          section: user.section || 'A' // Default section if not specified
        };
      }
    } catch (error) {
      console.log('❌ Error finding User with STUDENT role:', error.message);
    }
    
    // Try StudentProfile if not found in User schema
    if (!studentInfo) {
      try {
        const studentProfile = await this.studentProfileModel.findById(studentId).exec();
        if (studentProfile) {
          console.log('✅ Found student in StudentProfile:', studentProfile.firstName, studentProfile.lastName);
          studentInfo = {
            class: studentProfile.gradeLevel,
            section: studentProfile.section || 'A' // Default section if not specified
          };
        }
      } catch (error) {
        console.log('❌ Error finding StudentProfile:', error.message);
      }
    }
    
    // Fall back to User model (unified model) if not found anywhere else
    if (!studentInfo) {
      try {
        const student = await this.userModel.findOne({
          _id: new Types.ObjectId(studentId),
          role: UserRole.STUDENT
        }).lean();
        if (student) {
          console.log('✅ Found student in User model:', student.firstName, student.lastName);
          studentInfo = {
            class: (student as any).class || '',
            section: (student as any).section || 'A' // Default section if not specified
          };
        }
      } catch (error) {
        console.log('❌ Error finding student in User model:', error.message);
      }
    }
    
    if (!studentInfo) {
      console.log('❌ Student not found in any schema, returning empty schedule');
      return [];
    }
  
    const filter: any = {
      className: studentInfo.class,
      section: this.capitalizeFirstLetter(studentInfo.section),
    };
  
    // Special: If date === "all", fetch all!
    if (date && date !== 'all') {
      let dayToMatch: string | null = null;
      if (date === 'today') dayToMatch = moment().format('dddd');
      else if (date === 'tomorrow') dayToMatch = moment().add(1, 'day').format('dddd');
      else if (date === 'yesterday') dayToMatch = moment().subtract(1, 'day').format('dddd');
      else dayToMatch = date; // full day name like "Monday"
  
      if (dayToMatch) {
        filter.dayOfWeek = { $elemMatch: { date: dayToMatch } };
      }
    }
    // else: don't filter by date, fetch all
  
    // Populate course and teacher
    return this.scheduleModel
      .find(filter)
      .populate('courseId')
      .populate('teacherId')
      .exec();
  }

  async getTotalStudentsAssignedToTeacher(id: string) {
    let totalStudents = 0;
    try {
      console.log('📊 Getting total students for teacher id:', id);
      
      // Convert string to ObjectId for proper comparison
      const mongoose = require('mongoose');
      const teacherObjectId = new mongoose.Types.ObjectId(id);
      
      const scheduleClasses = await this.scheduleModel
        .find({ teacherId: teacherObjectId })
        .exec();
      console.log('📊 Found schedule classes:', scheduleClasses.length);

      for (const room of scheduleClasses) {
        // Count students directly from User model (unified model)
        const count = await this.userModel.countDocuments({
          role: UserRole.STUDENT,
          class: room.className,
          section: room.section,
          isActive: true
        });
        totalStudents += count;
      }

      const filter: any = { teacherId: teacherObjectId };

      let dayToMatch: string | null = null;

      dayToMatch = moment().format('dddd'); // e.g., "Monday"

      if (dayToMatch) {
        filter['dayOfWeek.date'] = dayToMatch;
      }
      const todayClass = await this.scheduleModel.countDocuments(filter);
      console.log('📊 Today classes count:', todayClass);
      return {
        success: true,
        totalStudents,
        todayClasses: todayClass,
      };
    } catch (e) {
      console.log('📊 Error getting teacher stats:', e);
      return {
        success: false,
        totalStudents,
        todayClasses: 0,
      };
    }
  }

  async update(
    id: string,
    updateScheduleDto: UpdateScheduleDto,
  ): Promise<Schedule> {
    const dayOfWeek = updateScheduleDto.dayOfWeek;
    if (dayOfWeek && dayOfWeek.length > 0) {
      for (let i = 0; i < dayOfWeek.length; i++) {
        for (let j = i + 1; j < dayOfWeek.length; j++) {
          if (dayOfWeek[i].date === dayOfWeek[j].date) {
            if (this.isTimeOverlap(
              dayOfWeek[i].startTime,
              dayOfWeek[i].endTime,
              dayOfWeek[j].startTime,
              dayOfWeek[j].endTime,
            )) {
              throw new BadRequestException(`Overlapping slots on ${dayOfWeek[i].date}: ${dayOfWeek[i].startTime}-${dayOfWeek[i].endTime} conflicts with ${dayOfWeek[j].startTime}-${dayOfWeek[j].endTime}`);
            }
          }
        }
      }
    }
    const updatedSchedule = await this.scheduleModel
      .findByIdAndUpdate(id, updateScheduleDto, { new: true })
      .exec();
    if (!updatedSchedule) {
      throw new NotFoundException('Schedule not found');
    }
    return updatedSchedule;
  }

  async remove(id: string): Promise<Schedule> {
    const deletedSchedule = await this.scheduleModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedSchedule) {
      throw new NotFoundException('Schedule not found');
    }
    return deletedSchedule;
  }

  getDistributionRecommendation(dayOfWeek: any[]): any {
    return { ok: true, message: 'Distribution validated' };
  }
}
