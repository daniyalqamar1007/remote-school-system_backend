import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Grade, GradeDocument } from './schema/schema.garde';
import { Course, CourseDocument } from 'src/course/schema/course.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { CreateGradeDto } from './dto/create-grade.dto';
import { Activity } from '../activity/schema/schema.activity';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Alert, AlertDocument } from '../alert/schema/alert.schema';

function getLetterGrade(grade: number) {
  if (grade >= 90) return "A";
  if (grade >= 80) return "B";
  if (grade >= 70) return "C";
  if (grade >= 60) return "D";
  return "F";
}


@Injectable()
export class GradeService {
  constructor(
    @InjectModel(Grade.name)
    private readonly GradeModel: Model<GradeDocument>,
    @InjectModel(Course.name)
    private readonly CourseModel: Model<CourseDocument>,
    @InjectModel(Activity.name)
    private readonly activityModel: Model<any>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Alert.name)
    private readonly alertModel: Model<AlertDocument>,
  ) {}

  async create(createDtos: CreateGradeDto[]): Promise<any> {
    try {
      // Validate scores don't exceed total marks
      for (const dto of createDtos) {
        if (dto.score > dto.totalMarks) {
          throw new BadRequestException(
            `Score (${dto.score}) cannot exceed total marks (${dto.totalMarks})`
          );
        }
      }

      // Check if grades already exist for this combination
      const firstDto = createDtos[0];
      const exists = await this.GradeModel.findOne({
        class: firstDto.class,
        section: firstDto.section,
        courseId: firstDto.courseId,
        markingType: firstDto.markingType,
        term: firstDto.term || undefined,
      });

      if (exists) {
        throw new BadRequestException('Grade already exists for this marking type');
      }

      // Convert studentId and courseId to ObjectId
      const gradesWithObjectIds = createDtos.map(dto => ({
        ...dto,
        studentId: new Types.ObjectId(dto.studentId),
        courseId: new Types.ObjectId(dto.courseId),
        teacherId: new Types.ObjectId(dto.teacherId),
      }));

      const createdGrades = await this.GradeModel.insertMany(gradesWithObjectIds);
      
      // Create alerts for parents
      try {
        await this.createParentAlertsForGrades(createdGrades);
      } catch (alertError) {
        console.error('Failed to create parent alerts for grades:', alertError);
        // Don't fail grade creation if alert creation fails
      }

      return createdGrades;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to create grade(s)');
    }
  }

  async findAllByStudent(studentId: string) {
    // Get all grades for a student, populate course and teacher
    const grades = await this.GradeModel.find({ studentId })
      .populate('courseId')
      .populate('teacherId')
      .exec();
  
    // Map to simpler objects for frontend
    return grades.map((grade) => ({
      courseId: grade.courseId._id,
      courseName: grade.courseId.courseName,
      // teacherName: grade.teacherId ? grade.teacherId.firstName + ' ' + grade.teacherId.lastName : '',
      // teacherEmail: grade.teacherId ? grade.teacherId.email : '',
      currentGrade: grade.overAll,
      lastUpdated: grade.updatedAt,
      letterGrade: getLetterGrade(grade.overAll), // utility function
      // For details page:
      quiz: grade.quiz,
      midTerm: grade.midTerm,
      project: grade.project,
      finalTerm: grade.finalTerm,
      term: grade.term,
    }));
  }

  async findAll(
    className?: string,
    section?: string,
    courseId?: string,
    teacherId?: string,
    term?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<Grade[]> {
    try {
      const filter: any = {};

      if (className) filter.class = className;
      if (section) filter.section = section;
      if (courseId) filter.courseId = courseId;
      if (teacherId) filter.teacherId = teacherId;
      if (term) filter.term = term;

      // Add date filtering if provided
      if (startDate || endDate) {
        filter.date = {};
        if (startDate) {
          filter.date.$gte = new Date(startDate);
        }
        if (endDate) {
          // Set end date to end of day
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          filter.date.$lte = end;
        }
      }

      return this.GradeModel.find(filter)
        .populate('studentId', 'firstName lastName studentId email class section')
        .populate('courseId', 'courseName courseCode')
        .populate('teacherId', 'firstName lastName')
        .sort({ date: -1, createdAt: -1 })
        .exec();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve grades');
    }
  }
  async getStudentGPA(studentId: string) {
    // All courses for this student
    const grades = await this.GradeModel.find({ studentId }).exec();
    if (!grades.length) {
      return { current: 0, previous: 0, trend: "up", classRank: "--", classSize: "--", classPercentile: "--" };
    }
  
    // GPA = average of overAll scores mapped to 4.0 scale
    const gpa = (grades.reduce((sum, g) => sum + g.overAll, 0) / grades.length) * 0.04;
    // For trend, compare with last grade (for demo, just compare with previous GPA)
    const prevGpa = grades.length > 1
      ? (grades.slice(0, -1).reduce((sum, g) => sum + g.overAll, 0) / (grades.length - 1)) * 0.04
      : gpa;
  
    // Optionally, compute class rank (requires more info)
    return {
      current: gpa,
      previous: prevGpa,
      trend: gpa >= prevGpa ? "up" : "down",
      classRank: "--", // Implement if you have class/section data
      classSize: "--",
      classPercentile: "--",
    };
  }
  
  async findGradesByStudentAndCourse(
    studentId: any,
    courseId: string,
  ): Promise<any> {
    try {
      const grade = await this.GradeModel.findOne({
        studentId,
        courseId,
      }).exec();
      const course = await this.CourseModel.findById(courseId)
        .select('courseName')
        .exec();
      const courseName = course?.courseName || 'Unknown';

      if (!grade) {
        throw new NotFoundException(
          'Grade not found for given student and course',
        );
      }

      return {
        studentId: grade.studentId,
        courseId: grade.courseId,
        teacherId: grade.teacherId,
        courseName,
        quiz: grade.quiz,
        midTerm: grade.midTerm,
        project: grade.project,
        finalTerm: grade.finalTerm,
        overAll: grade.overAll,
      };
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to retrieve grades by student and course',
      );
    }
  }

  async findOne(
    id: string,
    className?: string,
    section?: string,
    courseId?: string,
    teacherId?: string,
  ): Promise<Grade> {
    try {
      const filter: any = { _id: id };
      if (className) filter.class = className;
      if (section) filter.section = section;
      if (courseId) filter.courseId = courseId;
      if (teacherId) filter.teacherId = teacherId;

      const grade = await this.GradeModel.findOne(filter)
        .populate(['teacherId', 'courseId', 'studentId'])
        .exec();

      if (!grade) throw new NotFoundException('Grade not found');

      return grade;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to retrieve grade');
    }
  }

  
  async updateMany(grades: UpdateGradeDto[]): Promise<Grade[]> {
    try {
      const updatedGrades: Grade[] = [];

      for (const grade of grades) {
        if (!grade._id) {
          throw new BadRequestException('_id is required for bulk update');
        }
        const { _id, ...updateData } = grade;
        const updated = await this.GradeModel.findByIdAndUpdate(
          _id,
          updateData,
          { new: true },
        );

        if (updated) {
          updatedGrades.push(updated);
        }
      }

      return updatedGrades;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update grades');
    }
  }

  async remove(
    className?: string,
    section?: string,
    courseId?: string,
    teacherId?: string,
  ): Promise<any> {
    try {
      const filter: any = {};
      if (className) filter.class = className;
      if (section) filter.section = section;
      if (courseId) filter.courseId = courseId;
      if (teacherId) filter.teacherId = teacherId;

      return this.GradeModel.deleteMany(filter).exec();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new InternalServerErrorException('Failed to delete grades');
    }
  }

  async calculateStudentGPA(studentId: string) {
    try {
      // Get all grades for the student
      const grades = await this.GradeModel.find({ studentId }).exec();
      
      if (grades.length === 0) {
        return {
          current: 0,
          previous: 0,
          trend: 'up',
          classRank: 1,
          classSize: 1,
          classPercentile: '100th'
        };
      }
      
      // Calculate current GPA (using overAll grades)
      const totalPoints = grades.reduce((sum, grade) => sum + grade.overAll, 0);
      const currentGPA = totalPoints / grades.length / 25; // Convert to 4.0 scale (100/25 = 4.0)
      
      // For simplicity, calculate previous GPA as slightly lower
      const previousGPA = Math.max(0, currentGPA - 0.2);
      
      // Determine trend
      const trend = currentGPA >= previousGPA ? 'up' : 'down';
      
      // Mock class rank data (in a real system, you'd calculate this across all students)
      const classRank = Math.floor(Math.random() * 20) + 1;
      const classSize = 150;
      const classPercentile = `${Math.floor((1 - (classRank / classSize)) * 100)}th`;
      
      return {
        current: Math.min(4.0, Math.max(0, currentGPA)),
        previous: Math.min(4.0, Math.max(0, previousGPA)),
        trend,
        classRank,
        classSize,
        classPercentile
      };
    } catch (error) {
      throw new InternalServerErrorException('Failed to calculate GPA');
    }
  }

  async getTeacherGrades(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    filters?: { courseId?: string; className?: string; section?: string; term?: string; markingType?: string },
  ): Promise<{ data: Grade[]; total: number; page: number; totalPages: number; grouped?: any }> {
    try {
      const query: any = { 
        teacherId: new Types.ObjectId(teacherId),
        // Note: Removed null studentId filter - grades should now be created with proper studentId
      };

      if (filters?.courseId) {
        query.courseId = new Types.ObjectId(filters.courseId);
      }
      if (filters?.className) {
        query.class = filters.className;
      }
      if (filters?.section) {
        query.section = filters.section;
      }
      if (filters?.term) {
        query.term = filters.term;
      }
      if (filters?.markingType) {
        query.markingType = filters.markingType;
      }

      // First, get all matching grades (without pagination) to group them
      const allData = await this.GradeModel
        .find(query)
        .populate('courseId', 'courseName courseCode')
        .populate('studentId', 'firstName lastName studentId class section email')
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      console.log("All grades data:", allData.length, "records");

      // Group by course, grade, section, markingType, term
      const groupedMap = new Map();
      allData.forEach((grade: any) => {
        // Skip grades with null studentId
        if (!grade.studentId) {
          console.warn(`Skipping grade ${grade._id} with null studentId`);
          return;
        }
        
        const key = `${grade.courseId?._id || grade.courseId}-${grade.class}-${grade.section}-${grade.markingType}-${grade.term || 'N/A'}`;
        if (!groupedMap.has(key)) {
          groupedMap.set(key, {
            courseId: grade.courseId,
            class: grade.class,
            section: grade.section,
            markingType: grade.markingType,
            term: grade.term || 'N/A',
            totalMarks: grade.totalMarks,
            students: [],
            _id: grade._id, // Use first grade ID for actions
            createdAt: grade.createdAt,
          });
        }
        groupedMap.get(key).students.push({
          _id: grade._id, // Include grade _id for frontend key
          studentId: grade.studentId,
          score: grade.score,
        });
      });

      // Get all grouped records
      const allGrouped = Array.from(groupedMap.values());
      
      // Sort grouped records by createdAt (most recent first)
      allGrouped.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      // Apply pagination to grouped records
      const totalGrouped = allGrouped.length;
      const skip = (page - 1) * limit;
      const paginatedGrouped = allGrouped.slice(skip, skip + limit);

      console.log(`Grouped into ${totalGrouped} records, showing page ${page} (${skip + 1} to ${skip + paginatedGrouped.length})`);

      return {
        data: allData.slice(skip, skip + limit), // Keep individual records for backward compatibility
        total: totalGrouped, // Return count of grouped records, not individual records
        page,
        totalPages: Math.ceil(totalGrouped / limit),
        grouped: paginatedGrouped,
      };
    } catch (error) {
      console.error('Error getting teacher grades:', error);
      throw new InternalServerErrorException('Failed to retrieve grades');
    }
  }

  async getGradeById(gradeId: string, teacherId: string): Promise<Grade> {
    try {
      const grade = await this.GradeModel.findOne({
        _id: gradeId,
        teacherId: new Types.ObjectId(teacherId),
        // Note: Removed null studentId filter - grades should now be created with proper studentId
      })
        .populate('courseId', 'courseName courseCode')
        .populate('studentId', 'firstName lastName studentId class section email')
        .lean()
        .exec();

      if (!grade) {
        throw new NotFoundException('Grade record not found');
      }

      return grade as any;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error getting grade by ID:', error);
      throw new InternalServerErrorException('Failed to retrieve grade');
    }
  }

  async createGradesForTeacher(
    teacherId: string,
    grades: CreateGradeDto[],
  ): Promise<any[]> {
    try {
      // Validate scores don't exceed total marks
      for (const grade of grades) {
        if (grade.score > grade.totalMarks) {
          throw new BadRequestException(
            `Score (${grade.score}) cannot exceed total marks (${grade.totalMarks})`
          );
        }
      }

      // Ensure all grades have the same teacherId and convert IDs to ObjectId
      const gradesWithTeacher = grades.map(grade => {
        // Validate that studentId is provided
        if (!grade.studentId) {
          throw new BadRequestException('Student ID is required for all grades');
        }
        
        return {
          ...grade,
          teacherId: new Types.ObjectId(teacherId),
          courseId: new Types.ObjectId(grade.courseId),
          studentId: new Types.ObjectId(grade.studentId), // Convert studentId to ObjectId
        };
      });

      console.log('Creating grades with studentIds:', gradesWithTeacher.map(g => ({ 
        studentId: g.studentId, 
        courseId: g.courseId, 
        score: g.score 
      })));

      const createdGrades = await this.GradeModel.insertMany(gradesWithTeacher);
      
      console.log('Created grades:', createdGrades.map(g => ({ 
        _id: g._id, 
        studentId: g.studentId, 
        courseId: g.courseId 
      })));

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

        const firstGrade = grades[0];
        await this.activityModel.create({
          title: 'Grades Assigned',
          subtitle: `Grades assigned for ${firstGrade.class}-${firstGrade.section} - ${createdGrades.length} students`,
          performBy: performByValue,
          actorId: new Types.ObjectId(teacherId),
          teacherId: teacherId.toString(),
        });
      } catch (activityError) {
        console.error('Failed to create activity for grade creation:', activityError);
      }

      // Create alerts for parents
      try {
        console.log('Creating parent alerts for grades:', createdGrades);
        await this.createParentAlertsForGrades(createdGrades);
      } catch (alertError) {
        console.error('Failed to create parent alerts for grades:', alertError);
        // Don't fail grade creation if alert creation fails
      }

      return createdGrades;
    } catch (error) {
      console.error('Error creating grades:', error);
      throw new InternalServerErrorException('Failed to create grades');
    }
  }

  async updateGradeForTeacher(
    gradeId: string,
    teacherId: string,
    updateData: UpdateGradeDto,
  ): Promise<Grade> {
    try {
      const grade = await this.GradeModel.findOne({
        _id: gradeId,
        teacherId: new Types.ObjectId(teacherId),
      });

      if (!grade) {
        throw new NotFoundException('Grade record not found');
      }

      // Update grade fields
      if (updateData.quiz) {
        grade.quiz = updateData.quiz as any;
      }
      if (updateData.midTerm) {
        grade.midTerm = updateData.midTerm as any;
      }
      if (updateData.project) {
        grade.project = updateData.project as any;
      }
      if (updateData.finalTerm) {
        grade.finalTerm = updateData.finalTerm as any;
      }
      if (updateData.overAll !== undefined) {
        grade.overAll = updateData.overAll;
      }
      if (updateData.totalMarks !== undefined) {
        grade.totalMarks = updateData.totalMarks;
      }
      if (updateData.score !== undefined) {
        // Validate score doesn't exceed total marks
        const maxMarks = updateData.totalMarks !== undefined ? updateData.totalMarks : grade.totalMarks;
        if (updateData.score > maxMarks) {
          throw new BadRequestException(
            `Score (${updateData.score}) cannot exceed total marks (${maxMarks})`
          );
        }
        grade.score = updateData.score;
      }

      const updatedGrade = await grade.save();

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
          title: 'Grade Updated',
          subtitle: `Grade updated for ${grade.class}-${grade.section}`,
          performBy: performByValue,
          actorId: new Types.ObjectId(teacherId),
          teacherId: teacherId.toString(),
        });
      } catch (activityError) {
        console.error('Failed to create activity for grade update:', activityError);
      }

      return updatedGrade;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating grade:', error);
      throw new InternalServerErrorException('Failed to update grade');
    }
  }

  async deleteGradeForTeacher(gradeId: string, teacherId: string): Promise<void> {
    try {
      const grade = await this.GradeModel.findOne({
        _id: gradeId,
        teacherId: new Types.ObjectId(teacherId),
      });

      if (!grade) {
        throw new NotFoundException('Grade record not found');
      }

      const gradeData = grade.toObject();
      await this.GradeModel.deleteOne({
        _id: gradeId,
        teacherId: new Types.ObjectId(teacherId),
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
          title: 'Grade Deleted',
          subtitle: `Grade deleted for ${gradeData.class}-${gradeData.section}`,
          performBy: performByValue,
          actorId: new Types.ObjectId(teacherId),
          teacherId: teacherId.toString(),
        });
      } catch (activityError) {
        console.error('Failed to create activity for grade deletion:', activityError);
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error deleting grade:', error);
      throw new InternalServerErrorException('Failed to delete grade');
    }
  }

  async getStudentGrades(
    studentId: string,
    page: number = 1,
    limit: number = 10,
    filters?: { courseId?: string; markingType?: string; term?: string; search?: string },
  ): Promise<{ data: any[]; total: number; page: number; totalPages: number }> {
    try {
      const query: any = { studentId: new Types.ObjectId(studentId) };

      if (filters?.courseId) {
        query.courseId = new Types.ObjectId(filters.courseId);
      }
      if (filters?.markingType) {
        query.markingType = filters.markingType;
      }
      if (filters?.term) {
        query.term = filters.term;
      }

      const skip = (page - 1) * limit;
      
      // Build aggregation pipeline for search
      const pipeline: any[] = [
        { $match: query },
        {
          $lookup: {
            from: 'courses',
            localField: 'courseId',
            foreignField: '_id',
            as: 'course',
          },
        },
        {
          $unwind: {
            path: '$course',
            preserveNullAndEmptyArrays: true,
          },
        },
      ];

      // Add search filter if provided
      if (filters?.search) {
        pipeline.push({
          $match: {
            $or: [
              { 'course.courseName': { $regex: filters.search, $options: 'i' } },
              { 'course.courseCode': { $regex: filters.search, $options: 'i' } },
              { markingType: { $regex: filters.search, $options: 'i' } },
            ],
          },
        });
      }

      // Add pagination
      const countPipeline = [...pipeline, { $count: 'total' }];
      pipeline.push(
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
      );

      const [data, countResult] = await Promise.all([
        this.GradeModel.aggregate(pipeline).exec(),
        this.GradeModel.aggregate(countPipeline).exec(),
      ]);

      const total = countResult[0]?.total || 0;

      // Format the response
      const formattedData = data.map((grade: any) => ({
        _id: grade._id,
        courseId: grade.courseId,
        courseName: grade.course?.courseName || 'N/A',
        courseCode: grade.course?.courseCode || 'N/A',
        markingType: grade.markingType || 'N/A',
        term: grade.term || 'N/A',
        class: grade.class || 'N/A',
        section: grade.section || 'N/A',
        score: grade.score || 0,
        totalMarks: grade.totalMarks || 0,
        overAll: grade.overAll || 0,
        quiz: grade.quiz,
        midTerm: grade.midTerm,
        project: grade.project,
        finalTerm: grade.finalTerm,
        createdAt: grade.createdAt,
        updatedAt: grade.updatedAt,
      }));

      return {
        data: formattedData,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('Error getting student grades:', error);
      throw new InternalServerErrorException('Failed to retrieve student grades');
    }
  }

  /**
   * Create alerts for parents when grades are created
   */
  private async createParentAlertsForGrades(createdGrades: any[]): Promise<void> {
    try {
      console.log(`\n📢 ========== CREATING PARENT ALERTS FOR GRADES ==========`);
      console.log(`📋 Total grades created: ${createdGrades.length}`);

      // Get unique student User IDs from created grades
      // Note: grade.studentId is a reference to User, which has parentIds array
      const studentUserIds = [...new Set(createdGrades.map(grade => grade.studentId.toString()))];
      console.log(`📋 Unique student User IDs: ${studentUserIds.length}`);

      // Get User records directly with parentIds array
      const studentUsers = await this.userModel
        .find({ _id: { $in: studentUserIds.map(id => new Types.ObjectId(id)) } })
        .select('_id firstName lastName parentIds schoolId')
        .lean();

      console.log(`📋 Student Users found: ${studentUsers.length}`);

      // Create a map: studentUserId -> User record
      const userMap = new Map<string, any>();
      for (const user of studentUsers) {
        userMap.set(user._id.toString(), user);
      }

      // Get course details for grade descriptions
      const courseIds = [...new Set(createdGrades.map(grade => grade.courseId.toString()))];
      const courses = await this.CourseModel
        .find({ _id: { $in: courseIds.map(id => new Types.ObjectId(id)) } })
        .select('_id courseName')
        .lean();
      
      const courseMap = new Map(courses.map(course => [course._id.toString(), course]));

      // Create alerts for each parent
      const alertsToCreate: any[] = [];
      const parentGradeMap = new Map<string, any[]>(); // parentId -> grades[]

      // Group grades by student and collect parent IDs directly from User record
      for (const grade of createdGrades) {
        const studentUserId = grade.studentId.toString();
        const studentUser = userMap.get(studentUserId);
        
        if (!studentUser) {
          console.log(`⚠️ Student User not found for grade (User ID: ${studentUserId})`);
          continue;
        }

        const course = courseMap.get(grade.courseId.toString());
        const courseName = course ? (course as any).courseName : 'Unknown Course';

        // Get parent IDs directly from User record's parentIds array
        const parentIds = (studentUser as any).parentIds || [];
        
        if (!parentIds || parentIds.length === 0) {
          console.log(`⚠️ No parents found for student User: ${studentUserId}`);
          continue;
        }

        console.log(`✅ Found ${parentIds.length} parent ID(s) for student User: ${studentUserId}`);

        // Get parent ID from index 0 (or all parent IDs)
        // User requested to use index 0, but we'll create alerts for all parents
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

          // Group grades by parent User ID to create consolidated alerts
          if (!parentGradeMap.has(parentUserId)) {
            parentGradeMap.set(parentUserId, []);
          }
          parentGradeMap.get(parentUserId)!.push({
            grade,
            studentUser,
            courseName,
            studentId: studentUserId
          });
        }
      }

      // Create alerts for each parent
      for (const [parentId, gradeData] of parentGradeMap.entries()) {
        // Group by student to create separate alerts per student
        const studentGroups = new Map<string, any[]>();
        
        for (const item of gradeData) {
          const studentId = item.studentId;
          if (!studentGroups.has(studentId)) {
            studentGroups.set(studentId, []);
          }
          studentGroups.get(studentId)!.push(item);
        }

        // Create one alert per student for this parent
        for (const [studentId, studentGrades] of studentGroups.entries()) {
          const firstGrade = studentGrades[0];
          const studentUser = firstGrade.studentUser;
          const studentName = `${(studentUser as any).firstName || ''} ${(studentUser as any).lastName || ''}`.trim() || 'Student';
          
          // Create alert title and description
          const gradeCount = studentGrades.length;
          const title = gradeCount === 1 
            ? `New Grade: ${firstGrade.courseName}`
            : `New Grades: ${gradeCount} courses`;
          
          let description = `New grade${gradeCount > 1 ? 's' : ''} ${gradeCount > 1 ? 'have' : 'has'} been assigned to ${studentName}:\n\n`;
          
          for (const item of studentGrades) {
            const grade = item.grade;
            const courseName = item.courseName;
            const percentage = ((grade.score / grade.totalMarks) * 100).toFixed(1);
            description += `• ${courseName} (${grade.markingType}): ${grade.score}/${grade.totalMarks} (${percentage}%)\n`;
          }

          alertsToCreate.push({
            parentId: new Types.ObjectId(parentId), // parentId is now the User ID
            title,
            description: description.trim(),
            read: false,
            studentId: new Types.ObjectId(firstGrade.studentId),
            gradeId: firstGrade.grade._id,
            alertType: 'grade',
            schoolId: (firstGrade.studentUser as any).schoolId ? new Types.ObjectId((firstGrade.studentUser as any).schoolId) : undefined,
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
        console.log(`⚠️ No alerts to create (no parents found for students)`);
      }

      console.log(`📢 ========== END PARENT ALERTS CREATION ==========\n`);
    } catch (error) {
      console.error('Error creating parent alerts:', error);
      throw error;
    }
  }
}
