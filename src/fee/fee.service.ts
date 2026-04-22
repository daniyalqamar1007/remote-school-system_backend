import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { FeePolicy, FeePolicyDocument } from './schema/fee-policy.schema';
import { StudentFeeDiscount, StudentFeeDiscountDocument } from './schema/student-fee-discount.schema';
import { FeeInstallment, FeeInstallmentDocument } from './schema/fee-installment.schema';
import { FeePayment, FeePaymentDocument } from './schema/fee-payment.schema';
import { FeeReminderLog, FeeReminderLogDocument } from './schema/fee-reminder-log.schema';
import { Student, StudentDocument } from '../student/schema/student.schema';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { Parent, ParentDocument } from '../parent/schema/parent.schema';
import { Alert, AlertDocument } from '../alert/schema/alert.schema';
import { EmailService } from '../email/email.service';
import { CreateFeePolicyDto } from './dto/create-fee-policy.dto';
import { UpdateFeePolicyDto } from './dto/update-fee-policy.dto';
import { UpsertStudentDiscountDto } from './dto/upsert-student-discount.dto';
import { GenerateInstallmentsDto } from './dto/generate-installments.dto';
import { RecordFeePaymentDto } from './dto/record-fee-payment.dto';
import { ManualClearanceDto } from './dto/manual-clearance.dto';

@Injectable()
export class FeeService {
  constructor(
    @InjectModel(FeePolicy.name) private feePolicyModel: Model<FeePolicyDocument>,
    @InjectModel(StudentFeeDiscount.name) private studentDiscountModel: Model<StudentFeeDiscountDocument>,
    @InjectModel(FeeInstallment.name) private feeInstallmentModel: Model<FeeInstallmentDocument>,
    @InjectModel(FeePayment.name) private feePaymentModel: Model<FeePaymentDocument>,
    @InjectModel(FeeReminderLog.name) private feeReminderLogModel: Model<FeeReminderLogDocument>,
    @InjectModel(Student.name) private studentModel: Model<StudentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Parent.name) private parentModel: Model<ParentDocument>,
    @InjectModel(Alert.name) private alertModel: Model<AlertDocument>,
    private readonly emailService: EmailService,
  ) {}

  private resolveSchoolId(user: any, requestedSchoolId?: string): Types.ObjectId {
    const role = user?.role;
    if (role === UserRole.SUPER_ADMIN) {
      const sid = requestedSchoolId || user?.schoolId;
      if (!sid || !Types.ObjectId.isValid(sid)) {
        throw new BadRequestException('Valid schoolId is required for SUPER_ADMIN');
      }
      return new Types.ObjectId(sid);
    }

    if (!user?.schoolId || !Types.ObjectId.isValid(user.schoolId)) {
      throw new BadRequestException('User schoolId not found');
    }
    return new Types.ObjectId(user.schoolId);
  }

  private toObjectId(id: string, field: string): Types.ObjectId {
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`Invalid ${field}`);
    }
    return new Types.ObjectId(id);
  }

  private calculateDiscount(baseFee: number, discount?: StudentFeeDiscountDocument | null): number {
    if (!discount || !discount.isActive) return 0;
    if (discount.discountType === 'percentage') {
      return Math.max(0, (baseFee * Number(discount.discountValue || 0)) / 100);
    }
    return Math.max(0, Number(discount.discountValue || 0));
  }

  private calculatePenalty(installment: any, policy: any, now = new Date()) {
    const dueDate = new Date(installment.dueDate);
    const graceDays = Number(policy?.graceDays || 0);
    const graceDate = new Date(dueDate);
    graceDate.setDate(graceDate.getDate() + graceDays);

    const principal = Math.max(0, Number(installment.installmentAmount || 0) - Number(installment.discountAmount || 0));
    if (now <= graceDate) {
      return { lateFee: 0, fine: 0, totalDue: Math.max(0, principal - Number(installment.paidAmount || 0)), overdueDays: 0 };
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    const overdueDays = Math.max(1, Math.floor((now.getTime() - graceDate.getTime()) / msPerDay));

    let lateFee = 0;
    if (policy?.lateFeeType === 'percentage') {
      lateFee = (principal * Number(policy?.lateFeeValue || 0)) / 100;
    } else {
      lateFee = Number(policy?.lateFeeValue || 0);
    }

    let fine = 0;
    if (policy?.fineType === 'daily') {
      fine = Number(policy?.fineValue || 0) * overdueDays;
    } else if (policy?.fineType === 'percentage') {
      fine = (principal * Number(policy?.fineValue || 0)) / 100;
    } else {
      fine = Number(policy?.fineValue || 0);
    }

    const maxFineCap = Number(policy?.maxFineCap || 0);
    if (maxFineCap > 0) {
      fine = Math.min(fine, maxFineCap);
    }

    const totalDue = Math.max(0, principal + lateFee + fine - Number(installment.paidAmount || 0));
    return { lateFee, fine, totalDue, overdueDays };
  }

  private parseAcademicYearStart(academicYear: string): number {
    const yearPart = String(academicYear || '').split('-')[0];
    const year = Number(yearPart);
    return Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
  }

  async createPolicy(dto: CreateFeePolicyDto, user: any) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);

    if (dto.isActive !== false) {
      await this.feePolicyModel.updateMany(
        {
          schoolId,
          academicYear: dto.academicYear,
          className: dto.className,
          isActive: true,
        },
        { $set: { isActive: false, updatedBy: user?._id } },
      );
    }

    const created = await this.feePolicyModel.create({
      ...dto,
      schoolId,
      isActive: dto.isActive !== false,
      createdBy: user?._id,
      updatedBy: user?._id,
    });

    return { success: true, message: 'Fee policy created', data: created };
  }

  async getPolicies(user: any, filters: any) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const query: any = { schoolId };

    if (filters?.academicYear) query.academicYear = filters.academicYear;
    if (filters?.className) query.className = filters.className;
    if (filters?.isActive === 'true') query.isActive = true;
    if (filters?.isActive === 'false') query.isActive = false;

    const items = await this.feePolicyModel.find(query).sort({ createdAt: -1 }).lean();
    return { success: true, data: items };
  }

  async updatePolicy(id: string, dto: UpdateFeePolicyDto, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const schoolId = this.resolveSchoolId(user, dto.schoolId);

    const existing = await this.feePolicyModel.findById(policyId);
    if (!existing) throw new NotFoundException('Fee policy not found');
    if (String(existing.schoolId) !== String(schoolId)) {
      throw new BadRequestException('Policy does not belong to selected school');
    }

    if (dto.isActive === true) {
      await this.feePolicyModel.updateMany(
        {
          schoolId,
          academicYear: dto.academicYear || existing.academicYear,
          className: dto.className || existing.className,
          _id: { $ne: existing._id },
          isActive: true,
        },
        { $set: { isActive: false, updatedBy: user?._id } },
      );
    }

    const updated = await this.feePolicyModel.findByIdAndUpdate(
      policyId,
      { ...dto, updatedBy: user?._id },
      { new: true },
    );

    return { success: true, message: 'Fee policy updated', data: updated };
  }

  async deactivatePolicy(id: string, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const existing = await this.feePolicyModel.findById(policyId);
    if (!existing) throw new NotFoundException('Fee policy not found');

    this.resolveSchoolId(user, String(existing.schoolId));

    const updated = await this.feePolicyModel.findByIdAndUpdate(
      policyId,
      { isActive: false, updatedBy: user?._id },
      { new: true },
    );

    return { success: true, message: 'Fee policy deactivated', data: updated };
  }

  async upsertStudentDiscount(dto: UpsertStudentDiscountDto, user: any) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);
    const studentId = this.toObjectId(dto.studentId, 'studentId');
    const feePolicyId = this.toObjectId(dto.feePolicyId, 'feePolicyId');

    const student = await this.studentModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');

    const policy = await this.feePolicyModel.findById(feePolicyId).lean();
    if (!policy) throw new NotFoundException('Fee policy not found');

    const updateData: any = {
      schoolId,
      studentId,
      feePolicyId,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      reason: dto.reason,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      isActive: dto.isActive !== false,
      approvedBy: user?._id,
    };

    const discount = await this.studentDiscountModel.findOneAndUpdate(
      { schoolId, studentId, feePolicyId },
      { $set: updateData },
      { new: true, upsert: true },
    );

    return { success: true, message: 'Student discount saved', data: discount };
  }

  async getDiscounts(user: any, filters: any) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const query: any = { schoolId };

    if (filters?.studentId && Types.ObjectId.isValid(filters.studentId)) {
      query.studentId = new Types.ObjectId(filters.studentId);
    }
    if (filters?.feePolicyId && Types.ObjectId.isValid(filters.feePolicyId)) {
      query.feePolicyId = new Types.ObjectId(filters.feePolicyId);
    }

    const items = await this.studentDiscountModel
      .find(query)
      .populate('studentId', 'firstName lastName class studentId')
      .populate('feePolicyId', 'className academicYear baseFee')
      .sort({ createdAt: -1 })
      .lean();

    return { success: true, data: items };
  }

  private async getActiveDiscount(studentId: Types.ObjectId, feePolicyId: Types.ObjectId, onDate = new Date()) {
    return this.studentDiscountModel.findOne({
      studentId,
      feePolicyId,
      isActive: true,
      $or: [
        { effectiveFrom: { $exists: false }, effectiveTo: { $exists: false } },
        { effectiveFrom: { $lte: onDate }, effectiveTo: { $exists: false } },
        { effectiveFrom: { $exists: false }, effectiveTo: { $gte: onDate } },
        { effectiveFrom: { $lte: onDate }, effectiveTo: { $gte: onDate } },
      ],
    });
  }

  async generateInstallments(dto: GenerateInstallmentsDto, user: any) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);
    const studentFilter: any = { schoolId };

    if (dto.studentId) {
      studentFilter._id = this.toObjectId(dto.studentId, 'studentId');
    }
    if (dto.className) {
      studentFilter.class = dto.className;
    }

    const students = await this.studentModel.find(studentFilter).lean();
    if (students.length === 0) {
      return { success: true, message: 'No students found for installment generation', data: { generated: 0, skipped: 0 } };
    }

    let generated = 0;
    let skipped = 0;

    for (const student of students) {
      const policy = await this.feePolicyModel.findOne({
        schoolId,
        academicYear: dto.academicYear,
        className: student.class,
        isActive: true,
      }).lean();

      if (!policy) {
        skipped += 1;
        continue;
      }

      const existingCount = await this.feeInstallmentModel.countDocuments({
        schoolId,
        studentId: student._id,
        academicYear: dto.academicYear,
      });

      if (existingCount > 0) {
        skipped += 1;
        continue;
      }

      const totalInstallments = policy.installmentFrequency === 'monthly' ? 12 : 1;
      const basePerInstallment = Number((policy.baseFee / totalInstallments).toFixed(2));
      const discount = await this.getActiveDiscount(student._id as any, policy._id as any);
      const totalDiscount = this.calculateDiscount(policy.baseFee, discount);
      const discountPerInstallment = Number((totalDiscount / totalInstallments).toFixed(2));
      const startYear = this.parseAcademicYearStart(dto.academicYear);

      const docs: any[] = [];
      for (let i = 0; i < totalInstallments; i += 1) {
        const dueDate = policy.installmentFrequency === 'monthly'
          ? new Date(startYear, i, Number(policy.dueDay || 5))
          : new Date(startYear, 0, Number(policy.dueDay || 5));

        docs.push({
          schoolId,
          studentId: student._id,
          feePolicyId: policy._id,
          academicYear: dto.academicYear,
          installmentNo: i + 1,
          installmentAmount: basePerInstallment,
          discountAmount: discountPerInstallment,
          paidAmount: 0,
          dueDate,
          status: 'pending',
        });
      }

      if (docs.length > 0) {
        await this.feeInstallmentModel.insertMany(docs, { ordered: false });
        generated += docs.length;
      }
    }

    return {
      success: true,
      message: 'Installment generation complete',
      data: { generated, skippedStudents: skipped },
    };
  }

  async getInstallments(user: any, filters: any) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const query: any = { schoolId };

    if (filters?.studentId && Types.ObjectId.isValid(filters.studentId)) {
      query.studentId = new Types.ObjectId(filters.studentId);
    }
    if (filters?.academicYear) query.academicYear = filters.academicYear;
    if (filters?.status) query.status = filters.status;

    if (filters?.className) {
      const classStudents = await this.studentModel.find({ schoolId, class: filters.className }).select('_id').lean();
      query.studentId = { $in: classStudents.map((s: any) => s._id) };
    }

    const items = await this.feeInstallmentModel
      .find(query)
      .populate('studentId', 'firstName lastName class studentId email')
      .populate('feePolicyId')
      .sort({ dueDate: 1 })
      .lean();

    const mapped = items.map((item: any) => {
      const policy = item.feePolicyId;
      const penalty = this.calculatePenalty(item, policy, new Date());
      const computedStatus = item.status === 'paid' || item.status === 'waived'
        ? item.status
        : penalty.overdueDays > 0
          ? (item.paidAmount > 0 ? 'partial' : 'overdue')
          : (item.paidAmount > 0 ? 'partial' : 'pending');

      return {
        ...item,
        lateFeeComputed: Number(penalty.lateFee.toFixed(2)),
        fineComputed: Number(penalty.fine.toFixed(2)),
        totalDue: Number(penalty.totalDue.toFixed(2)),
        computedStatus,
      };
    });

    return { success: true, data: mapped };
  }

  async recordPayment(installmentId: string, dto: RecordFeePaymentDto, user: any) {
    const iid = this.toObjectId(installmentId, 'installmentId');
    const installment = await this.feeInstallmentModel.findById(iid);
    if (!installment) throw new NotFoundException('Installment not found');

    this.resolveSchoolId(user, String(installment.schoolId));

    const policy = await this.feePolicyModel.findById(installment.feePolicyId).lean();
    if (!policy) throw new NotFoundException('Fee policy not found');

    const penalty = this.calculatePenalty(installment.toObject(), policy, new Date());
    if (dto.amount > penalty.totalDue) {
      throw new BadRequestException('Payment amount is greater than payable due amount');
    }

    await this.feePaymentModel.create({
      schoolId: installment.schoolId,
      studentId: installment.studentId,
      installmentId: installment._id,
      amount: dto.amount,
      paymentMode: dto.paymentMode,
      referenceNo: dto.referenceNo,
      note: dto.note,
      recordedBy: user?._id,
    });

    installment.paidAmount = Number((Number(installment.paidAmount || 0) + Number(dto.amount || 0)).toFixed(2));

    const recomputed = this.calculatePenalty(installment.toObject(), policy, new Date());
    if (recomputed.totalDue <= 0) {
      installment.status = 'paid';
      installment.paidAt = new Date();
    } else if (installment.paidAmount > 0) {
      installment.status = recomputed.overdueDays > 0 ? 'partial' : 'partial';
    } else {
      installment.status = recomputed.overdueDays > 0 ? 'overdue' : 'pending';
    }

    installment.lateFeeApplied = Number(recomputed.lateFee.toFixed(2));
    installment.fineApplied = Number(recomputed.fine.toFixed(2));

    await installment.save();

    return { success: true, message: 'Payment recorded', data: installment };
  }

  async manualClearance(installmentId: string, dto: ManualClearanceDto, user: any) {
    const iid = this.toObjectId(installmentId, 'installmentId');
    const installment = await this.feeInstallmentModel.findById(iid);
    if (!installment) throw new NotFoundException('Installment not found');

    this.resolveSchoolId(user, String(installment.schoolId));

    const policy = await this.feePolicyModel.findById(installment.feePolicyId).lean();
    if (!policy) throw new NotFoundException('Fee policy not found');

    if (dto.status === 'paid') {
      const penalty = this.calculatePenalty(installment.toObject(), policy, new Date());
      installment.paidAmount = Number((
        Number(installment.installmentAmount || 0) - Number(installment.discountAmount || 0) + penalty.lateFee + penalty.fine
      ).toFixed(2));
      installment.status = 'paid';
      installment.paidAt = new Date();
      installment.lateFeeApplied = Number(penalty.lateFee.toFixed(2));
      installment.fineApplied = Number(penalty.fine.toFixed(2));
    } else {
      installment.status = 'waived';
      installment.paidAmount = Number(installment.paidAmount || 0);
    }

    installment.clearedBy = user?._id;
    installment.clearedAt = new Date();
    installment.clearanceNote = dto.note;

    await installment.save();

    return { success: true, message: 'Manual clearance updated', data: installment };
  }

  private reminderDateKeyForInstallment(installment: any, date: Date): string {
    return `${installment._id.toString()}-${date.toISOString().slice(0, 10)}`;
  }

  async runSevenDayReminders(user: any, requestedSchoolId?: string) {
    const schoolId = this.resolveSchoolId(user, requestedSchoolId);
    const now = new Date();
    const target = new Date(now);
    target.setDate(target.getDate() + 7);

    const dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);

    const installments = await this.feeInstallmentModel
      .find({
        schoolId,
        dueDate: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ['pending', 'partial', 'overdue'] },
      })
      .populate('studentId', 'firstName lastName email class userId parents')
      .populate('feePolicyId')
      .lean();

    let sent = 0;
    let skipped = 0;

    for (const installment of installments as any[]) {
      const reminderDateKey = this.reminderDateKeyForInstallment(installment, dayStart);
      const existing = await this.feeReminderLogModel.findOne({ installmentId: installment._id, reminderDateKey }).lean();
      if (existing) {
        skipped += 1;
        continue;
      }

      const student = installment.studentId;
      const policy = installment.feePolicyId;
      const penalty = this.calculatePenalty(installment, policy, now);

      const title = 'Fee installment reminder';
      const description = `Installment ${installment.installmentNo} is due on ${new Date(installment.dueDate).toDateString()}. Total due: ${penalty.totalDue.toFixed(2)} ${policy?.currency || 'USD'}.`;

      let studentEmailSent = false;
      let parentEmailSent = false;
      let parentAlertCreated = false;

      if (student?.email) {
        await this.emailService.sendEmail(
          student.email,
          title,
          description,
          `<p>${description}</p>`,
        );
        studentEmailSent = true;
      }

      const parentIds = Array.isArray(student?.parents) ? student.parents : [];
      if (parentIds.length > 0) {
        const parents = await this.parentModel
          .find({ _id: { $in: parentIds.map((x: any) => new Types.ObjectId(String(x))) } })
          .populate('userId', 'email firstName lastName')
          .lean();

        const alerts: any[] = [];
        for (const parent of parents as any[]) {
          const parentUser = parent.userId as any;
          if (parentUser?.email) {
            await this.emailService.sendEmail(
              parentUser.email,
              title,
              description,
              `<p>${description}</p>`,
            );
            parentEmailSent = true;
          }

          if (parentUser?._id) {
            alerts.push({
              parentId: new Types.ObjectId(String(parentUser._id)),
              title,
              description,
              studentId: installment.studentId?._id || installment.studentId,
              alertType: 'fee',
              schoolId,
              read: false,
            });
          }
        }

        if (alerts.length > 0) {
          await this.alertModel.insertMany(alerts);
          parentAlertCreated = true;
        }
      }

      await this.feeReminderLogModel.create({
        schoolId,
        installmentId: installment._id,
        reminderDateKey,
        studentEmailSent,
        parentEmailSent,
        parentAlertCreated,
      });

      sent += 1;
    }

    return { success: true, message: 'Reminder run complete', data: { processed: installments.length, sent, skipped } };
  }

  async getMyInstallments(user: any, filters: { academicYear?: string }) {
    const role = user?.role;
    const schoolId = this.resolveSchoolId(user, user?.schoolId);

    let studentIds: Types.ObjectId[] = [];

    if (role === UserRole.STUDENT) {
      const student = await this.studentModel.findOne({ userId: user?._id, schoolId }).select('_id').lean();
      if (!student) return { success: true, data: [] };
      studentIds = [student._id as any];
    } else if (role === UserRole.PARENT) {
      const childUsers = await this.userModel.find({
        role: UserRole.STUDENT,
        parentIds: { $in: [new Types.ObjectId(String(user?._id))] },
        schoolId,
      }).select('_id').lean();

      if (childUsers.length === 0) return { success: true, data: [] };

      const students = await this.studentModel
        .find({ userId: { $in: childUsers.map((u: any) => u._id) }, schoolId })
        .select('_id')
        .lean();

      studentIds = students.map((s: any) => s._id);
    } else {
      throw new BadRequestException('Only parent and student can access this endpoint');
    }

    const query: any = { schoolId, studentId: { $in: studentIds } };
    if (filters?.academicYear) query.academicYear = filters.academicYear;

    const items = await this.feeInstallmentModel
      .find(query)
      .populate('studentId', 'firstName lastName class studentId email')
      .populate('feePolicyId')
      .sort({ dueDate: 1 })
      .lean();

    const mapped = items.map((item: any) => {
      const penalty = this.calculatePenalty(item, item.feePolicyId, new Date());
      return {
        ...item,
        lateFeeComputed: Number(penalty.lateFee.toFixed(2)),
        fineComputed: Number(penalty.fine.toFixed(2)),
        totalDue: Number(penalty.totalDue.toFixed(2)),
      };
    });

    return { success: true, data: mapped };
  }

  async getMyFeeSummary(user: any, filters: { academicYear?: string }) {
    const installmentsResult = await this.getMyInstallments(user, filters);
    const items = installmentsResult?.data || [];

    const summary = items.reduce(
      (acc: any, item: any) => {
        acc.totalInstallments += 1;
        acc.totalBase += Number(item.installmentAmount || 0);
        acc.totalDiscount += Number(item.discountAmount || 0);
        acc.totalPaid += Number(item.paidAmount || 0);
        acc.totalDue += Number(item.totalDue || 0);
        if (item.status === 'overdue') acc.overdueCount += 1;
        return acc;
      },
      {
        totalInstallments: 0,
        totalBase: 0,
        totalDiscount: 0,
        totalPaid: 0,
        totalDue: 0,
        overdueCount: 0,
      },
    );

    return { success: true, data: summary };
  }
}
