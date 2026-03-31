import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseDocument } from './schema/course.schema';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { isValidObjectId } from 'mongoose';
import {
  Schedule,
  ScheduleDocument,
} from 'src/schedule/schema/schedule.schema';
import { AwsService } from '../aws/aws.service';
import { ConfigService } from '@nestjs/config';
import { uploadBufferToS3, buildS3KeyPath } from '../../utils/s3Helpers';
import { School } from '../auth/schemas/school.schema';
import * as fs from 'fs';

@Injectable()
export class CourseService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Schedule.name) private courseSchedule: Model<ScheduleDocument>,
    @InjectModel(School.name) private schoolModel: Model<School>,
    private awsService: AwsService,
    private configService: ConfigService,
  ) {}

  async create(createCourseDto: CreateCourseDto): Promise<Course> {
    const { courseName, courseCode, schoolId, ...rest } = createCourseDto;

    // Allow same course name with different course code - only check course code uniqueness
    // Removed course name uniqueness check

    const existingCourseByCode = await this.courseModel
      .findOne({ courseCode })
      .exec();
    if (existingCourseByCode) {
      throw new ConflictException('Course code already exists');
    }

    const newCourseData = { courseName, courseCode, ...rest };

    // Handle schoolId if provided
    if (schoolId) {
      if (!isValidObjectId(schoolId)) {
        throw new BadRequestException('Invalid schoolId format');
      }
      newCourseData['schoolId'] = schoolId;
    }

    try {
      const newCourse = new this.courseModel(newCourseData);
      return await newCourse.save();
    } catch (error) {
      console.error('Error creating course:', error);
      throw new InternalServerErrorException(
        'Failed to create course. Please try again later.',
      );
    }
  }
  async findAll(
    coursename?: string,
    active?: boolean,
    special?: boolean,
    schoolId?: string,
  ): Promise<Course[]> {
    const filter: any = {};

    if (coursename) {
      filter.courseName = { $regex: coursename, $options: 'i' };
    }

    if (active !== undefined) {
      filter.active = active;
    }

    if (special !== undefined) {
      filter.special = special;
    }

    // If schoolId is provided, filter directly by schoolId
    if (schoolId) {
      filter.schoolId = schoolId;
    }

    return this.courseModel.find(filter).exec();
  }

  async findOne(id: string): Promise<Course> {
    const course = await this.courseModel
      .findById(id)
      .exec();
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async update(id: string, updateCourseDto: UpdateCourseDto): Promise<Course> {
    // Find the existing course by ID
    const existingCourse = await this.courseModel.findById(id).exec();
    if (!existingCourse) {
      throw new BadRequestException('Course not found');
    }

    // Check if courseName is being updated
    if (
      updateCourseDto.courseName &&
      updateCourseDto.courseName !== existingCourse.courseName
    ) {
      const existingCourseByName = await this.courseModel
        .findOne({ courseName: updateCourseDto.courseName })
        .exec();
      if (existingCourseByName) {
        throw new ConflictException('Course name already exists');
      }
    }

    // Update the course
    const updatedCourse = await this.courseModel
      .findByIdAndUpdate(id, updateCourseDto, { new: true })
      .exec();
    return updatedCourse;
  }

  async remove(id: string): Promise<Course> {
    const session = await this.courseModel.db.startSession();
    session.startTransaction();
    try {
      const deletedCourse = await this.courseModel.findByIdAndDelete(id, {
        session,
      });
      if (!deletedCourse) {
        throw new NotFoundException('Course not found');
      }

      await this.courseSchedule.deleteMany({ courseId: id }, { session });

      // ✅ Commit the transaction if everything is successful
      await session.commitTransaction();
      session.endSession();

      return deletedCourse;
    } catch (error) {
      // ❌ Rollback the transaction if anything fails
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  async uploadCourseOutline(courseId: string, file: any, user: any): Promise<any> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!isValidObjectId(courseId)) {
      throw new BadRequestException('Invalid course ID format');
    }

    const course = await this.courseModel.findById(courseId).populate('schoolId').exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    try {
      // Get school information for organized folder structure
      const schoolId = (course as any).schoolId?._id?.toString() || (course as any).schoolId?.toString();
      const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
      const schoolName = school?.name || null;
      const schoolIdStr = school?._id?.toString() || schoolId;

      // Prepare file for upload
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      
      // Get file content - handle both memory and disk storage
      const fileContent = file.buffer || fs.readFileSync(file.path || '');

      // Build S3 key path: schools/{school-name}/courses/outlines/{filename}
      const s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'courses', 'outlines', fileName);

      // Upload file to S3
      const fileUrl = await uploadBufferToS3(
        this.awsService.getS3Client(),
        this.awsService.getBucketName(),
        s3Key,
        fileContent,
        file.mimetype
      );

      // Clean up if file was saved to disk
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      const outlineData = {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        fileUrl: fileUrl,
        uploadedBy: user._id || user.userId,
        uploadedAt: new Date(),
      };

      // Update course with outline information
      const updatedCourse = await this.courseModel.findByIdAndUpdate(
        courseId,
        { 
          courseOutline: outlineData,
          outlineStatus: 'Pending'
        },
        { new: true }
      ).exec();

      return {
        message: 'Course outline uploaded successfully',
        course: updatedCourse
      };
    } catch (error) {
      console.error('Error uploading course outline:', error);
      throw new InternalServerErrorException(`Failed to upload course outline: ${error.message}`);
    }
  }

  async getCourseOutline(courseId: string): Promise<any> {
    if (!isValidObjectId(courseId)) {
      throw new BadRequestException('Invalid course ID format');
    }

    const course = await this.courseModel.findById(courseId)
      .select('courseOutline outlineStatus courseName courseCode')
      .exec();

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return {
      courseId: course._id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      outline: (course as any).courseOutline || null,
      status: (course as any).outlineStatus || null
    };
  }

  async getAllCourseOutlines(schoolId?: string): Promise<any> {
    const filter: any = {};
    
    if (schoolId && isValidObjectId(schoolId)) {
      filter.schoolId = schoolId;
    }

    const courses = await this.courseModel.find(filter)
      .select('courseName courseCode courseOutline outlineStatus schoolId')
      .populate('schoolId', 'name')
      .exec();

    return courses.map(course => ({
      courseId: course._id,
      courseName: course.courseName,
      courseCode: course.courseCode,
      outline: (course as any).courseOutline || null,
      status: (course as any).outlineStatus || null,
      school: (course as any).schoolId || null
    }));
  }
}
