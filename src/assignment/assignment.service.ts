import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Assignment, AssignmentDocument } from './schema/assignment.schema';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class AssignmentService {
  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>
  ) {}

  async create(dto: CreateAssignmentDto) {
    const assignment = new this.assignmentModel({
      ...dto,
      students: dto.students.map(id => new Types.ObjectId(id))
    });
    // Initialize studentStatuses
    assignment.studentStatuses = dto.students.map(id => ({
      student: new Types.ObjectId(id),
      status: "upcoming"
    }));
    return assignment.save();
  }

  async findByStudent(studentId: string) {
    const assignments = await this.assignmentModel
      .find({ students: new Types.ObjectId(studentId) })
      .sort({ dueDate: 1 })
      .lean();

    // Attach per-student status:
    return assignments.map(a => {
      const stuStatus = (a.studentStatuses || []).find(s =>
        String(s.student) === String(studentId)
      ) || { status: 'upcoming' };
      return {
        ...a,
        status: stuStatus.status,
        grade: stuStatus.grade,
        feedback: stuStatus.feedback,
        studentStatus: stuStatus,
      };
    });
  }

  async updateStudentStatus(assignmentId: string, dto: UpdateStatusDto) {
    const assignment = await this.assignmentModel.findById(assignmentId);
    if (!assignment) throw new NotFoundException('Assignment not found');

    const idx = assignment.studentStatuses.findIndex(
      s => String(s.student) === String(dto.studentId)
    );
    if (idx === -1) throw new NotFoundException('Student not found in assignment');

    assignment.studentStatuses[idx].status = dto.status;
    if (dto.status === 'graded') {
      assignment.studentStatuses[idx].grade = {
        score: dto.score,
        outOf: dto.outOf,
        feedback: dto.feedback,
      };
    }
    await assignment.save();
    return assignment;
  }
}