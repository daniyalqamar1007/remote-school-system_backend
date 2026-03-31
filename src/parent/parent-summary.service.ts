import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Student, StudentDocument } from '../student/schema/student.schema';

@Injectable()
export class ParentSummaryService {
  constructor(
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
  ) {}

  async getStudentSummary(studentId: string, schoolId: string, academicYear: string) {
    const student = await this.studentModel.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Return basic student summary with mock data for now
    // In a real implementation, you would query the respective collections
    return {
      student: {
        _id: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.class || 'N/A',
        class: student.class || 'N/A',
        studentId: student.studentId,
        email: student.email,
        phone: student.phone
      },
      academics: {
        currentGPA: 3.5,
        totalCredits: 24,
        earnedCredits: 20,
        subjects: [
          { name: 'Mathematics', grade: 'A', percentage: 92, credits: 4 },
          { name: 'English', grade: 'B+', percentage: 87, credits: 4 },
          { name: 'Science', grade: 'A-', percentage: 91, credits: 4 },
          { name: 'History', grade: 'B', percentage: 85, credits: 3 },
        ]
      },
      attendance: {
        totalDays: 180,
        presentDays: 172,
        absentDays: 8,
        tardyDays: 3,
        attendanceRate: 95.6,
        recentAbsences: [
          { date: '2024-01-15', reason: 'Sick', status: 'approved' },
          { date: '2024-01-10', reason: 'Medical appointment', status: 'approved' }
        ]
      },
      behavior: {
        totalIncidents: 1,
        recentIncidents: [
          { date: '2024-01-05', type: 'Tardiness', severity: 'low', description: 'Late to class' }
        ],
        disciplinaryActions: 0
      },
      activities: {
        clubs: ['Chess Club', 'Science Club'],
        sports: ['Basketball'],
        achievements: [
          { title: 'Honor Roll', date: '2024-01-01', category: 'Academic' },
          { title: 'Science Fair Winner', date: '2023-12-15', category: 'Academic' }
        ]
      },
      honorRoll: {
        isEligible: true,
        quarterlyStatus: [
          { quarter: 'Q1', status: 'achieved', gpa: 3.8 },
          { quarter: 'Q2', status: 'achieved', gpa: 3.6 }
        ]
      },
      assignments: {
        total: 25,
        submitted: 23,
        pending: 2,
        overdue: 0,
        submissionRate: 92.0
      }
    };
  }
}
