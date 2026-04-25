import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as cron from 'node-cron';
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
import { MockFeePaymentDto } from './dto/mock-fee-payment.dto';
import { MockPaymentProvider } from './mock-payment.provider';

@Injectable()
export class FeeService implements OnModuleInit {
  private readonly logger = new Logger(FeeService.name);
  private reminderCronStarted = false;

  constructor(
    @InjectConnection() private readonly connection: Connection,
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
    private readonly mockPaymentProvider: MockPaymentProvider,
  ) {}

  onModuleInit() {
    if (this.reminderCronStarted) return;

    // Runs daily at 08:00 server time.
    cron.schedule('0 8 * * *', async () => {
      try {
        const schools = await this.feePolicyModel.distinct('schoolId', { isActive: true, isDeleted: { $ne: true } });
        for (const schoolId of schools) {
          await this.runSevenDayRemindersInternal(new Types.ObjectId(String(schoolId)), {
            runType: 'scheduled_daily',
            initiatedBy: 'system',
            idempotencyKey: `daily-${new Date().toISOString().slice(0, 10)}-${schoolId}`,
          });
        }
      } catch (error: any) {
        this.logger.error(`Scheduled fee reminder run failed: ${error?.message || 'unknown error'}`);
      }
    });

    this.reminderCronStarted = true;
  }

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

  private computeInstallmentState(installment: any, policy: any, now = new Date()) {
    const penalty = this.calculatePenalty(installment, policy, now);
    const computedStatus = installment.status === 'paid' || installment.status === 'waived'
      ? installment.status
      : penalty.overdueDays > 0
        ? (Number(installment.paidAmount || 0) > 0 ? 'partial' : 'overdue')
        : (Number(installment.paidAmount || 0) > 0 ? 'partial' : 'pending');

    return {
      lateFeeComputed: Number(penalty.lateFee.toFixed(2)),
      fineComputed: Number(penalty.fine.toFixed(2)),
      totalDue: Number(penalty.totalDue.toFixed(2)),
      computedStatus,
      overdueDays: penalty.overdueDays,
    };
  }

  private async savePaymentAndRefreshInstallment(
    installment: any,
    dto: {
      amount: number;
      paymentMode: string;
      referenceNo?: string;
      note?: string;
      externalPaymentId?: string;
    },
    user: any,
    session: any,
    overrides: { transactionStatus?: 'captured' | 'pending' | 'failed'; paymentProvider?: 'manual' | 'mock'; providerTransactionId?: string } = {},
  ) {
    const policyDoc = await this.feePolicyModel.findById(installment.feePolicyId).session(session);
    const policy = policyDoc?.toObject();
    if (!policy) throw new NotFoundException('Fee policy not found');

    const penalty = this.calculatePenalty(installment.toObject(), policy, new Date());
    if (overrides.transactionStatus === 'captured' && dto.amount > penalty.totalDue) {
      throw new BadRequestException('Payment amount is greater than payable due amount');
    }

    const paymentDocs = await this.feePaymentModel.create([
      {
        schoolId: installment.schoolId,
        studentId: installment.studentId,
        installmentId: installment._id,
        academicYear: installment.academicYear,
        amount: dto.amount,
        paymentMode: dto.paymentMode,
        referenceNo: dto.referenceNo,
        note: dto.note,
        externalPaymentId: dto.externalPaymentId,
        providerTransactionId: overrides.providerTransactionId,
        transactionStatus: overrides.transactionStatus || 'captured',
        paymentProvider: overrides.paymentProvider || 'manual',
        receiptNo: this.buildReceiptNo(installment.schoolId as any),
        recordedBy: user?._id,
      },
    ], { session });

    const createdPayment = paymentDocs[0];

    if (overrides.transactionStatus === 'captured') {
      installment.paidAmount = Number((Number(installment.paidAmount || 0) + Number(dto.amount || 0)).toFixed(2));

      const recomputed = this.calculatePenalty(installment.toObject(), policy, new Date());
      if (recomputed.totalDue <= 0) {
        installment.status = 'paid';
        installment.paidAt = new Date();
      } else if (installment.paidAmount > 0) {
        installment.status = 'partial';
      } else {
        installment.status = recomputed.overdueDays > 0 ? 'overdue' : 'pending';
      }

      installment.lateFeeApplied = Number(recomputed.lateFee.toFixed(2));
      installment.fineApplied = Number(recomputed.fine.toFixed(2));
      await installment.save({ session });
    }

    return {
      installment,
      payment: createdPayment,
      policy,
      penalty,
    };
  }

  private parseAcademicYearStart(academicYear: string): number {
    const yearPart = String(academicYear || '').split('-')[0];
    const year = Number(yearPart);
    return Number.isFinite(year) && year > 1900 ? year : new Date().getFullYear();
  }

  private resolveAcademicStartMonth(policy: any, requestedMonth?: number): number {
    const fromRequest = Number(requestedMonth);
    if (Number.isFinite(fromRequest) && fromRequest >= 1 && fromRequest <= 12) return fromRequest;

    const fromPolicy = Number(policy?.academicStartMonth);
    if (Number.isFinite(fromPolicy) && fromPolicy >= 1 && fromPolicy <= 12) return fromPolicy;

    return 1;
  }

  private parsePagination(filters: any) {
    const page = Math.max(1, Number(filters?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(filters?.limit || 20)));
    const skip = (page - 1) * limit;
    const sortBy = String(filters?.sortBy || 'createdAt');
    const sortOrder: 1 | -1 = String(filters?.sortOrder || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    return { page, limit, skip, sortBy, sortOrder };
  }

  private sortSpec(sortBy: string, sortOrder: 1 | -1) {
    return { [sortBy]: sortOrder } as Record<string, 1 | -1>;
  }

  private buildPagedResult(data: any[], page: number, limit: number, total: number) {
    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private buildReceiptNo(schoolId: Types.ObjectId) {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `RCP-${String(schoolId).slice(-6).toUpperCase()}-${stamp}-${rand}`;
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
          isDeleted: { $ne: true },
        },
        { $set: { isActive: false, updatedBy: user?._id } },
      );
    }

    const created = await this.feePolicyModel.create({
      ...dto,
      schoolId,
      isActive: dto.isActive !== false,
      isDeleted: false,
      deletedAt: undefined,
      createdBy: user?._id,
      updatedBy: user?._id,
    });

    return { success: true, message: 'Fee policy created', data: created };
  }

  async getPolicies(user: any, filters: any) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const query: any = { schoolId, isDeleted: { $ne: true } };

    if (filters?.academicYear) query.academicYear = filters.academicYear;
    if (filters?.className) query.className = filters.className;
    if (filters?.isActive === 'true') query.isActive = true;
    if (filters?.isActive === 'false') query.isActive = false;
    const { page, limit, skip, sortBy, sortOrder } = this.parsePagination(filters);

    const [items, total] = await Promise.all([
      this.feePolicyModel.find(query).sort(this.sortSpec(sortBy, sortOrder)).skip(skip).limit(limit).lean(),
      this.feePolicyModel.countDocuments(query),
    ]);

    return this.buildPagedResult(items, page, limit, total);
  }

  async getPolicyById(id: string, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const policy = await this.feePolicyModel.findById(policyId).lean();
    if (!policy || policy.isDeleted) throw new NotFoundException('Fee policy not found');

    this.resolveSchoolId(user, String(policy.schoolId));
    return { success: true, data: policy };
  }

  async updatePolicy(id: string, dto: UpdateFeePolicyDto, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const schoolId = this.resolveSchoolId(user, dto.schoolId);

    const existing = await this.feePolicyModel.findById(policyId);
    if (!existing || existing.isDeleted) throw new NotFoundException('Fee policy not found');
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
          isDeleted: { $ne: true },
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
    if (!existing || existing.isDeleted) throw new NotFoundException('Fee policy not found');

    this.resolveSchoolId(user, String(existing.schoolId));

    const updated = await this.feePolicyModel.findByIdAndUpdate(
      policyId,
      { isActive: false, updatedBy: user?._id },
      { new: true },
    );

    return { success: true, message: 'Fee policy deactivated', data: updated };
  }

  async activatePolicy(id: string, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const existing = await this.feePolicyModel.findById(policyId);
    if (!existing || existing.isDeleted) throw new NotFoundException('Fee policy not found');

    this.resolveSchoolId(user, String(existing.schoolId));

    await this.feePolicyModel.updateMany(
      {
        schoolId: existing.schoolId,
        academicYear: existing.academicYear,
        className: existing.className,
        _id: { $ne: existing._id },
        isActive: true,
        isDeleted: { $ne: true },
      },
      { $set: { isActive: false, updatedBy: user?._id } },
    );

    const updated = await this.feePolicyModel.findByIdAndUpdate(
      policyId,
      { isActive: true, updatedBy: user?._id },
      { new: true },
    );

    return { success: true, message: 'Fee policy activated', data: updated };
  }

  async softDeletePolicy(id: string, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const existing = await this.feePolicyModel.findById(policyId);
    if (!existing || existing.isDeleted) throw new NotFoundException('Fee policy not found');

    this.resolveSchoolId(user, String(existing.schoolId));

    const updated = await this.feePolicyModel.findByIdAndUpdate(
      policyId,
      { isDeleted: true, isActive: false, deletedAt: new Date(), updatedBy: user?._id },
      { new: true },
    );

    return { success: true, message: 'Fee policy deleted', data: updated };
  }

  async restorePolicy(id: string, user: any) {
    const policyId = this.toObjectId(id, 'policy id');
    const existing = await this.feePolicyModel.findById(policyId);
    if (!existing || !existing.isDeleted) throw new NotFoundException('Deleted fee policy not found');

    this.resolveSchoolId(user, String(existing.schoolId));

    const updated = await this.feePolicyModel.findByIdAndUpdate(
      policyId,
      { isDeleted: false, deletedAt: null, updatedBy: user?._id },
      { new: true },
    );

    return { success: true, message: 'Fee policy restored', data: updated };
  }

  async upsertStudentDiscount(dto: UpsertStudentDiscountDto, user: any) {
    const schoolId = this.resolveSchoolId(user, dto.schoolId);
    const studentId = this.toObjectId(dto.studentId, 'studentId');
    const feePolicyId = this.toObjectId(dto.feePolicyId, 'feePolicyId');

    const student = await this.studentModel.findById(studentId).lean();
    if (!student) throw new NotFoundException('Student not found');
    if (String(student.schoolId) !== String(schoolId)) {
      throw new BadRequestException('Student does not belong to selected school');
    }

    const policy = await this.feePolicyModel.findById(feePolicyId).lean();
    if (!policy) throw new NotFoundException('Fee policy not found');
    if (policy.isDeleted) {
      throw new BadRequestException('Cannot attach discount to deleted policy');
    }
    if (String(policy.schoolId) !== String(schoolId)) {
      throw new BadRequestException('Fee policy does not belong to selected school');
    }

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
    if (filters?.isActive === 'true') query.isActive = true;
    if (filters?.isActive === 'false') query.isActive = false;

    const { page, limit, skip, sortBy, sortOrder } = this.parsePagination(filters);

    const [items, total] = await Promise.all([
      this.studentDiscountModel
        .find(query)
        .populate('studentId', 'firstName lastName class studentId')
        .populate('feePolicyId', 'className academicYear baseFee')
        .sort(this.sortSpec(sortBy, sortOrder))
        .skip(skip)
        .limit(limit)
        .lean(),
      this.studentDiscountModel.countDocuments(query),
    ]);

    return this.buildPagedResult(items, page, limit, total);
  }

  async getDiscountById(id: string, user: any) {
    const discountId = this.toObjectId(id, 'discount id');
    const discount = await this.studentDiscountModel
      .findById(discountId)
      .populate('studentId', 'firstName lastName class studentId')
      .populate('feePolicyId', 'className academicYear baseFee')
      .lean();
    if (!discount) throw new NotFoundException('Discount not found');

    this.resolveSchoolId(user, String(discount.schoolId));
    return { success: true, data: discount };
  }

  async setDiscountActiveStatus(id: string, isActive: boolean, user: any) {
    const discountId = this.toObjectId(id, 'discount id');
    const existing = await this.studentDiscountModel.findById(discountId);
    if (!existing) throw new NotFoundException('Discount not found');

    this.resolveSchoolId(user, String(existing.schoolId));

    const updated = await this.studentDiscountModel.findByIdAndUpdate(
      discountId,
      { isActive, approvedBy: user?._id },
      { new: true },
    );

    return {
      success: true,
      message: `Discount ${isActive ? 'activated' : 'deactivated'}`,
      data: updated,
    };
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
        isDeleted: { $ne: true },
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
      const startMonth = this.resolveAcademicStartMonth(policy, dto.academicStartMonth);

      const docs: any[] = [];
      for (let i = 0; i < totalInstallments; i += 1) {
        const dueDate = policy.installmentFrequency === 'monthly'
          ? new Date(startYear + Math.floor((startMonth - 1 + i) / 12), (startMonth - 1 + i) % 12, Number(policy.dueDay || 5))
          : new Date(startYear, startMonth - 1, Number(policy.dueDay || 5));

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
    const { page, limit, skip, sortBy, sortOrder } = this.parsePagination(filters);

    let requestedStudentId: Types.ObjectId | null = null;
    if (filters?.studentId && Types.ObjectId.isValid(filters.studentId)) {
      requestedStudentId = new Types.ObjectId(filters.studentId);
      query.studentId = requestedStudentId;
    }
    if (filters?.academicYear) query.academicYear = filters.academicYear;
    if (filters?.status) query.status = filters.status;

    if (filters?.className) {
      const classStudents = await this.studentModel.find({ schoolId, class: filters.className }).select('_id').lean();
      const classStudentIds = classStudents.map((s: any) => s._id);
      if (requestedStudentId) {
        query.studentId = classStudentIds.some((id: any) => String(id) === String(requestedStudentId)) ? requestedStudentId : { $in: [] };
      } else {
        query.studentId = { $in: classStudentIds };
      }
    }

    const [items, total] = await Promise.all([
      this.feeInstallmentModel
        .find(query)
        .populate('studentId', 'firstName lastName class studentId email')
        .populate('feePolicyId')
        .sort(this.sortSpec(sortBy, sortOrder))
        .skip(skip)
        .limit(limit)
        .lean(),
      this.feeInstallmentModel.countDocuments(query),
    ]);

    const mapped = items.map((item: any) => ({
      ...item,
      ...this.computeInstallmentState(item, item.feePolicyId, new Date()),
    }));

    return this.buildPagedResult(mapped, page, limit, total);
  }

  async getInstallmentById(id: string, user: any) {
    const installmentId = this.toObjectId(id, 'installment id');
    const item = await this.feeInstallmentModel
      .findById(installmentId)
      .populate('studentId', 'firstName lastName class studentId email')
      .populate('feePolicyId')
      .lean();
    if (!item) throw new NotFoundException('Installment not found');

    this.resolveSchoolId(user, String(item.schoolId));

    const computed = this.computeInstallmentState(item, item.feePolicyId, new Date());

    return {
      success: true,
      data: {
        ...item,
        ...computed,
      },
    };
  }

  async recordPayment(installmentId: string, dto: RecordFeePaymentDto, user: any) {
    const iid = this.toObjectId(installmentId, 'installmentId');
    const session = await this.connection.startSession();

    try {
      let updatedInstallment: any = null;
      let createdPayment: any = null;

      await session.withTransaction(async () => {
        const installment = await this.feeInstallmentModel.findById(iid).session(session);
        if (!installment) throw new NotFoundException('Installment not found');

        this.resolveSchoolId(user, String(installment.schoolId));

        const result = await this.savePaymentAndRefreshInstallment(
          installment,
          dto,
          user,
          session,
          { transactionStatus: 'captured', paymentProvider: 'manual' },
        );
        updatedInstallment = await this.feeInstallmentModel.findById(result.installment._id).session(session);
        createdPayment = result.payment;
      });

      return {
        success: true,
        message: 'Payment recorded',
        data: {
          installment: updatedInstallment,
          payment: createdPayment,
        },
      };
    } finally {
      await session.endSession();
    }
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

  async getPaymentsByInstallment(installmentId: string, user: any, filters: any = {}) {
    const iid = this.toObjectId(installmentId, 'installmentId');
    const installment = await this.feeInstallmentModel.findById(iid).lean();
    if (!installment) throw new NotFoundException('Installment not found');

    this.resolveSchoolId(user, String(installment.schoolId));

    const { page, limit, skip, sortBy, sortOrder } = this.parsePagination(filters);
    const query = { schoolId: installment.schoolId, installmentId: iid };

    const [items, total] = await Promise.all([
      this.feePaymentModel
        .find(query)
        .populate('recordedBy', 'firstName lastName email')
        .sort(this.sortSpec(sortBy, sortOrder))
        .skip(skip)
        .limit(limit)
        .lean(),
      this.feePaymentModel.countDocuments(query),
    ]);

    return this.buildPagedResult(items, page, limit, total);
  }

  async getPaymentsByStudent(studentId: string, user: any, filters: any = {}) {
    const sid = this.toObjectId(studentId, 'studentId');
    const student = await this.studentModel.findById(sid).lean();
    if (!student) throw new NotFoundException('Student not found');

    const schoolId = this.resolveSchoolId(user, String(student.schoolId));

    const { page, limit, skip, sortBy, sortOrder } = this.parsePagination(filters);
    const query: any = { schoolId, studentId: sid };
    if (filters?.installmentId && Types.ObjectId.isValid(filters.installmentId)) {
      query.installmentId = new Types.ObjectId(filters.installmentId);
    }

    const [items, total] = await Promise.all([
      this.feePaymentModel
        .find(query)
        .populate('installmentId', 'installmentNo dueDate academicYear')
        .populate('recordedBy', 'firstName lastName email')
        .sort(this.sortSpec(sortBy, sortOrder))
        .skip(skip)
        .limit(limit)
        .lean(),
      this.feePaymentModel.countDocuments(query),
    ]);

    return this.buildPagedResult(items, page, limit, total);
  }

  async getPaymentReceipt(paymentId: string, user: any) {
    const pid = this.toObjectId(paymentId, 'payment id');
    const payment = await this.feePaymentModel
      .findById(pid)
      .populate('studentId', 'firstName lastName class studentId')
      .populate('installmentId', 'installmentNo dueDate academicYear installmentAmount discountAmount paidAmount')
      .populate('recordedBy', 'firstName lastName email')
      .lean();

    if (!payment) throw new NotFoundException('Payment not found');

    if (user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN) {
      this.resolveSchoolId(user, String(payment.schoolId));
    } else if (user?.role === UserRole.STUDENT) {
      const student = await this.studentModel
        .findOne({ userId: user?._id, schoolId: payment.schoolId })
        .select('_id')
        .lean();
      if (!student || String(student._id) !== String(payment.studentId?._id || payment.studentId)) {
        throw new BadRequestException('You can only access your own payment receipt');
      }
    } else if (user?.role === UserRole.PARENT) {
      const childUsers = await this.userModel.find({
        role: UserRole.STUDENT,
        parentIds: { $in: [new Types.ObjectId(String(user?._id))] },
        schoolId: payment.schoolId,
      }).select('_id').lean();

      const children = await this.studentModel
        .find({ userId: { $in: childUsers.map((u: any) => u._id) }, schoolId: payment.schoolId })
        .select('_id')
        .lean();

      const childSet = new Set(children.map((c: any) => String(c._id)));
      if (!childSet.has(String(payment.studentId?._id || payment.studentId))) {
        throw new BadRequestException('You can only access your child payment receipt');
      }
    } else {
      throw new BadRequestException('Unauthorized role');
    }

    return { success: true, data: payment };
  }

  async getFeeReportsSummary(user: any, filters: any = {}) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const match: any = { schoolId };
    if (filters?.academicYear) match.academicYear = filters.academicYear;

    const installments = await this.feeInstallmentModel.find(match).populate('feePolicyId', 'currency').lean();

    const summary = installments.reduce(
      (acc: any, item: any) => {
        const penalty = this.calculatePenalty(item, item.feePolicyId, new Date());
        const computedStatus = item.status === 'paid' || item.status === 'waived'
          ? item.status
          : penalty.overdueDays > 0
            ? (item.paidAmount > 0 ? 'partial' : 'overdue')
            : (item.paidAmount > 0 ? 'partial' : 'pending');

        const billed = Number(item.installmentAmount || 0) - Number(item.discountAmount || 0);
        acc.totalBilled += billed;
        acc.totalCollected += Number(item.paidAmount || 0);
        acc.totalDue += Number(penalty.totalDue || 0);
        if (computedStatus === 'overdue') acc.overdueCount += 1;
        return acc;
      },
      { totalBilled: 0, totalCollected: 0, totalDue: 0, overdueCount: 0 },
    );

    return { success: true, data: summary };
  }

  async getFeeAgingBuckets(user: any, filters: any = {}) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const match: any = { schoolId, status: { $in: ['pending', 'partial', 'overdue'] } };
    if (filters?.academicYear) match.academicYear = filters.academicYear;

    const rows = await this.feeInstallmentModel.find(match).populate('feePolicyId').lean();
    const now = new Date();
    const buckets = {
      current: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d91_plus: 0,
    };

    for (const row of rows as any[]) {
      const penalty = this.calculatePenalty(row, row.feePolicyId, now);
      if (penalty.totalDue <= 0) continue;
      if (penalty.overdueDays <= 0) {
        buckets.current += penalty.totalDue;
      } else if (penalty.overdueDays <= 30) {
        buckets.d1_30 += penalty.totalDue;
      } else if (penalty.overdueDays <= 60) {
        buckets.d31_60 += penalty.totalDue;
      } else if (penalty.overdueDays <= 90) {
        buckets.d61_90 += penalty.totalDue;
      } else {
        buckets.d91_plus += penalty.totalDue;
      }
    }

    return { success: true, data: buckets };
  }

  async getFeeClassCollections(user: any, filters: any = {}) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const match: any = { schoolId };
    if (filters?.academicYear) match.academicYear = filters.academicYear;

    const results = await this.feeInstallmentModel.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: '$student' },
      {
        $group: {
          _id: '$student.class',
          billed: { $sum: { $subtract: ['$installmentAmount', '$discountAmount'] } },
          collected: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return { success: true, data: results };
  }

  async getFeeMonthlyCollections(user: any, filters: any = {}) {
    const schoolId = this.resolveSchoolId(user, filters?.schoolId);
    const match: any = { schoolId };
    if (filters?.studentId && Types.ObjectId.isValid(filters.studentId)) {
      match.studentId = new Types.ObjectId(filters.studentId);
    }

    const results = await this.feePaymentModel.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          totalCollected: { $sum: '$amount' },
          paymentsCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return { success: true, data: results };
  }

  async getFeeDashboard(user: any, filters: any = {}) {
    const [summary, aging, classCollections, monthlyCollections] = await Promise.all([
      this.getFeeReportsSummary(user, filters),
      this.getFeeAgingBuckets(user, filters),
      this.getFeeClassCollections(user, filters),
      this.getFeeMonthlyCollections(user, filters),
    ]);

    return {
      success: true,
      data: {
        summary: summary.data,
        aging: aging.data,
        classCollections: classCollections.data,
        monthlyCollections: monthlyCollections.data,
      },
    };
  }

  async mockPayment(dto: MockFeePaymentDto, user: any) {
    const iid = this.toObjectId(dto.installmentId, 'installmentId');
    const session = await this.connection.startSession();

    try {
      let paymentResult: any;

      await session.withTransaction(async () => {
        const installment = await this.feeInstallmentModel.findById(iid).session(session);
        if (!installment) throw new NotFoundException('Installment not found');

        this.resolveSchoolId(user, String(installment.schoolId));

        const providerResponse = await this.mockPaymentProvider.initiatePayment({
          amount: dto.amount,
          scenario: dto.scenario,
          referenceNo: dto.referenceNo,
          note: dto.note,
          externalPaymentId: dto.externalPaymentId,
        });

        const payload = {
          amount: dto.amount,
          paymentMode: dto.paymentMode || 'manual_cash',
          referenceNo: dto.referenceNo || providerResponse.reference,
          note: dto.note,
          externalPaymentId: dto.externalPaymentId || providerResponse.transactionId,
        };

        if (providerResponse.status === 'captured') {
          paymentResult = await this.savePaymentAndRefreshInstallment(
            installment,
            payload,
            user,
            session,
            { transactionStatus: 'captured', paymentProvider: 'mock', providerTransactionId: providerResponse.transactionId },
          );
        } else {
          const partial = await this.savePaymentAndRefreshInstallment(
            installment,
            payload,
            user,
            session,
            { transactionStatus: providerResponse.status, paymentProvider: 'mock', providerTransactionId: providerResponse.transactionId },
          );
          paymentResult = partial;
        }
      });

      return {
        success: true,
        message: 'Mock payment processed',
        data: {
          transactionId: paymentResult?.payment?.providerTransactionId,
          status: paymentResult?.payment?.transactionStatus,
          reference: paymentResult?.payment?.referenceNo,
          payment: paymentResult?.payment,
          installment: paymentResult?.installment,
        },
      };
    } finally {
      await session.endSession();
    }
  }

  async reversePayment(paymentId: string, reason: string | undefined, user: any) {
    const pid = this.toObjectId(paymentId, 'payment id');
    const session = await this.connection.startSession();

    try {
      let updatedPayment: any;
      let updatedInstallment: any;

      await session.withTransaction(async () => {
        const payment = await this.feePaymentModel.findById(pid).session(session);
        if (!payment) throw new NotFoundException('Payment not found');

        this.resolveSchoolId(user, String(payment.schoolId));

        if (payment.transactionStatus === 'reversed') {
          throw new BadRequestException('Payment is already reversed');
        }

        const installment = await this.feeInstallmentModel.findById(payment.installmentId).session(session);
        if (!installment) throw new NotFoundException('Installment not found');

        payment.transactionStatus = 'reversed';
        payment.reversedAt = new Date();
        payment.reversedBy = user?._id;
        payment.reversalReason = reason || 'Reversed by operator';
        updatedPayment = await payment.save({ session });

        const payments = await this.feePaymentModel.aggregate([
          { $match: { installmentId: payment.installmentId, transactionStatus: 'captured' } },
          { $group: { _id: '$installmentId', total: { $sum: '$amount' } } },
        ]).session(session);
        const remainingPaid = Number(payments?.[0]?.total || 0);

        installment.paidAmount = Number(remainingPaid.toFixed(2));
        const policy = await this.feePolicyModel.findById(installment.feePolicyId).session(session);
        if (policy) {
          const computed = this.calculatePenalty(installment.toObject(), policy.toObject(), new Date());
          installment.lateFeeApplied = Number(computed.lateFee.toFixed(2));
          installment.fineApplied = Number(computed.fine.toFixed(2));
          if (computed.totalDue <= 0 && remainingPaid > 0) {
            installment.status = 'paid';
          } else if (remainingPaid > 0) {
            installment.status = computed.overdueDays > 0 ? 'partial' : 'partial';
          } else {
            installment.status = computed.overdueDays > 0 ? 'overdue' : 'pending';
          }
        }

        updatedInstallment = await installment.save({ session });
      });

      return { success: true, message: 'Payment reversed', data: { payment: updatedPayment, installment: updatedInstallment } };
    } finally {
      await session.endSession();
    }
  }

  async getMyPayments(user: any, filters: { academicYear?: string; page?: string; limit?: string; sortBy?: string; sortOrder?: string }) {
    const schoolId = this.resolveSchoolId(user, user?.schoolId);
    const role = user?.role;

    let studentIds: Types.ObjectId[] = [];
    if (role === UserRole.STUDENT) {
      const student = await this.studentModel.findOne({ userId: user?._id, schoolId }).select('_id').lean();
      if (!student) return { success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };
      studentIds = [student._id as any];
    } else if (role === UserRole.PARENT) {
      const childUsers = await this.userModel.find({ role: UserRole.STUDENT, parentIds: { $in: [new Types.ObjectId(String(user?._id))] }, schoolId }).select('_id').lean();
      const students = await this.studentModel.find({ userId: { $in: childUsers.map((u: any) => u._id) }, schoolId }).select('_id').lean();
      studentIds = students.map((s: any) => s._id);
    } else {
      throw new BadRequestException('Only parent and student can access this endpoint');
    }

    const { page, limit, skip, sortBy, sortOrder } = this.parsePagination(filters);
    const query: any = { schoolId, studentId: { $in: studentIds } };
    if (filters?.academicYear) {
      query.academicYear = filters.academicYear;
    }

    const [items, total] = await Promise.all([
      this.feePaymentModel.find(query).populate('studentId', 'firstName lastName class studentId email').populate('installmentId', 'installmentNo dueDate academicYear').sort(this.sortSpec(sortBy, sortOrder)).skip(skip).limit(limit).lean(),
      this.feePaymentModel.countDocuments(query),
    ]);

    return this.buildPagedResult(items, page, limit, total);
  }

  private reminderDateKeyForInstallment(installment: any, date: Date): string {
    return `${installment._id.toString()}-${date.toISOString().slice(0, 10)}`;
  }

  private async runSevenDayRemindersInternal(
    schoolId: Types.ObjectId,
    opts: { runType: string; initiatedBy: string; idempotencyKey?: string },
  ) {
    if (opts.idempotencyKey) {
      const existingRun = await this.feeReminderLogModel.findOne({ schoolId, idempotencyKey: opts.idempotencyKey }).lean();
      if (existingRun) {
        return {
          success: true,
          message: 'Reminder run skipped due to duplicate idempotency key',
          data: { processed: 0, sent: 0, skipped: 0 },
        };
      }
    }

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
        await this.emailService.sendEmail(student.email, title, description, `<p>${description}</p>`);
        studentEmailSent = true;
      }

      const parentIds = Array.isArray(student?.parents) ? student.parents : [];
      if (parentIds.length > 0) {
        const parents = await this.parentModel
          .find({ _id: { $in: parentIds.map((x: any) => new Types.ObjectId(String(x))) } })
          .populate('userId', 'email firstName lastName')
          .lean();

        const alerts: any[] = [];
        const emailTasks: Promise<any>[] = [];

        for (const parent of parents as any[]) {
          const parentUser = parent.userId as any;
          if (parentUser?.email) {
            emailTasks.push(this.emailService.sendEmail(parentUser.email, title, description, `<p>${description}</p>`));
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

        if (emailTasks.length > 0) {
          await Promise.all(emailTasks);
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
        runType: opts.runType,
        triggeredBy: opts.initiatedBy,
        idempotencyKey: opts.idempotencyKey,
        runAt: new Date(),
        studentEmailSent,
        parentEmailSent,
        parentAlertCreated,
      });

      sent += 1;
    }

    return { success: true, message: 'Reminder run complete', data: { processed: installments.length, sent, skipped } };
  }

  async runSevenDayReminders(user: any, requestedSchoolId?: string, idempotencyKey?: string) {
    const schoolId = this.resolveSchoolId(user, requestedSchoolId);
    return this.runSevenDayRemindersInternal(schoolId, {
      runType: 'manual',
      initiatedBy: String(user?._id || 'unknown'),
      idempotencyKey,
    });
  }

  async getMyInstallments(user: any, filters: { academicYear?: string; status?: string; dueFrom?: string; dueTo?: string }) {
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
    if (filters?.status) query.status = filters.status;
    if (filters?.dueFrom || filters?.dueTo) {
      query.dueDate = {};
      if (filters?.dueFrom) query.dueDate.$gte = new Date(filters.dueFrom);
      if (filters?.dueTo) query.dueDate.$lte = new Date(filters.dueTo);
    }

    const items = await this.feeInstallmentModel
      .find(query)
      .populate('studentId', 'firstName lastName class studentId email')
      .populate('feePolicyId')
      .sort({ dueDate: 1 })
      .lean();

    const mapped = items.map((item: any) => {
      const penalty = this.calculatePenalty(item, item.feePolicyId, new Date());
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
        if (item.computedStatus === 'overdue') acc.overdueCount += 1;
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
