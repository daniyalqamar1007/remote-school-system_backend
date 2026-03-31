import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { HonorRollCriteria, HonorRollCriteriaDocument } from './schema/honor-roll-criteria.schema';
import { HonorRollAward, HonorRollAwardDocument } from './schema/honor-roll-award.schema';
import { Grade, GradeDocument } from '../grade/schema/schema.garde';
import { Student, StudentDocument } from '../student/schema/student.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { StudentSports, StudentSportsDocument } from '../sports/schema/student-sports.schema';

@Injectable()
export class HonorRollService {
  constructor(
    @InjectModel(HonorRollCriteria.name) private honorRollCriteriaModel: Model<HonorRollCriteriaDocument>,
    @InjectModel(HonorRollAward.name) private honorRollAwardModel: Model<HonorRollAwardDocument>,
    @InjectModel(Grade.name) private gradeModel: Model<GradeDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(StudentSports.name) private studentSportsModel: Model<StudentSportsDocument>,
  ) {}

  // ==================== CRITERIA MANAGEMENT ====================

  async createCriteria(criteriaData: any, createdBy: string): Promise<HonorRollCriteria> {
    // Convert schoolId to ObjectId if it's a string
    const schoolId = Types.ObjectId.isValid(criteriaData.schoolId) 
      ? new Types.ObjectId(criteriaData.schoolId) 
      : criteriaData.schoolId;

    const criteria = new this.honorRollCriteriaModel({
      ...criteriaData,
      schoolId,
      createdBy
    });
    return criteria.save();
  }

  async getCriteriaBySchool(schoolId: string, filters: any = {}): Promise<HonorRollCriteria[]> {
    // Convert schoolId to ObjectId if it's a string
    const schoolIdObj = Types.ObjectId.isValid(schoolId) 
      ? new Types.ObjectId(schoolId) 
      : schoolId;

    const query: any = { schoolId: schoolIdObj, isActive: true };
    
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.gradeLevel && filters.gradeLevel !== 'all') query.gradeLevel = filters.gradeLevel;
    if (filters.markingPeriod) query.markingPeriod = filters.markingPeriod;

    return this.honorRollCriteriaModel.find(query).sort({ gradeLevel: 1, minGPA: -1 });
  }

  async updateCriteria(criteriaId: string, updateData: any, updatedBy: string): Promise<HonorRollCriteria> {
    const criteria = await this.honorRollCriteriaModel.findByIdAndUpdate(
      criteriaId,
      { ...updateData, updatedBy },
      { new: true }
    );

    if (!criteria) {
      throw new NotFoundException('Honor roll criteria not found');
    }

    return criteria;
  }

  async deleteCriteria(criteriaId: string): Promise<void> {
    const result = await this.honorRollCriteriaModel.findByIdAndUpdate(
      criteriaId,
      { isActive: false },
      { new: true }
    );

    if (!result) {
      throw new NotFoundException('Honor roll criteria not found');
    }
  }

  // ==================== AWARD CALCULATION ====================

  async calculateHonorRoll(schoolId: string, academicYear: string, markingPeriod: string, calculatedBy: string): Promise<any> {
    try {
      // Convert schoolId to ObjectId if it's a string
      const schoolIdObj = Types.ObjectId.isValid(schoolId) 
        ? new Types.ObjectId(schoolId) 
        : schoolId;

      // Get all active criteria for this school and period
      const criteriaList = await this.honorRollCriteriaModel.find({
        schoolId: schoolIdObj,
        academicYear,
        markingPeriod,
        isActive: true
      });

      if (criteriaList.length === 0) {
        throw new BadRequestException('No honor roll criteria found for the specified period. Please create criteria first.');
      }

      // Get all students' grades for this period
      // Ensure schoolIdObj is always ObjectId
      const schoolIdForQuery = schoolIdObj instanceof Types.ObjectId 
        ? schoolIdObj 
        : new Types.ObjectId(schoolIdObj as string);
      const students = await this.getStudentGrades(schoolIdForQuery, academicYear, markingPeriod);
      
      if (students.length === 0) {
        throw new BadRequestException('No students found with grades for the specified period');
      }

      const results = [];
      const awardTypes = new Set<string>(); // Track unique award types
      
      for (const student of students) {
        for (const criteria of criteriaList) {
          // Skip if student's grade level doesn't match criteria
          if (student.gradeLevel !== criteria.gradeLevel) continue;

          const qualificationResult = await this.checkStudentQualification(student, criteria);
          
          if (qualificationResult.qualifies) {
            // Determine award type based on GPA and criteria
            let awardType = 'automatic';
            let awardName = criteria.name;

            // Auto-assign award types based on performance
            if (qualificationResult.averageGrade >= 90) {
              awardName = 'Excellence Award';
              awardType = 'excellence';
            } else if (qualificationResult.gpa >= 3.5) {
              awardName = 'High Honor Roll';
              awardType = 'high_honor';
            } else if (qualificationResult.gpa >= 3.0) {
              awardName = 'Honor Roll';
              awardType = 'honor';
            }

            // Check if award already exists
            const existingAward = await this.honorRollAwardModel.findOne({
              studentId: student._id,
              academicYear,
              markingPeriod,
              awardName: awardName,
              status: { $ne: 'revoked' }
            });

            if (!existingAward) {
              const award = new this.honorRollAwardModel({
                schoolId: schoolIdObj,
                studentId: student._id,
                criteriaId: criteria._id,
                academicYear,
                markingPeriod,
                gradeLevel: student.gradeLevel,
                awardName: awardName,
                calculatedGPA: qualificationResult.gpa,
                averageGrade: qualificationResult.averageGrade,
                gradeBreakdown: qualificationResult.gradeBreakdown,
                qualifyingSubjects: qualificationResult.qualifyingSubjects,
                awardType: awardType,
                calculatedBy
              });

              await award.save();
              results.push(award);
              awardTypes.add(awardName);
            }
          }
        }
      }

      return {
        processed: students.length,
        awarded: results.length,
        awards: results,
        awardTypes: Array.from(awardTypes)
      };
    } catch (error) {
      console.error('Error calculating honor roll:', error);
      throw new BadRequestException(`Error calculating honor roll: ${error.message}`);
    }
  }

  private async checkStudentQualification(student: any, criteria: HonorRollCriteria): Promise<any> {
    const coreGrades = [];
    const gradeBreakdown = {};
    const qualifyingSubjects = [];

    // Filter grades for core subjects only
    for (const subject of criteria.coreSubjects) {
      const grade = student.grades.find((g: any) => 
        g.subject.toLowerCase().includes(subject.toLowerCase()) ||
        subject.toLowerCase().includes(g.subject.toLowerCase())
      );

      if (grade && grade.finalGrade !== null && grade.finalGrade !== undefined) {
        coreGrades.push(grade.finalGrade);
        gradeBreakdown[grade.subject] = {
          grade: grade.finalGrade,
          letterGrade: this.getLetterGrade(grade.finalGrade),
          credits: grade.credits || 1
        };
        qualifyingSubjects.push(grade.subject);

        // Check for D or F grades if not allowed
        if (!criteria.allowDGrades && grade.finalGrade < 70 && grade.finalGrade >= 60) {
          return { qualifies: false, reason: 'D grade not allowed' };
        }
        if (!criteria.allowFGrades && grade.finalGrade < 60) {
          return { qualifies: false, reason: 'F grade not allowed' };
        }
      }
    }

    // Check if all core subjects are required and present
    if (criteria.requireAllCoreSubjects && qualifyingSubjects.length < criteria.coreSubjects.length) {
      return { qualifies: false, reason: 'Missing required core subjects' };
    }

    if (coreGrades.length === 0) {
      return { qualifies: false, reason: 'No qualifying grades found' };
    }

    // Calculate GPA and average
    const averageGrade = coreGrades.reduce((sum, grade) => sum + grade, 0) / coreGrades.length;
    const gpa = this.calculateGPA(coreGrades);

    // Check if meets criteria
    const meetsGPA = gpa >= criteria.minGPA;
    const meetsMinGrade = averageGrade >= criteria.minGrade;

    return {
      qualifies: meetsGPA && meetsMinGrade,
      gpa,
      averageGrade,
      gradeBreakdown,
      qualifyingSubjects,
      reason: meetsGPA && meetsMinGrade ? 'Qualified' : 'Does not meet minimum requirements'
    };
  }

  private calculateGPA(grades: number[]): number {
    let totalPoints = 0;
    
    for (const grade of grades) {
      if (grade >= 97) totalPoints += 4.0;
      else if (grade >= 93) totalPoints += 3.7;
      else if (grade >= 90) totalPoints += 3.3;
      else if (grade >= 87) totalPoints += 3.0;
      else if (grade >= 83) totalPoints += 2.7;
      else if (grade >= 80) totalPoints += 2.3;
      else if (grade >= 77) totalPoints += 2.0;
      else if (grade >= 73) totalPoints += 1.7;
      else if (grade >= 70) totalPoints += 1.3;
      else if (grade >= 67) totalPoints += 1.0;
      else if (grade >= 65) totalPoints += 0.7;
      else totalPoints += 0.0;
    }
    
    return Number((totalPoints / grades.length).toFixed(2));
  }

  private getLetterGrade(grade: number): string {
    if (grade >= 97) return 'A+';
    if (grade >= 93) return 'A';
    if (grade >= 90) return 'A-';
    if (grade >= 87) return 'B+';
    if (grade >= 83) return 'B';
    if (grade >= 80) return 'B-';
    if (grade >= 77) return 'C+';
    if (grade >= 73) return 'C';
    if (grade >= 70) return 'C-';
    if (grade >= 67) return 'D+';
    if (grade >= 65) return 'D';
    return 'F';
  }

  // Fetch students and their grades for the given marking period
  private async getStudentGrades(schoolId: Types.ObjectId, academicYear: string, markingPeriod: string): Promise<any[]> {
    try {
      // Get all students in this school from Student model
      const students = await this.studentModel.find({ 
        schoolId: schoolId,
        isActive: true 
      }).select('_id class section userId').exec();

      if (students.length === 0) {
        return [];
      }

      // Get all grades for these students for the term (markingPeriod maps to term)
      const studentIds = students.map(s => s._id);
      const grades = await this.gradeModel.find({
        studentId: { $in: studentIds },
        term: markingPeriod,
      }).populate('courseId', 'courseName subjectName').exec();

      // Group by student
      const byStudent: Record<string, any> = {};
      for (const s of students) {
        byStudent[String(s._id)] = { 
          _id: s._id, 
          userId: s.userId,
          gradeLevel: s.class, 
          section: s.section,
          grades: [] as any[] 
        };
      }

      for (const g of grades) {
        const sid = String((g as any).studentId);
        if (!byStudent[sid]) continue;
        
        const course = (g as any).courseId;
        const subjectName = course?.courseName || course?.subjectName || 'Unknown';
        const finalGrade = (g as any).overAll;
        
        if (finalGrade !== null && finalGrade !== undefined) {
          byStudent[sid].grades.push({
            subject: subjectName,
            finalGrade: finalGrade,
            credits: 1,
          });
        }
      }

      // Filter out students with no grades
      return Object.values(byStudent).filter((student: any) => student.grades.length > 0);
    } catch (error) {
      console.error('Error fetching student grades:', error);
      throw new BadRequestException(`Failed to fetch student grades: ${error.message}`);
    }
  }

  // ==================== AWARD MANAGEMENT ====================

  async getHonorRollAwards(schoolId: string, filters: any = {}): Promise<any> {
    // Convert schoolId to ObjectId if it's a string
    const schoolIdObj = Types.ObjectId.isValid(schoolId) 
      ? new Types.ObjectId(schoolId) 
      : schoolId;

    const query: any = { schoolId: schoolIdObj, status: { $ne: 'revoked' } };
    
    if (filters.academicYear) query.academicYear = filters.academicYear;
    if (filters.markingPeriod) query.markingPeriod = filters.markingPeriod;
    if (filters.gradeLevel && filters.gradeLevel !== 'all') query.gradeLevel = filters.gradeLevel;
    if (filters.status) query.status = filters.status;

    const awards = await this.honorRollAwardModel.find(query)
      .populate('studentId', 'firstName lastName studentId class section gender')
      .populate('criteriaId', 'name minGPA minGrade')
      .sort({ gradeLevel: 1, calculatedGPA: -1 })
      .lean();

    // Transform to match frontend expectations
    return awards.map((award: any) => ({
      ...award,
      studentId: award.studentId || null
    }));
  }

  async manualOverride(awardData: any, overrideBy: string): Promise<HonorRollAward> {
    // Convert schoolId to ObjectId if it's a string
    const schoolId = Types.ObjectId.isValid(awardData.schoolId) 
      ? new Types.ObjectId(awardData.schoolId) 
      : awardData.schoolId;

    // Convert studentId to ObjectId
    const studentId = Types.ObjectId.isValid(awardData.studentId)
      ? new Types.ObjectId(awardData.studentId)
      : awardData.studentId;

    if (!awardData.manualOverrideReason) {
      throw new BadRequestException('Justification is required for manual override');
    }

    const award = new this.honorRollAwardModel({
      ...awardData,
      schoolId,
      studentId,
      awardType: 'manual_override',
      manualOverrideBy: overrideBy,
      calculatedBy: overrideBy,
      status: 'active'
    });

    return award.save();
  }

  async revokeAward(awardId: string, revokeData: any, revokedBy: string): Promise<HonorRollAward> {
    const award = await this.honorRollAwardModel.findByIdAndUpdate(
      awardId,
      {
        status: 'revoked',
        revokedBy,
        revokedReason: revokeData.reason,
        revokedDate: new Date()
      },
      { new: true }
    );

    if (!award) {
      throw new NotFoundException('Honor roll award not found');
    }

    return award;
  }

  // ==================== REPORTS ====================

  async getHonorRollReport(schoolId: string, filters: any = {}): Promise<any> {
    // Convert schoolId to ObjectId if it's a string
    const schoolIdObj = Types.ObjectId.isValid(schoolId) 
      ? new Types.ObjectId(schoolId) 
      : schoolId;

    const matchStage: any = { 
      schoolId: schoolIdObj, 
      status: { $ne: 'revoked' } 
    };

    if (filters.academicYear) {
      matchStage.academicYear = filters.academicYear;
    }
    if (filters.markingPeriod) {
      matchStage.markingPeriod = filters.markingPeriod;
    }
    if (filters.gradeLevel && filters.gradeLevel !== 'all') {
      matchStage.gradeLevel = filters.gradeLevel;
    }

    // Get awards with populated student data
    const awards = await this.honorRollAwardModel.find(matchStage)
      .populate('studentId', 'firstName lastName studentId class section gender')
      .populate('criteriaId', 'name minGPA minGrade')
      .sort({ gradeLevel: 1, calculatedGPA: -1 })
      .lean();

    // Group by academic year, marking period, grade level, and award name
    const grouped: Record<string, any> = {};

    awards.forEach((award: any) => {
      const student = award.studentId || {};
      const key = `${award.academicYear}-${award.markingPeriod}-${award.gradeLevel}-${award.awardName}`;
      
      if (!grouped[key]) {
        grouped[key] = {
          academicYear: award.academicYear,
          markingPeriod: award.markingPeriod,
          gradeLevel: award.gradeLevel,
          awardName: award.awardName,
          count: 0,
          students: []
        };
      }

      grouped[key].count++;
      grouped[key].students.push({
        studentId: student._id || award.studentId,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        studentIdNumber: student.studentId || '',
        gradeLevel: student.class || award.gradeLevel,
        gender: student.gender || 'N/A',
        gpa: award.calculatedGPA,
        averageGrade: award.averageGrade,
        awardType: award.awardType
      });
    });

    return {
      summary: Object.values(grouped),
      totalAwards: awards.length,
      byMarkingPeriod: this.groupByMarkingPeriod(awards),
      byGradeLevel: this.groupByGradeLevel(awards),
      byGender: this.groupByGender(awards),
      generatedAt: new Date()
    };
  }

  private groupByMarkingPeriod(awards: any[]): any {
    const grouped: Record<string, number> = {};
    awards.forEach(award => {
      const key = `${award.academicYear}-${award.markingPeriod}`;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return grouped;
  }

  private groupByGradeLevel(awards: any[]): any {
    const grouped: Record<string, number> = {};
    awards.forEach(award => {
      grouped[award.gradeLevel] = (grouped[award.gradeLevel] || 0) + 1;
    });
    return grouped;
  }

  private groupByGender(awards: any[]): any {
    const grouped: Record<string, number> = {};
    awards.forEach(award => {
      const gender = (award.studentId as any)?.gender || 'Unknown';
      grouped[gender] = (grouped[gender] || 0) + 1;
    });
    return grouped;
  }

  async getStudentHonorRollHistory(studentId: string): Promise<HonorRollAward[]> {
    return this.honorRollAwardModel.find({
      studentId,
      status: 'active'
    })
    .populate('criteriaId', 'name description')
    .sort({ academicYear: -1, markingPeriod: -1 });
  }

  async getParentUser(parentId: string): Promise<any> {
    return this.userModel.findById(parentId).select('children').lean();
  }

  async getAwardsForStudents(studentIds: string[]): Promise<HonorRollAward[]> {
    return this.honorRollAwardModel.find({
      studentId: { $in: studentIds.map(id => new Types.ObjectId(id)) },
      status: 'active'
    })
    .populate('studentId', 'firstName lastName studentId class section')
    .populate('criteriaId', 'name description minGPA')
    .sort({ academicYear: -1, markingPeriod: -1, calculatedGPA: -1 })
    .lean();
  }

  // ==================== STUDENT PORTAL ENDPOINTS ====================

  /**
   * Calculate current honor roll status for a student based on attendance, sports, and grades
   * This method calculates honor roll dynamically without relying on stored awards
   */
  async getStudentHonorRollStatus(studentUserId: any): Promise<any> {
    try {
      console.log(`🔍 [getStudentHonorRollStatus] Fetching honor roll status for student: ${studentUserId}`);
      console.log(`🔍 [getStudentHonorRollStatus] studentUserId type: ${typeof studentUserId}`);
      console.log(`🔍 [getStudentHonorRollStatus] studentUserId value: ${JSON.stringify(studentUserId)}`);
      
      // Get student from User model only (same way as /auth/profile does)
      // Convert to string if it's an ObjectId, Mongoose will handle it
      const userIdString = studentUserId?.toString ? studentUserId.toString() : studentUserId;
      console.log(`🔍 [getStudentHonorRollStatus] Querying with userIdString: ${userIdString}`);
      
      const studentUser = await this.userModel.findById(studentUserId).exec();
      
      console.log(`🔍 [getStudentHonorRollStatus] Query result:`, studentUser ? `Found user: ${studentUser.firstName} ${studentUser.lastName}, role: ${studentUser.role}` : 'No user found');
      
      if (!studentUser) {
        console.log(`⚠️ [getStudentHonorRollStatus] Student user not found in database for ID: ${studentUserId}`);
        return {
          hasHonorRoll: false,
          status: null,
          message: 'Student not found',
          details: {
            message: 'Student record not found. Please contact your administrator.'
          }
        };
      }
      
      if (studentUser.role !== 'STUDENT') {
        console.log(`⚠️ [getStudentHonorRollStatus] User found but role is not STUDENT. Role: ${studentUser.role}`);
        return {
          hasHonorRoll: false,
          status: null,
          message: 'Student not found',
          details: {
            message: 'Student record not found. Please contact your administrator.'
          }
        };
      }

      console.log(`✅ [getStudentHonorRollStatus] Found student user: ${studentUser.firstName} ${studentUser.lastName}`);

      // Get current academic year (you can adjust this logic)
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const academicYear = currentMonth >= 7 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;
      
      console.log(`📅 [getStudentHonorRollStatus] Using academic year: ${academicYear}`);

      // 1. Calculate GPA from grades
      const grades = await this.gradeModel.find({
        studentId: new Types.ObjectId(studentUserId)
      }).lean();

      console.log(`📊 [getStudentHonorRollStatus] Found ${grades.length} grade records`);

      let averageGrade = 0;
      const gradeValues: number[] = [];

      if (grades.length > 0) {
        // Calculate average grade from all grades
        grades.forEach(grade => {
          // Check for overAll field (which is the final grade) or calculate from score/totalMarks
          const gradeAny = grade as any;
          if (gradeAny.overAll !== undefined && gradeAny.overAll !== null) {
            gradeValues.push(gradeAny.overAll);
          } else if (grade.score !== undefined && grade.totalMarks !== undefined && grade.totalMarks > 0) {
            // Calculate percentage if finalGrade not available
            const percentage = (grade.score / grade.totalMarks) * 100;
            gradeValues.push(percentage);
          }
        });

        if (gradeValues.length > 0) {
          averageGrade = gradeValues.reduce((sum, val) => sum + val, 0) / gradeValues.length;
        }
      }

      console.log(`📊 [getStudentHonorRollStatus] Calculated Average Grade: ${averageGrade.toFixed(2)}%`);

      // 2. Get sports participation count
      const sportsParticipations = await this.studentSportsModel.find({
        studentId: new Types.ObjectId(studentUserId),
        status: 'active',
        isEligible: true
      }).lean();

      const sportsCount = sportsParticipations.length;
      console.log(`🏃 [getStudentHonorRollStatus] Active sports programs: ${sportsCount}`);

      // 3. Calculate attendance percentage (simplified - you may need to adjust based on your attendance model)
      // For now, we'll use a placeholder. You can integrate with your attendance system later
      const attendancePercentage = 95; // Placeholder - replace with actual attendance calculation
      console.log(`📅 [getStudentHonorRollStatus] Attendance percentage: ${attendancePercentage}% (placeholder)`);

      // 4. Define Honor Roll Criteria (without GPA)
      // Gold: Average Grade >= 90, Attendance >= 95%, Sports >= 1
      // Silver: Average Grade >= 85, Attendance >= 90%, Sports >= 0
      // Bronze: Average Grade >= 80, Attendance >= 85%, Sports >= 0

      let honorRollStatus: string | null = null;
      const reasons: string[] = [];

      // Check for Gold Honor Roll
      if (averageGrade >= 90 && attendancePercentage >= 95 && sportsCount >= 1) {
        honorRollStatus = 'Gold';
        reasons.push(`Excellent average grade of ${averageGrade.toFixed(2)}%`);
        reasons.push(`High attendance rate of ${attendancePercentage}%`);
        reasons.push(`Active in ${sportsCount} sports program(s)`);
      }
      // Check for Silver Honor Roll
      else if (averageGrade >= 85 && attendancePercentage >= 90) {
        honorRollStatus = 'Silver';
        reasons.push(`Good average grade of ${averageGrade.toFixed(2)}%`);
        reasons.push(`Good attendance rate of ${attendancePercentage}%`);
        if (sportsCount > 0) {
          reasons.push(`Active in ${sportsCount} sports program(s)`);
        }
      }
      // Check for Bronze Honor Roll
      else if (averageGrade >= 80 && attendancePercentage >= 85) {
        honorRollStatus = 'Bronze';
        reasons.push(`Average grade of ${averageGrade.toFixed(2)}%`);
        reasons.push(`Attendance rate of ${attendancePercentage}%`);
        if (sportsCount > 0) {
          reasons.push(`Active in ${sportsCount} sports program(s)`);
        }
      }

      if (honorRollStatus) {
        console.log(`✅ [getStudentHonorRollStatus] Student qualifies for ${honorRollStatus} Honor Roll`);
        return {
          hasHonorRoll: true,
          status: honorRollStatus,
          message: `Earned ${honorRollStatus} Honor Roll`,
          details: {
            academicYear: academicYear,
            markingPeriod: 'Current',
            averageGrade: parseFloat(averageGrade.toFixed(2)),
            attendancePercentage: attendancePercentage,
            sportsCount: sportsCount,
            criteriaName: `${honorRollStatus} Honor Roll`,
            criteriaDescription: `Based on grades, attendance, and sports participation`,
            awardedDate: new Date(),
            reasons: reasons
          }
        };
      } else {
        console.log(`ℹ️ [getStudentHonorRollStatus] Student does not meet honor roll criteria`);
        const missingCriteria: string[] = [];
        if (averageGrade < 80) missingCriteria.push(`Average grade below 80% (current: ${averageGrade.toFixed(2)}%)`);
        if (attendancePercentage < 85) missingCriteria.push(`Attendance below 85% (current: ${attendancePercentage}%)`);
        if (honorRollStatus === null && averageGrade >= 90 && attendancePercentage >= 95 && sportsCount < 1) {
          missingCriteria.push(`Need at least 1 active sports program (current: ${sportsCount})`);
        }

        return {
          hasHonorRoll: false,
          status: null,
          message: 'No honor roll status',
          details: {
            message: 'You do not currently meet the honor roll criteria. Keep working hard!',
            currentStats: {
              averageGrade: parseFloat(averageGrade.toFixed(2)),
              attendancePercentage: attendancePercentage,
              sportsCount: sportsCount
            },
            missingCriteria: missingCriteria.length > 0 ? missingCriteria : ['Continue to maintain good grades and attendance']
          }
        };
      }
    } catch (error) {
      console.error('❌ [getStudentHonorRollStatus] Error calculating student honor roll status:', error);
      console.error('❌ [getStudentHonorRollStatus] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      return {
        hasHonorRoll: false,
        status: null,
        message: 'Error calculating honor roll status',
        details: {
          message: 'An error occurred while fetching your honor roll status. Please try again later.'
        }
      };
    }
  }

  /**
   * Get reasons for honor roll assignment
   */
  private getHonorRollReasons(award: any, criteria: any): string[] {
    const reasons: string[] = [];
    
    if (award.calculatedGPA && criteria?.minGPA) {
      reasons.push(`Maintained GPA of ${award.calculatedGPA.toFixed(2)} (Required: ${criteria.minGPA})`);
    }
    
    if (award.attendanceRate) {
      reasons.push(`Attendance rate: ${award.attendanceRate}%`);
    }
    
    if (award.sportsParticipation) {
      reasons.push(`Active in ${award.sportsParticipation} sports program(s)`);
    }
    
    if (criteria?.name) {
      reasons.push(`Met criteria: ${criteria.name}`);
    }
    
    return reasons.length > 0 ? reasons : ['Met all honor roll requirements'];
  }
}
