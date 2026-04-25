import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Types, Connection, ClientSession } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Student } from './schema/student.schema';
import { User, UserRole } from '../auth/schemas/user.schema';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import * as XLSX from 'xlsx';
import { ResponseDto } from '../dto/response.dto';
import { Attendance } from '../attendance/schema/schema.attendance';
import { Course } from '../course/schema/course.schema';
import { Parent } from '../parent/schema/parent.schema';
import { Schedule } from '../schedule/schema/schedule.schema';
import { HealthRecord } from '../nurse/schema/health-record.schema';
import { UploadedFileType } from '../../utils/multer.config';
import { withOptionalTransaction } from '../utils/transaction-helper';

@Injectable()
export class StudentService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<Student>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Parent.name) private parentModel: Model<Parent>,
    @InjectModel(Attendance.name) private attendanceModel: Model<Attendance>,
    @InjectModel(Course.name) private courseModel: Model<Course>,
    @InjectModel(Schedule.name) private scheduleModel: Model<Schedule>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecord>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  calculateGraduationDate(enrollDate: string): string {
    const date = new Date(enrollDate);
    date.setFullYear(date.getFullYear() + 5);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async bulkUpload(file: UploadedFileType) {
    const workbook = XLSX.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    const BATCH_SIZE = 100;
    let insertedCount = 0;
    let skippedCount = 0;

    // Use transaction helper which gracefully falls back if transactions aren't supported
    return await withOptionalTransaction(async (session) => {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const result = await this.processBatch(batch, session);
        insertedCount += result.insertedCount;
        skippedCount += result.skippedCount;
      }
      return { insertedCount, skippedCount };
    }, this.connection);
  }

  private async processBatch(rows: any[], session: ClientSession | null) {
    let insertedCount = 0;
    let skippedCount = 0;

    const { validStudents, skipped } = await this.prepareStudentData(
      rows,
      session,
    );
    skippedCount += skipped;

    if (validStudents.length === 0) {
      return { insertedCount, skippedCount };
    }

    const studentsWithParents = [];
    for (const student of validStudents) {
      // parentId (or parentIds) must be present in the row
      if (!student.parents || !Array.isArray(student.parents) || student.parents.length === 0) {
        skippedCount++;
        continue;
      }
      // Ensure all parents exist
      let allParentsExist = true;
      for (const parentId of student.parents) {
        const query = this.parentModel.findById(parentId);
        const parent = session ? await query.session(session).exec() : await query.exec();
        if (!parent) {
          allParentsExist = false;
          break;
        }
      }
      if (!allParentsExist) {
        skippedCount++;
        continue;
      }
      studentsWithParents.push({
        ...student,
        parents: student.parentIds,
      });
    }

    const insertOptions = session ? { session } : {};
    await this.studentModel.insertMany(studentsWithParents, insertOptions);
    insertedCount += studentsWithParents.length;

    return { insertedCount, skippedCount };
  }

  private async prepareStudentData(rows: any[], session: ClientSession | null) {
    const validStudents: any[] = [];
    let skippedCount = 0;

    const studentEmails = rows.map((row) => row.email).filter(Boolean);

    // Check for existing students in the database
    const query = this.studentModel.find({ email: { $in: studentEmails } }, { email: 1 });
    const existingStudents = session 
      ? await query.session(session).lean().exec()
      : await query.lean().exec();

    const existingStudentEmails = new Set(existingStudents.map((s) => s.email));

    for (const row of rows) {
      // Skip if student email exists
      if (existingStudentEmails.has(row.email)) {
        skippedCount++;
        continue;
      }

      // Validate required fields
      if (
        !row.email ||
        !row.enrollDate ||
        !row.studentId ||
        !row.parentIds || // should be an array of parent _id(s)
        !Array.isArray(row.parentIds) ||
        row.parentIds.length === 0
      ) {
        skippedCount++;
        continue;
      }

      const studentDto = {
        studentId: row.studentId,
        firstName: row.firstName,
        lastName: row.lastName,
        class: row.Grade, // Mapping from Excel's "Grade" to schema's "class"
        section: row.Section,
        gender: row.Gender,
        dob: row.DOB,
        email: row.email,
        phone: row.phone,
        address: row.address,
        emergencyContact: row.emergencyContact,
        enrollDate: row.enrollDate,
        expectedGraduation: this.calculateGraduationDate(row.enrollDate),
        profilePhoto: 'N/A',
        transcripts: [],
        iipFlag: false,
        honorRolls: false,
        athletics: false,
        clubs: '',
        lunch: '',
        nationality: '',
        parents: row.parents,
      };

      validStudents.push(studentDto);
    }

    return { validStudents, skipped: skippedCount };
  }

  async findByStudentId(studentId: string): Promise<Student> {
    return this.studentModel.findOne({ studentId }).exec();
  }

  async create(createStudentDto: CreateStudentDto): Promise<Student | ResponseDto> {
    const {
      studentId,
      email,
      parents: parentIds,
      password,
      ...studentData
    } = createStudentDto;

    if (!parentIds || parentIds.length === 0) {
      return {
        status: HttpStatus.BAD_REQUEST,
        msg: `At least one parent must be provided for the student.`,
      };
    }
    for (const parentId of parentIds) {
      const parent = await this.parentModel.findById(parentId);
      if (!parent) {
        return {
          status: HttpStatus.BAD_REQUEST,
          msg: `Parent with ID "${parentId}" does not exist.`,
        };
      }
    }

    // Check if studentId already exists
    const existingStudentBystudentId = await this.studentModel.findOne({ studentId });
    if (existingStudentBystudentId) {
      return {
        status: HttpStatus.CONFLICT,
        msg: `studentId "${studentId}" is already taken.`,      };
    }

    // Check if student email already exists
    const existingStudentByEmail = await this.studentModel.findOne({ email });
    if (existingStudentByEmail) {
      return {
        status: HttpStatus.CONFLICT,
        msg: `Email "${email}" is already registered.`,
      };
    }

    // Create Student with Parent IDs (password is handled in User model by admin service)
    const student = new this.studentModel({
      ...studentData,
      studentId,
      email,
      parents: parentIds.map((id) => new Types.ObjectId(id)),
    });

    await student.save();

    // Add student to parent's children array (if not already present)
    for (const parentId of parentIds) {
      await this.parentModel.updateOne(
        { _id: parentId },
        { $addToSet: { children: student._id } }
      );
    }

    return student.populate('parents');
  }

  /**
   * Returns daily attendance records for a student.
   * Each record: { date, status, courseName, checkInTime?, checkOutTime?, reason? }
   */
  async getDailyAttendanceForStudent(studentId: string) {
    const objectId = new Types.ObjectId(studentId);

    // 1. Find all attendance records for this student in any course
    const attendanceRecords = await this.attendanceModel
      .find({ 'students._id': objectId })
      .populate('courseId', 'courseName')
      .select('courseId date students')
      .lean();

    // 2. Flatten all attendance entries into daily records
    const all: Array<{
      date: string;
      status: string;
      courseName: string;
      checkInTime?: string;
      checkOutTime?: string;
      reason?: string;
    }> = [];

    for (const record of attendanceRecords) {
      const courseName = record.courseId?.courseName || 'N/A';
      const date = record.date;
      const studentEntry = (record.students || []).find(
        (s: any) => String(s._id) === String(studentId),
      );
      if (!studentEntry) continue;

      all.push({
        date,
        status: studentEntry.attendance || 'N/A',
        courseName,
        checkInTime: studentEntry.checkInTime,
        checkOutTime: studentEntry.checkOutTime,
        reason: studentEntry.reason,
      });
    }

    // (Optional) You may want to group multiple courses per day and decide how to show status (e.g. "Absent" if any course is absent).
    // For simplicity, just return all records as-is.
    return all;
  }

  async submitAttendanceExplanation(
    studentId: string,
    date: string,
    explanation: string,
    status: string,
  ) {
    try {
      // TODO: Store explanation in database (can create a separate collection or add to attendance record)
      // For now, return success response
      console.log('Attendance explanation submitted:', {
        studentId,
        date,
        explanation,
        status,
        submittedAt: new Date().toISOString(),
      });

      // In the future, you could:
      // 1. Create an AttendanceExplanation collection
      // 2. Or update the attendance record with explanationSubmitted flag
      // 3. Or send notification to admin/teacher

      return {
        success: true,
        message: 'Explanation submitted successfully',
        data: {
          studentId,
          date,
          explanation,
          status,
          submittedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('Error submitting attendance explanation:', error);
      throw new NotFoundException('Failed to submit explanation');
    }
  }

  async findById(id: string): Promise<Student> {
    return this.studentModel.findById(id).exec();
  }

  async findAll(
    page = 1,
    limit = 10,
    studentId?: string,
    search?: string,
    startDate?: string,
    endDate?: string,
    className?: string,
    schoolId?: string,
  ) {
    const skip = (page - 1) * limit;

    // Define filter conditions
    const filter: any = {};

    if (studentId) {
      filter.studentId = studentId; // Use direct match if studentId is unique
    }

    if (search?.trim()) {
      const searchValue = this.escapeRegex(search.trim());
      filter.$or = [
        { firstName: { $regex: searchValue, $options: 'i' } },
        { lastName: { $regex: searchValue, $options: 'i' } },
        { email: { $regex: searchValue, $options: 'i' } },
      ];
    }

    if (className) {
      filter.class = className; // Fixed class filtering
    }

    if (schoolId && Types.ObjectId.isValid(schoolId)) {
      filter.schoolId = new Types.ObjectId(schoolId);
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

    const totalRecordsCount = await this.studentModel.countDocuments(filter);
    const students = await this.studentModel
      .find(filter, '-updatedAt') // Exclude updatedAt field
      .populate('parents')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return {
      data: students,
      totalPages: Math.ceil(totalRecordsCount / limit),
      totalRecordsCount,
      currentPage: page,
      limit,
    };
  }

  async studentCount(className: string, section: string) {
    try {
      const count = await this.studentModel.countDocuments({
        class: className,
        section: section,
      });
      return count;
    } catch (error) {
      console.error('Error fetching student count:', error);
      return 0;
    }
  }

  async findOne(id: string): Promise<Student> {
    const student = await this.studentModel
      .findById(id, '-updatedAt')
      .populate('parents')
      .exec();
    
    if (!student) {
      throw new NotFoundException(`Student with ID "${id}" not found.`);
    }
    
    return student;
  }

  async delete(id: string): Promise<{ message: string }> {
    const student = await this.studentModel.findById(id).exec();
    
    if (!student) throw new NotFoundException(`Student with ID "${id}" not found.`);
    if (student.parents) {
      for (const parentId of student.parents as Types.ObjectId[]) {
        await this.parentModel.updateOne(
          { _id: parentId },
          { $pull: { children: student._id } }
        );
      }
    }
    await this.studentModel.findByIdAndDelete(id);

    return { message: 'Student deleted successfully.' };
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ): Promise<Student | ResponseDto> {
    const student = await this.studentModel.findById(id);

    if (!student) throw new NotFoundException(`Student with ID "${id}" not found.`);

    const { parents: newParentIds, ...studentData } = updateStudentDto;
    let previousParentIds: Types.ObjectId[] = [];
    if (student.parents) previousParentIds = (student.parents as Types.ObjectId[]).map((p) => new Types.ObjectId(p));

    // Remove from previous parents if parents changed
    if (newParentIds && newParentIds.length > 0) {
      // Remove student from previous parents' children array
      for (const prevParentId of previousParentIds) {
        if (!newParentIds.includes(prevParentId.toString())) {
          await this.parentModel.updateOne(
            { _id: prevParentId },
            { $pull: { children: student._id } }
          );
        }
      }
      for (const parentId of newParentIds) {
        await this.parentModel.updateOne(
          { _id: parentId },
          { $addToSet: { children: student._id } }
        );
      }
      student.parents = newParentIds.map((id) => new Types.ObjectId(id));
    }

    Object.assign(student, studentData);
    await student.save();

    return this.studentModel.findById(id).populate('parents');
  }

  async getAttendanceByStudentId(studentObjectId: string, startDate?: string, endDate?: string) {
    const objectId = new Types.ObjectId(studentObjectId);
    const query: any = { 'students._id': objectId };

    // Add date filtering if provided
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = startDate;
      }
      if (endDate) {
        query.date.$lte = endDate;
      }
    }

    const records = await this.attendanceModel
      .find(query)
      .select('courseId students date class section')
      .populate('courseId', 'courseName courseCode')
      .sort({ date: -1 })
      .exec();

    // If date filtering is requested, return individual records for reports
    if (startDate || endDate) {
      const individualRecords: any[] = [];
      records.forEach((record) => {
        const studentEntry = record.students.find((s: any) =>
          new Types.ObjectId(s._id).equals(objectId),
        );
        if (studentEntry) {
          individualRecords.push({
            studentId: { _id: objectId, studentId: studentEntry.studentId },
            studentName: studentEntry.studentName,
            courseId: record.courseId,
            courseName: (record.courseId as any)?.courseName || '',
            date: record.date,
            attendanceDate: record.date,
            status: studentEntry.attendance,
            attendanceStatus: studentEntry.attendance,
            class: record.class,
            section: record.section,
          });
        }
      });
      return individualRecords;
    }

    // Otherwise, return aggregated data by course (original behavior)
    const attendanceByCourse: Record<
      string,
      { present: number; total: number; name: string }
    > = {};

    records.forEach((record) => {
      const courseId = (record.courseId as any)._id.toString();
      const courseName = record.courseId.courseName;

      const studentEntry = record.students.find((s: any) =>
        new Types.ObjectId(s._id).equals(objectId),
      );

      if (!studentEntry) return;

      if (!attendanceByCourse[courseId]) {
        attendanceByCourse[courseId] = {
          present: 0,
          total: 0,
          name: courseName,
        };
      }

      if (studentEntry.attendance === 'Present') {
        attendanceByCourse[courseId].present += 1;
      }

      attendanceByCourse[courseId].total += 1;
    });

    const result = Object.entries(attendanceByCourse).map(
      ([courseId, stats]) => ({
        courseId,
        courseName: stats.name,
        attendancePercentage: Math.round((stats.present / stats.total) * 100),
      }),
    );

    return result;
  }

  async getStudentAttendanceByCourseCode(
    courseCode: string,
    studentId: string,
  ) {
    const course = await this.courseModel.findOne({ _id: courseCode });

    if (!course) {
      throw new NotFoundException(`Course with code ${courseCode} not found`);
    }

    const attendanceRecords = await this.attendanceModel
      .find({
        courseId: course._id,
        'students._id': studentId,
      })
      .select('date students');

    const attendanceData = attendanceRecords.map((record) => {
      const student = record.students.find((s: any) =>
        new Types.ObjectId(s._id).equals(studentId),
      );
      return {
        date: record.date,
        status: student?.attendance || 'N/A',
      };
    });

    return [{ courseCode: course.courseCode }, ...attendanceData];
  }

  async validateStudent(data: { email: string; password: string }) {
    try {
      // Students authenticate through the User model, not the Student model
      // This method should not be used directly - use AuthService instead
      return null;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  async getStudentCommunications(studentId: string) {
    try {
      // Get the student details to find their class and section
      const student = await this.studentModel.findById(studentId);
      if (!student) {
        return [];
      }

      // Find all schedules for the student's class and section
      const schedules = await this.scheduleModel
        .find({
          className: student.class,
          section: student.section,
        })
        .populate('courseId', 'courseName courseCode')
        .populate('teacherId', 'firstName lastName email')
        .exec();

      // Transform the schedules into communication data
      const communications = schedules.map((schedule) => ({
        id: schedule._id,
        name: schedule.courseId?.courseName || 'Unknown Course',
        courseCode: schedule.courseId?.courseCode || 'N/A',
        teacher: schedule.teacherId 
          ? `${(schedule.teacherId as any).firstName} ${(schedule.teacherId as any).lastName}` 
          : 'Unknown Teacher',
        teacherEmail: (schedule.teacherId as any)?.email || '',
        lastMessage: `Welcome to ${schedule.courseId?.courseName || 'this course'}! Looking forward to a great semester.`,
        unreadCount: 0, // This would be dynamic based on a messaging system
        schedule: schedule.dayOfWeek,
      }));

      return communications;
    } catch (error) {
      console.error('Error fetching student communications:', error);
      return [];
    }
  }

  async getStudentHealthRecords(studentId: string) {
    try {
      // Find health record by student ID
      const healthRecord = await this.healthRecordModel
        .findOne({ studentId: new Types.ObjectId(studentId) })
        .exec();

      if (!healthRecord) {
        // Return empty structure if no health record exists
        return {
          medicalConditions: [],
          allergies: [],
          medications: [],
          nurseVisits: [],
          physicalExams: [],
          immunizations: [],
          healthAlerts: [],
        };
      }

      return {
        medicalConditions: healthRecord.medicalConditions || [],
        allergies: healthRecord.allergies || [],
        medications: healthRecord.medications || [],
        nurseVisits: healthRecord.nurseVisits || [],
        physicalExams: healthRecord.physicalExams || [],
        immunizations: healthRecord.immunizations || [],
        healthAlerts: healthRecord.healthAlerts || [],
        emergencyContact: {
          name: healthRecord.emergencyContactName,
          phone: healthRecord.emergencyContactPhone,
          relation: healthRecord.emergencyContactRelation,
        },
        physician: {
          name: healthRecord.physicianName,
          phone: healthRecord.physicianPhone,
        },
      };
    } catch (error) {
      console.error('Error fetching student health records:', error);
      return {
        medicalConditions: [],
        allergies: [],
        medications: [],
        nurseVisits: [],
        physicalExams: [],
        immunizations: [],
        healthAlerts: [],
      };
    }
  }
}
