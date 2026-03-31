import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ValidationUtils } from '../utils/validation.utils';

@Injectable()
export class DatabaseCleanupService {
  constructor(
    @InjectModel('Teacher') private teacherModel: Model<any>,
    @InjectModel('LessonPlan') private lessonPlanModel: Model<any>,
  ) {}

  async cleanupTeacherAssignedCourses(): Promise<any> {
    try {
      console.log('Starting cleanup of teacher assigned courses...');
      
      const teachers = await this.teacherModel.find({}).lean();
      console.log(`Found ${teachers.length} teachers`);
      
      let updatedCount = 0;
      
      for (const teacher of teachers) {
        if (teacher.assignedCourses && Array.isArray(teacher.assignedCourses)) {
          const validCourseIds = ValidationUtils.filterValidObjectIds(teacher.assignedCourses);
          
          if (validCourseIds.length !== teacher.assignedCourses.length) {
            console.log(`Cleaning teacher ${teacher._id}: ${teacher.assignedCourses.length} -> ${validCourseIds.length} courses`);
            
            await this.teacherModel.updateOne(
              { _id: teacher._id },
              { $set: { assignedCourses: validCourseIds } }
            );
            updatedCount++;
          }
        }
      }
      
      console.log(`Updated ${updatedCount} teachers`);
      return { updatedTeachers: updatedCount };
      
    } catch (error) {
      console.error('Error cleaning teacher assigned courses:', error);
      throw error;
    }
  }

  async cleanupLessonPlans(): Promise<any> {
    try {
      console.log('Starting cleanup of lesson plans...');
      
      const lessonPlans = await this.lessonPlanModel.find({}).lean();
      console.log(`Found ${lessonPlans.length} lesson plans`);
      
      const invalidPlans = [];
      
      for (const plan of lessonPlans) {
        const validCourseId = ValidationUtils.isValidObjectId(plan.courseId?.toString());
        const validTeacherId = ValidationUtils.isValidObjectId(plan.teacherId?.toString());
        
        if (!validCourseId || !validTeacherId) {
          invalidPlans.push(plan._id);
          console.log(`Invalid lesson plan ${plan._id}: courseId=${plan.courseId}, teacherId=${plan.teacherId}`);
        }
      }
      
      if (invalidPlans.length > 0) {
        const deleteResult = await this.lessonPlanModel.deleteMany({
          _id: { $in: invalidPlans }
        });
        console.log(`Deleted ${deleteResult.deletedCount} invalid lesson plans`);
      }
      
      return { 
        totalPlans: lessonPlans.length,
        deletedPlans: invalidPlans.length 
      };
      
    } catch (error) {
      console.error('Error cleaning lesson plans:', error);
      throw error;
    }
  }

  async runFullCleanup(): Promise<any> {
    const teacherCleanup = await this.cleanupTeacherAssignedCourses();
    const lessonPlanCleanup = await this.cleanupLessonPlans();
    
    return {
      teachers: teacherCleanup,
      lessonPlans: lessonPlanCleanup
    };
  }
}
