import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LessonPlan, LessonPlanDocument, LessonPlanStatus } from './schema/lesson-plan.schema';
import { ValidationUtils } from '../utils/validation.utils';
import { Course, CourseDocument } from '../course/schema/course.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { Activity } from '../activity/schema/schema.activity';
import { AwsService } from '../aws/aws.service';
import { School, SchoolDocument } from '../auth/schemas/school.schema';
import { uploadBufferToS3, buildS3KeyPath } from '../../utils/s3Helpers';
import * as fs from 'fs';

@Injectable()
export class LessonPlanService {
  constructor(
    @InjectModel(LessonPlan.name) private lessonPlanModel: Model<LessonPlanDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Activity.name) private activityModel: Model<Activity>,
    @InjectModel(School.name) private schoolModel: Model<SchoolDocument>,
    private awsService: AwsService,
  ) {}

  async create(createLessonPlanDto: any): Promise<LessonPlan> {
    // Validate required fields
    if (!createLessonPlanDto.courseId || createLessonPlanDto.courseId.toString().trim() === '') {
      throw new BadRequestException('Course ID is required');
    }
    
    if (!createLessonPlanDto.teacherId || createLessonPlanDto.teacherId.toString().trim() === '') {
      throw new BadRequestException('Teacher ID is required');
    }
    
    // Validate ObjectId formats using utility
    if (!ValidationUtils.isValidObjectId(createLessonPlanDto.courseId)) {
      throw new BadRequestException('Invalid course ID format');
    }
    
    if (!ValidationUtils.isValidObjectId(createLessonPlanDto.teacherId)) {
      throw new BadRequestException('Invalid teacher ID format');
    }

    // Additional validation for other fields
    if (!createLessonPlanDto.title || createLessonPlanDto.title.trim() === '') {
      throw new BadRequestException('Title is required');
    }

    if (!createLessonPlanDto.description || createLessonPlanDto.description.trim() === '') {
      throw new BadRequestException('Description is required');
    }

    if (!createLessonPlanDto.objectives || !Array.isArray(createLessonPlanDto.objectives) || createLessonPlanDto.objectives.length === 0) {
      throw new BadRequestException('At least one objective is required');
    }

    if (!createLessonPlanDto.materials || !Array.isArray(createLessonPlanDto.materials) || createLessonPlanDto.materials.length === 0) {
      throw new BadRequestException('At least one material is required');
    }
    
    // Convert string IDs to ObjectIds
    const mongoose = require('mongoose');
    
    // Handle file upload if provided
    let attachmentUrls: string[] = [];
    if (createLessonPlanDto.file) {
      try {
        const file = createLessonPlanDto.file;
        // Get teacher and course info for school context
        const teacher = await this.userModel.findById(createLessonPlanDto.teacherId).select('schoolId').lean();
        const course = await this.courseModel.findById(createLessonPlanDto.courseId).select('schoolId').lean();
        const schoolId = (teacher as any)?.schoolId?.toString() || (course as any)?.schoolId?.toString();
        
        if (schoolId) {
          const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
          const schoolName = school?.name || null;
          const schoolIdStr = school?._id?.toString() || schoolId;
          
          // Prepare file for upload
          const fileExtension = file.originalname.split('.').pop();
          const fileName = `lesson-plan-${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
          
          // Get file content
          const fileContent = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
          
          if (fileContent) {
            // Build S3 key path: schools/{school-name}/lesson-plans/attachments/{filename}
            const s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'lesson-plans', 'attachments', fileName);
            
            // Upload file to S3
            const fileUrl = await uploadBufferToS3(
              this.awsService.getS3Client(),
              this.awsService.getBucketName(),
              s3Key,
              fileContent,
              file.mimetype
            );
            
            attachmentUrls.push(fileUrl);
            
            // Clean up if file was saved to disk
            if (file.path && fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          }
        }
      } catch (fileError) {
        console.error('Error uploading lesson plan file:', fileError);
        // Continue without file if upload fails
      }
    }
    
    // Handle multiple files if provided as array
    if (createLessonPlanDto.files && Array.isArray(createLessonPlanDto.files)) {
      for (const file of createLessonPlanDto.files) {
        try {
          // Similar upload logic for each file
          const teacher = await this.userModel.findById(createLessonPlanDto.teacherId).select('schoolId').lean();
          const course = await this.courseModel.findById(createLessonPlanDto.courseId).select('schoolId').lean();
          const schoolId = (teacher as any)?.schoolId?.toString() || (course as any)?.schoolId?.toString();
          
          if (schoolId) {
            const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
            const schoolName = school?.name || null;
            const schoolIdStr = school?._id?.toString() || schoolId;
            
            const fileExtension = file.originalname.split('.').pop();
            const fileName = `lesson-plan-${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const fileContent = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
            
            if (fileContent) {
              const s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'lesson-plans', 'attachments', fileName);
              const fileUrl = await uploadBufferToS3(
                this.awsService.getS3Client(),
                this.awsService.getBucketName(),
                s3Key,
                fileContent,
                file.mimetype
              );
              attachmentUrls.push(fileUrl);
              
              if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            }
          }
        } catch (fileError) {
          console.error('Error uploading lesson plan file:', fileError);
        }
      }
    }
    
    // Merge existing attachments with new ones
    const existingAttachments = Array.isArray(createLessonPlanDto.attachments) ? createLessonPlanDto.attachments : [];
    const allAttachments = [...existingAttachments, ...attachmentUrls];
    
    const createdLessonPlan = new this.lessonPlanModel({
      ...createLessonPlanDto,
      courseId: new mongoose.Types.ObjectId(createLessonPlanDto.courseId),
      teacherId: new mongoose.Types.ObjectId(createLessonPlanDto.teacherId),
      attachments: allAttachments.length > 0 ? allAttachments : undefined,
      submittedAt: new Date(),
      status: LessonPlanStatus.PENDING,
    });
    
    const savedPlan = await createdLessonPlan.save();
    
    // Log activity
    try {
      const teacher = await this.userModel.findById(createLessonPlanDto.teacherId).select('role').lean();
      const userRole = teacher?.role || 'TEACHER';
      let performByValue = 'TEACHER';
      if (userRole === 'ADMIN') {
        performByValue = 'ADMIN';
      } else if (userRole === 'SUPER_ADMIN') {
        performByValue = 'SUPER_ADMIN';
      }
      
      await this.activityModel.create({
        title: 'Lesson Plan Created',
        subtitle: `Lesson plan "${savedPlan.title}" was created and submitted for review`,
        performBy: performByValue,
        actorId: new Types.ObjectId(createLessonPlanDto.teacherId),
        teacherId: createLessonPlanDto.teacherId.toString(),
      });
    } catch (activityError) {
      console.error('Failed to create activity for lesson plan creation:', activityError);
    }
    
    // Populate the response with course and teacher details
    return this.lessonPlanModel
      .findById(savedPlan._id)
      .populate('courseId', 'courseCode courseName')
      .populate('teacherId', 'firstName lastName')
      .exec();
  }

  async findAll(filters?: any): Promise<LessonPlan[]> {
    try {
      // Apply additional filter to ensure valid ObjectIds
      const enhancedFilters = { ...filters };
      
      // Handle teacherId filter - support both string and ObjectId matching
      if (enhancedFilters.teacherId) {
        if (typeof enhancedFilters.teacherId === 'string' && ValidationUtils.isValidObjectId(enhancedFilters.teacherId)) {
          const mongoose = require('mongoose');
          const teacherObjectId = new mongoose.Types.ObjectId(enhancedFilters.teacherId);
          enhancedFilters.teacherId = {
            $in: [enhancedFilters.teacherId, teacherObjectId]
          };
        } else if (enhancedFilters.teacherId && enhancedFilters.teacherId.$in && Array.isArray(enhancedFilters.teacherId.$in)) {
          // Admin service passes object with $in array of teacher IDs
          const allIds = [];
          enhancedFilters.teacherId.$in.forEach(id => {
            if (id) {
              allIds.push(id);
              // Convert string IDs to ObjectIds if valid
              if (typeof id === 'string' && ValidationUtils.isValidObjectId(id)) {
                const mongoose = require('mongoose');
                allIds.push(new mongoose.Types.ObjectId(id));
              }
            }
          });
          enhancedFilters.teacherId = { $in: allIds };
        } else if (Array.isArray(enhancedFilters.teacherId)) {
          // Handle direct array case
          const mongoose = require('mongoose');
          const allIds = [];
          enhancedFilters.teacherId.forEach(id => {
            if (id) {
              allIds.push(id);
              if (typeof id === 'string' && ValidationUtils.isValidObjectId(id)) {
                allIds.push(new mongoose.Types.ObjectId(id));
              }
            }
          });
          enhancedFilters.teacherId = { $in: allIds };
        } else if (typeof enhancedFilters.teacherId === 'string' && !ValidationUtils.isValidObjectId(enhancedFilters.teacherId)) {
          console.warn('Invalid teacherId in filter, returning empty result');
          return [];
        }
      }
      
      // If filtering by courseId, validate it first
      if (enhancedFilters.courseId && !ValidationUtils.isValidObjectId(enhancedFilters.courseId)) {
        console.warn('Invalid courseId in filter, returning empty result');
        return [];
      }
      
      // Build aggregation pipeline
      const pipeline: any[] = [];
      
      // Add match stage if filters exist
      if (Object.keys(enhancedFilters).length > 0) {
        pipeline.push({ $match: enhancedFilters });
      }
      
      // Add validation stage - accept both string and ObjectId types
      pipeline.push({
        $addFields: {
          isValidCourse: {
            $and: [
              { $ne: ['$courseId', null] },
              { $ne: ['$courseId', ''] },
              { $or: [
                { $eq: [{ $type: '$courseId' }, 'objectId'] },
                { $eq: [{ $type: '$courseId' }, 'string'] }
              ]}
            ]
          },
          isValidTeacher: {
            $and: [
              { $ne: ['$teacherId', null] },
              { $ne: ['$teacherId', ''] },
              { $or: [
                { $eq: [{ $type: '$teacherId' }, 'objectId'] },
                { $eq: [{ $type: '$teacherId' }, 'string'] }
              ]}
            ]
          }
        }
      });
      
      // Filter out invalid documents
      pipeline.push({
        $match: {
          isValidCourse: true,
          isValidTeacher: true
        }
      });
      
      // Remove temporary fields
      pipeline.push({
        $unset: ['isValidCourse', 'isValidTeacher']
      });
      
      // Sort by creation date
      pipeline.push({ $sort: { createdAt: -1 } });
      
      const validPlans = await this.lessonPlanModel.aggregate(pipeline);
      
      if (validPlans.length === 0) {
        return [];
      }
      
      // Get the IDs and populate
      const validIds = validPlans.map(plan => plan._id);
      
      // Convert string IDs to ObjectIds if needed for population to work properly
      const mongoose = require('mongoose');
      
      const populatedPlans = await this.lessonPlanModel
        .find({ _id: { $in: validIds } })
        .populate({
          path: 'courseId',
          select: 'courseCode courseName'
        })
        .populate({
          path: 'teacherId',
          select: 'firstName lastName'
        })
        .populate({
          path: 'reviewedBy',
          select: 'firstName lastName'
        })
        .sort({ createdAt: -1 })
        .exec();
        
      // Filter out lesson plans where population failed, but be more lenient
      const validPopulatedPlans = populatedPlans.filter(plan => {
        const hasValidCourse = plan.courseId && typeof plan.courseId === 'object' && (plan.courseId as any).courseCode;
        const hasValidTeacher = plan.teacherId && typeof plan.teacherId === 'object' && (plan.teacherId as any).firstName;
        
        // For now, let's be more lenient - only require the lesson plan to exist
        // We'll handle display issues on the frontend if needed
        return !!plan._id;
      });
      return validPopulatedPlans;
      
    } catch (error) {
      console.error('Error in findAll:', error);
      // Return empty array instead of throwing to prevent crash
      return [];
    }
  }

  async debugLessonPlans(teacherId: string): Promise<any> {
    try {
      console.log(`Debug: Checking lesson plans for teacher ${teacherId}`);
      
      // Get raw lesson plans without population
      const rawPlans = await this.lessonPlanModel.find({ teacherId }).lean();
      console.log(`Found ${rawPlans.length} raw lesson plans`);
      
      for (const plan of rawPlans) {
        console.log(`Plan ${plan._id}:`, {
          courseId: plan.courseId,
          courseIdType: typeof plan.courseId,
          teacherId: plan.teacherId,
          teacherIdType: typeof plan.teacherId,
          title: plan.title
        });
      }
      
      // Check if referenced courses exist
      const courseIds = rawPlans.map(p => p.courseId);
      const courses = await this.courseModel.find({ _id: { $in: courseIds } });
      console.log(`Found ${courses.length} courses out of ${courseIds.length} referenced`);
      
      const teacherIds = rawPlans.map(p => p.teacherId);
      const teachers = await this.userModel.find({ _id: { $in: teacherIds } });
      console.log(`Found ${teachers.length} teachers out of ${teacherIds.length} referenced`);
      
      // Try population
      const populatedPlans = await this.lessonPlanModel
        .find({ teacherId })
        .populate('courseId', 'courseCode courseName')
        .populate('teacherId', 'firstName lastName')
        .exec();
        
      console.log(`Populated ${populatedPlans.length} lesson plans`);
      
      // Get teacher info to find school
      const teacher = await this.userModel.findById(teacherId).lean();
      
      return {
        teacherInfo: teacher ? {
          name: `${teacher.firstName} ${teacher.lastName}`,
          schoolId: teacher.schoolId,
          email: teacher.email
        } : null,
        rawPlans: rawPlans.length,
        foundCourses: courses.length,
        foundTeachers: teachers.length,
        populatedPlans: populatedPlans.length,
        details: populatedPlans.map(p => ({
          id: p._id,
          title: p.title,
          courseId: p.courseId,
          teacherId: p.teacherId
        }))
      };
    } catch (error) {
      console.error('Debug error:', error);
      throw error;
    }
  }



  async findByStatus(status: LessonPlanStatus): Promise<LessonPlan[]> {
    return this.findAll({ status });
  }

  async findByTeacher(
    teacherId: string,
    page: number = 1,
    limit: number = 10,
    filters?: { courseId?: string; status?: string; search?: string }
  ): Promise<{
    data: LessonPlan[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    // Validate teacherId format using utility
    if (!ValidationUtils.isValidObjectId(teacherId)) {
      console.warn(`Invalid teacherId format: ${teacherId}`);
      return {
        data: [],
        total: 0,
        page: 1,
        totalPages: 0
      };
    }
    
    console.log(`Finding lesson plans for teacher: ${teacherId}`);
    
    try {
      // Try both string and ObjectId matching
      const mongoose = require('mongoose');
      const teacherObjectId = mongoose.Types.ObjectId.isValid(teacherId) 
        ? new mongoose.Types.ObjectId(teacherId) 
        : teacherId;
      
      // Build filter query - always filter by teacherId
      const baseQuery: any = {
        $or: [
          { teacherId: teacherId },
          { teacherId: teacherObjectId }
        ]
      };

      // Apply filters
      if (filters?.courseId && ValidationUtils.isValidObjectId(filters.courseId)) {
        baseQuery.courseId = new mongoose.Types.ObjectId(filters.courseId);
      }

      if (filters?.status) {
        baseQuery.status = filters.status;
      }

      // Build search filter - combine with teacherId filter using $and
      let query: any = baseQuery;
      if (filters?.search && filters.search.trim()) {
        const searchRegex = new RegExp(filters.search.trim(), 'i');
        query = {
          $and: [
            baseQuery,
            {
              $or: [
                { title: searchRegex },
                { description: searchRegex }
              ]
            }
          ]
        };
      }
      
      // Calculate pagination
      const skip = (page - 1) * limit;
      const validLimit = limit > 0 ? limit : 10;
      const validPage = page > 0 ? page : 1;

      // Get total count
      const total = await this.lessonPlanModel.countDocuments(query);
      const totalPages = Math.max(1, Math.ceil(total / validLimit));
      
      // Use direct query with simple population for teacher endpoint
      const lessonPlans = await this.lessonPlanModel
        .find(query)
        .populate('courseId', 'courseCode courseName')
        .populate('teacherId', 'firstName lastName')
        .populate('reviewedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit)
        .lean()
        .exec();
      
      return {
        data: lessonPlans as LessonPlan[],
        total,
        page: validPage,
        totalPages
      };
    } catch (error) {
      console.error('Error in findByTeacher:', error);
      return {
        data: [],
        total: 0,
        page: 1,
        totalPages: 0
      };
    }
  }

  async update(id: string, updateLessonPlanDto: any, teacherId?: string): Promise<LessonPlan> {
    // Validate required fields
    if (!updateLessonPlanDto.courseId || updateLessonPlanDto.courseId.toString().trim() === '') {
      throw new BadRequestException('Course ID is required');
    }
    
    if (!updateLessonPlanDto.title || updateLessonPlanDto.title.trim() === '') {
      throw new BadRequestException('Title is required');
    }

    if (!updateLessonPlanDto.description || updateLessonPlanDto.description.trim() === '') {
      throw new BadRequestException('Description is required');
    }

    if (!updateLessonPlanDto.objectives || !Array.isArray(updateLessonPlanDto.objectives) || updateLessonPlanDto.objectives.length === 0) {
      throw new BadRequestException('At least one objective is required');
    }

    if (!updateLessonPlanDto.materials || !Array.isArray(updateLessonPlanDto.materials) || updateLessonPlanDto.materials.length === 0) {
      throw new BadRequestException('At least one material is required');
    }

    // Check if lesson plan exists and belongs to teacher (if teacherId provided)
    const existingPlan = await this.lessonPlanModel.findById(id);
    if (!existingPlan) {
      throw new NotFoundException('Lesson plan not found');
    }

    if (teacherId && existingPlan.teacherId.toString() !== teacherId.toString()) {
      throw new BadRequestException('You can only update your own lesson plans');
    }

    // Only allow updates if status is pending or revision_required
    if (existingPlan.status !== LessonPlanStatus.PENDING && existingPlan.status !== LessonPlanStatus.REVISION_REQUIRED) {
      throw new BadRequestException('You can only update lesson plans that are pending or require revision');
    }

    const mongoose = require('mongoose');
    let newAttachmentUrls: string[] = [];
    if (updateLessonPlanDto.file || (updateLessonPlanDto.files && updateLessonPlanDto.files.length > 0)) {
      const teacher = await this.userModel.findById(existingPlan.teacherId).select('schoolId').lean();
      const course = await this.courseModel.findById(updateLessonPlanDto.courseId || existingPlan.courseId).select('schoolId').lean();
      const schoolId = (teacher as any)?.schoolId?.toString() || (course as any)?.schoolId?.toString();
      if (schoolId) {
        const school = await this.schoolModel.findById(schoolId).select('name _id').lean();
        const schoolName = school?.name || null;
        const schoolIdStr = school?._id?.toString() || schoolId;
        const filesToUpload = updateLessonPlanDto.file ? [updateLessonPlanDto.file] : (updateLessonPlanDto.files || []);
        for (const file of filesToUpload) {
          try {
            const fileContent = file.buffer || (file.path ? fs.readFileSync(file.path) : null);
            if (fileContent) {
              const fileName = `lesson-plan-${Date.now()}-${Math.random().toString(36).substring(7)}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
              const s3Key = buildS3KeyPath(schoolName, schoolIdStr, 'lesson-plans', 'attachments', fileName);
              const fileUrl = await uploadBufferToS3(this.awsService.getS3Client(), this.awsService.getBucketName(), s3Key, fileContent, file.mimetype);
              newAttachmentUrls.push(fileUrl);
            }
            if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
          } catch (e) {
            console.error('Error uploading lesson plan attachment on update:', e);
          }
        }
      }
    }
    const existingAttachments = Array.isArray(existingPlan.attachments) ? existingPlan.attachments : [];
    const baseAttachments = Array.isArray(updateLessonPlanDto.attachments) ? updateLessonPlanDto.attachments : existingAttachments;
    const mergedAttachments = [...baseAttachments, ...newAttachmentUrls];

    const updateData: any = {
      title: updateLessonPlanDto.title.trim(),
      description: updateLessonPlanDto.description.trim(),
      courseId: new mongoose.Types.ObjectId(updateLessonPlanDto.courseId),
      objectives: updateLessonPlanDto.objectives,
      materials: updateLessonPlanDto.materials,
      duration: updateLessonPlanDto.duration || existingPlan.duration,
      attachments: mergedAttachments.length > 0 ? mergedAttachments : undefined,
    };

    if (existingPlan.status === LessonPlanStatus.REVISION_REQUIRED) {
      updateData.status = LessonPlanStatus.PENDING;
      updateData.reviewComments = [];
    }

    const updated = await this.lessonPlanModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('courseId', 'courseCode courseName')
      .populate('teacherId', 'firstName lastName')
      .exec();

    if (!updated) {
      throw new NotFoundException('Lesson plan not found');
    }

    // Log activity for lesson plan update
    try {
      const actorId = teacherId || existingPlan.teacherId.toString();
      const teacher = await this.userModel.findById(actorId).select('role').lean();
      const userRole = teacher?.role || 'TEACHER';
      let performByValue = 'TEACHER';
      if (userRole === 'ADMIN') {
        performByValue = 'ADMIN';
      } else if (userRole === 'SUPER_ADMIN') {
        performByValue = 'SUPER_ADMIN';
      }
      
      await this.activityModel.create({
        title: 'Lesson Plan Updated',
        subtitle: `Lesson plan "${updated.title}" was updated`,
        performBy: performByValue,
        actorId: new Types.ObjectId(actorId),
        teacherId: actorId.toString(),
      });
    } catch (activityError) {
      console.error('Failed to create activity for lesson plan update:', activityError);
    }

    return updated;
  }

  async remove(id: string, teacherId?: string): Promise<{ message: string }> {
    const existingPlan = await this.lessonPlanModel.findById(id);
    if (!existingPlan) {
      throw new NotFoundException('Lesson plan not found');
    }

    if (teacherId && existingPlan.teacherId.toString() !== teacherId.toString()) {
      throw new BadRequestException('You can only delete your own lesson plans');
    }

    // Store plan title before deletion for activity log
    const planTitle = existingPlan.title;
    const actorId = teacherId || existingPlan.teacherId.toString();

    await this.lessonPlanModel.findByIdAndDelete(id);

    // Log activity for lesson plan deletion
    try {
      const teacher = await this.userModel.findById(actorId).select('role').lean();
      const userRole = teacher?.role || 'TEACHER';
      let performByValue = 'TEACHER';
      if (userRole === 'ADMIN') {
        performByValue = 'ADMIN';
      } else if (userRole === 'SUPER_ADMIN') {
        performByValue = 'SUPER_ADMIN';
      }
      
      await this.activityModel.create({
        title: 'Lesson Plan Deleted',
        subtitle: `Lesson plan "${planTitle}" was deleted`,
        performBy: performByValue,
        actorId: new Types.ObjectId(actorId),
        teacherId: actorId.toString(),
      });
    } catch (activityError) {
      console.error('Failed to create activity for lesson plan deletion:', activityError);
    }

    return { message: 'Lesson plan deleted successfully' };
  }

  async findOne(id: string): Promise<LessonPlan> {
    return this.lessonPlanModel
      .findById(id)
      .populate('courseId', 'courseCode courseName')
      .populate('teacherId', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .exec();
  }

  async updateStatus(
    id: string,
    status: LessonPlanStatus,
    reviewComments: string[] = [],
    reviewedBy?: string,
  ): Promise<LessonPlan> {
    // Convert reviewedBy to ObjectId if it's a string
    const mongoose = require('mongoose');
    const reviewedByObj = reviewedBy && mongoose.Types.ObjectId.isValid(reviewedBy)
      ? new mongoose.Types.ObjectId(reviewedBy)
      : reviewedBy;

    const updateData: any = {
      status,
      reviewComments,
      reviewedAt: new Date(),
    };

    if (reviewedByObj) {
      updateData.reviewedBy = reviewedByObj;
    }

    const updated = await this.lessonPlanModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('courseId', 'courseCode courseName')
      .populate('teacherId', 'firstName lastName')
      .populate('reviewedBy', 'firstName lastName')
      .exec();

    if (!updated) {
      throw new NotFoundException(`Lesson plan with ID ${id} not found`);
    }

    return updated;
  }

  async approve(id: string, comments: string, reviewedBy: string): Promise<LessonPlan> {
    const reviewComments = comments ? [comments] : [];
    return this.updateStatus(id, LessonPlanStatus.APPROVED, reviewComments, reviewedBy);
  }

  async reject(id: string, feedback: string[], reviewedBy: string): Promise<LessonPlan> {
    return this.updateStatus(id, LessonPlanStatus.REJECTED, feedback, reviewedBy);
  }

  async requestRevision(id: string, comments: string[], reviewedBy: string): Promise<LessonPlan> {
    return this.updateStatus(id, LessonPlanStatus.REVISION_REQUIRED, comments, reviewedBy);
  }

  async getPendingCount(): Promise<number> {
    return this.lessonPlanModel.countDocuments({ status: LessonPlanStatus.PENDING });
  }

  async getStatsByTeacher(teacherId: string) {
    console.log(`Getting stats for teacherId: ${teacherId} (type: ${typeof teacherId})`);
    
    // Try both string and ObjectId matching
    const mongoose = require('mongoose');
    const teacherObjectId = mongoose.Types.ObjectId.isValid(teacherId) 
      ? new mongoose.Types.ObjectId(teacherId) 
      : teacherId;
    
    const stats = await this.lessonPlanModel.aggregate([
      { 
        $match: { 
          $or: [
            { teacherId: teacherId },
            { teacherId: teacherObjectId }
          ]
        } 
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);
    
    console.log(`Stats query found ${stats.length} status groups for teacher ${teacherId}`);

    const result = {
      pending: 0,
      approved: 0,
      rejected: 0,
      revision_required: 0,
    };

    stats.forEach((stat) => {
      result[stat._id] = stat.count;
    });

    return result;
  }

  async getStats(schoolId?: string): Promise<any> {
    try {
      const query: any = {};
      
      // If schoolId is provided, filter by school (through teacher's schoolId)
      if (schoolId) {
        const mongoose = require('mongoose');
        const schoolIdObj = mongoose.Types.ObjectId.isValid(schoolId) 
          ? new mongoose.Types.ObjectId(schoolId) 
          : schoolId;
        
        // Get all teachers in this school
        const teachers = await this.userModel.find({ 
          schoolId: schoolIdObj,
          role: 'TEACHER'
        }).select('_id').lean();
        
        const teacherIds = teachers.map(t => t._id);
        
        if (teacherIds.length > 0) {
          query.teacherId = { $in: teacherIds };
        } else {
          // No teachers in this school, return empty stats
          return {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            revision_required: 0
          };
        }
      }

      const stats = await this.lessonPlanModel.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]);

      const result = {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        revision_required: 0,
      };

      stats.forEach((stat) => {
        const status = stat._id || 'pending';
        result[status] = stat.count;
        result.total += stat.count;
      });

      return result;
    } catch (error) {
      console.error('Error getting lesson plan stats:', error);
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        revision_required: 0
      };
    }
  }

  // Cleanup function to remove lesson plans with invalid courseId or teacherId
  async cleanupInvalidLessonPlans(): Promise<{ deletedCount: number }> {
    try {
      console.log('Starting cleanup of invalid lesson plans...');
      
      // Get all lesson plans
      const allPlans = await this.lessonPlanModel.find({}).lean();
      console.log(`Found ${allPlans.length} total lesson plans`);
      
      const invalidPlanIds = [];
      
      for (const plan of allPlans) {
        const isValidCourseId = ValidationUtils.isValidObjectId(plan.courseId?.toString());
        const isValidTeacherId = ValidationUtils.isValidObjectId(plan.teacherId?.toString());
        
        if (!isValidCourseId || !isValidTeacherId) {
          console.log(`Invalid lesson plan found: ${plan._id}`);
          console.log(`  CourseId valid: ${isValidCourseId}, value: ${plan.courseId}`);
          console.log(`  TeacherId valid: ${isValidTeacherId}, value: ${plan.teacherId}`);
          invalidPlanIds.push(plan._id);
        }
      }
      
      if (invalidPlanIds.length > 0) {
        const deleteResult = await this.lessonPlanModel.deleteMany({
          _id: { $in: invalidPlanIds }
        });
        
        console.log(`Deleted ${deleteResult.deletedCount} invalid lesson plans`);
        return { deletedCount: deleteResult.deletedCount };
      } else {
        console.log('No invalid lesson plans found');
        return { deletedCount: 0 };
      }
      
    } catch (error) {
      console.error('Error during cleanup:', error);
      throw error;
    }
  }

  async findAllForAdmin(
    filters: any,
    page: number = 1,
    limit: number = 10
  ): Promise<{
    data: LessonPlan[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const skip = (page - 1) * limit;
      const validLimit = limit > 0 ? limit : 10;
      const validPage = page > 0 ? page : 1;

      // Extract search from filters if present
      const searchTerm = filters.search;
      delete filters.search; // Remove search from filters object

      // Build base query
      const baseQuery: any = { ...filters };

      // Build search query if search is provided
      let searchQuery: any = baseQuery;
      if (searchTerm && searchTerm.trim()) {
        const searchRegex = new RegExp(searchTerm.trim(), 'i');
        const searchCondition = {
          $or: [
            { title: searchRegex },
            { description: searchRegex }
          ]
        };
        
        // Combine base query with search condition
        if (Object.keys(baseQuery).length > 0) {
          searchQuery = {
            $and: [
              baseQuery,
              searchCondition
            ]
          };
        } else {
          searchQuery = searchCondition;
        }
      }

      // Get total count
      const total = await this.lessonPlanModel.countDocuments(searchQuery);

      // Get paginated results
      const lessonPlans = await this.lessonPlanModel
        .find(searchQuery)
        .populate('courseId', 'courseCode courseName')
        .populate({
          path: 'teacherId',
          select: 'firstName lastName schoolId',
          populate: {
            path: 'schoolId',
            select: 'name schoolCode'
          }
        })
        .populate('reviewedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(validLimit)
        .lean()
        .exec();

      const totalPages = Math.max(1, Math.ceil(total / validLimit));

      return {
        data: lessonPlans as LessonPlan[],
        pagination: {
          page: validPage,
          limit: validLimit,
          total,
          totalPages
        }
      };
    } catch (error) {
      console.error('Error in findAllForAdmin:', error);
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0
        }
      };
    }
  }

}
