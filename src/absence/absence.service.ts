import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Absence, AbsenceDocument } from './schema/absence.schema';
import { Student, StudentDocument } from '../student/schema/student.schema';
import { Model, Types } from 'mongoose';
import { CreateAbsenceDto } from './dto/create-absence.dto';

@Injectable()
export class AbsenceService {
  constructor(
    @InjectModel(Absence.name)
    private readonly absenceModel: Model<AbsenceDocument>,
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,
  ) {}

  /**
   * Create a new absence report for a student.
   */
  async create(createAbsenceDto: CreateAbsenceDto): Promise<Absence> {
    // Optionally, validate that the student exists, etc.
    return await this.absenceModel.create({
      ...createAbsenceDto,
      student: new Types.ObjectId(createAbsenceDto.student),
      status: 'pending',
      submittedAt: new Date(),
    });
  }

  /**
   * Submit absence note from parent portal
   */
  async submitAbsenceNote(
    studentId: string,
    absenceDate: string,
    reason: string,
    description: string,
    submittedBy: string,
    schoolId: string,
    academicYear: string,
    supportingDocument?: string,
  ): Promise<Absence> {
    // Validate student exists
    const student = await this.studentModel.findById(studentId);
    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Check if absence note already exists for this date
    const existingNote = await this.absenceModel.findOne({
      student: studentId,
      date: new Date(absenceDate),
      schoolId,
      academicYear,
    });

    if (existingNote) {
      throw new BadRequestException('Absence note already submitted for this date');
    }

    const absenceNote = new this.absenceModel({
      student: studentId,
      date: new Date(absenceDate),
      type: 'full', // Default to full day absence for parent notes
      reason,
      description,
      documentUrl: supportingDocument,
      submittedBy,
      schoolId,
      academicYear,
      status: 'pending',
      submittedAt: new Date(),
    });

    return absenceNote.save();
  }

  /**
   * Get all absences for a given student (by student ObjectId string).
   */
  async findByStudent(studentId: string): Promise<Absence[]> {
    if (!Types.ObjectId.isValid(studentId)) throw new BadRequestException('Invalid studentId');
    return this.absenceModel
      .find({ student: studentId })
      .populate('submittedBy', 'firstName lastName role')
      .populate('reviewedBy', 'firstName lastName role')
      .sort({ date: -1 })
      .exec();
  }

  /**
   * Get all absences for all children of a parent.
   * Useful for parent dashboards (requires ParentService or model).
   */
  async findByParent(parentId: string): Promise<Absence[]> {
    // Get all students for this parent
    const students = await this.studentModel.find({
      parents: parentId,
    }).select('_id');

    const studentIds = students.map(student => student._id);

    return this.absenceModel
      .find({ student: { $in: studentIds } })
      .populate('student', 'firstName lastName studentId class section')
      .populate('submittedBy', 'firstName lastName role')
      .populate('reviewedBy', 'firstName lastName role')
      .sort({ date: -1 })
      .exec();
  }
  
  /**
   * Parent may want to see all absences for all their children, grouped by student.
   */
  async findByParentGrouped(parentId: string): Promise<{ [studentId: string]: Absence[] }> {
    const absences = await this.findByParent(parentId);
    const grouped: { [studentId: string]: Absence[] } = {};
    for (const abs of absences) {
      const sid = abs.student.toString();
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push(abs);
    }
    return grouped;
  }

  /**
   * Get pending absence notes for review
   */
  async getPendingAbsenceNotes(
    schoolId: string,
    academicYear: string,
  ): Promise<Absence[]> {
    return this.absenceModel
      .find({
        status: 'pending',
        schoolId,
        academicYear,
      })
      .populate('student', 'firstName lastName studentId class section')
      .populate('submittedBy', 'firstName lastName role')
      .sort({ submittedAt: -1 })
      .exec();
  }

  /**
   * Review absence note (approve/reject)
   */
  async reviewAbsenceNote(
    noteId: string,
    status: 'approved' | 'rejected',
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<Absence> {
    const absenceNote = await this.absenceModel.findById(noteId);
    if (!absenceNote) {
      throw new NotFoundException('Absence note not found');
    }

    if (absenceNote.status !== 'pending') {
      throw new BadRequestException('Absence note has already been reviewed');
    }

    absenceNote.status = status;
    absenceNote.reviewedBy = reviewedBy as any;
    absenceNote.reviewDate = new Date();
    absenceNote.reviewNotes = reviewNotes;

    return absenceNote.save();
  }

  /**
   * (Optional) Update the status of an absence (e.g., approve/reject by admin).
   */
  async updateStatus(absenceId: string, status: 'pending' | 'approved' | 'rejected'): Promise<Absence> {
    if (!Types.ObjectId.isValid(absenceId)) throw new BadRequestException('Invalid absenceId');
    const absence = await this.absenceModel.findById(absenceId);
    if (!absence) throw new NotFoundException('Absence not found');
    absence.status = status;
    await absence.save();
    return absence;
  }

  /**
   * Get absence statistics
   */
  async getAbsenceStatistics(
    schoolId: string,
    academicYear: string,
    studentId?: string,
  ): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    byReason: { [key: string]: number };
  }> {
    const match: any = { schoolId, academicYear };
    if (studentId) {
      match.student = studentId;
    }

    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          approved: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
          },
          reasons: { $push: '$reason' },
        },
      },
    ];

    const result = await this.absenceModel.aggregate(pipeline);
    
    if (result.length === 0) {
      return {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        byReason: {},
      };
    }

    const stats = result[0];
    const byReason: { [key: string]: number } = {};
    
    stats.reasons.forEach((reason: string) => {
      byReason[reason] = (byReason[reason] || 0) + 1;
    });

    return {
      total: stats.total,
      pending: stats.pending,
      approved: stats.approved,
      rejected: stats.rejected,
      byReason,
    };
  }

  /**
   * (Optional) Get all absences with filters (date range, status, etc).
   */
  async findAll(filters: {
    studentId?: string;
    parentId?: string;
    status?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    page?: number;
  }) {
    const query: any = {};
    if (filters.studentId) query.student = filters.studentId;
    if (filters.status) query.status = filters.status;
    if (filters.fromDate || filters.toDate) {
      query.date = {};
      if (filters.fromDate) query.date.$gte = new Date(filters.fromDate);
      if (filters.toDate) query.date.$lte = new Date(filters.toDate);
    }
  
    let studentIds: string[] = [];
    if (filters.parentId) {
      const students = await this.studentModel.find({
        parents: filters.parentId,
      }).select('_id');

      studentIds = students.map(student => student._id.toString());
      query.student = { $in: studentIds };
    }
  
    const limit = filters.limit ? Number(filters.limit) : 20;
    const skip = filters.page ? (Number(filters.page) - 1) * limit : 0;
  
    return this.absenceModel
      .find(query)
      .populate('student', 'firstName lastName studentId class section')
      .populate('submittedBy', 'firstName lastName role')
      .populate('reviewedBy', 'firstName lastName role')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  /**
   * (Optional) Admin can delete an absence report.
   */
  async delete(absenceId: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(absenceId)) throw new BadRequestException('Invalid absenceId');
    const result = await this.absenceModel.deleteOne({ _id: absenceId });
    return { deleted: result.deletedCount === 1 };
  }
}