import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { FeeService } from './fee.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/schemas/user.schema';
import { CreateFeePolicyDto } from './dto/create-fee-policy.dto';
import { UpdateFeePolicyDto } from './dto/update-fee-policy.dto';
import { UpsertStudentDiscountDto } from './dto/upsert-student-discount.dto';
import { GenerateInstallmentsDto } from './dto/generate-installments.dto';
import { RecordFeePaymentDto } from './dto/record-fee-payment.dto';
import { ManualClearanceDto } from './dto/manual-clearance.dto';
import { MockFeePaymentDto } from './dto/mock-fee-payment.dto';

@Controller('fee')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  @Post('policies')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createPolicy(@Body() dto: CreateFeePolicyDto, @Req() req: any) {
    return this.feeService.createPolicy(dto, req.user);
  }

  @Get('policies')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPolicies(
    @Req() req: any,
    @Query('schoolId') schoolId?: string,
    @Query('academicYear') academicYear?: string,
    @Query('className') className?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.feeService.getPolicies(req.user, { schoolId, academicYear, className, isActive, page, limit, sortBy, sortOrder });
  }

  @Get('policies/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getPolicyById(@Param('id') id: string, @Req() req: any) {
    return this.feeService.getPolicyById(id, req.user);
  }

  @Put('policies/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updatePolicy(@Param('id') id: string, @Body() dto: UpdateFeePolicyDto, @Req() req: any) {
    return this.feeService.updatePolicy(id, dto, req.user);
  }

  @Post('policies/:id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deactivatePolicy(@Param('id') id: string, @Req() req: any) {
    return this.feeService.deactivatePolicy(id, req.user);
  }

  @Post('policies/:id/activate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async activatePolicy(@Param('id') id: string, @Req() req: any) {
    return this.feeService.activatePolicy(id, req.user);
  }

  @Delete('policies/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async softDeletePolicy(@Param('id') id: string, @Req() req: any) {
    return this.feeService.softDeletePolicy(id, req.user);
  }

  @Post('policies/:id/restore')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async restorePolicy(@Param('id') id: string, @Req() req: any) {
    return this.feeService.restorePolicy(id, req.user);
  }

  @Post('discounts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async upsertDiscount(@Body() dto: UpsertStudentDiscountDto, @Req() req: any) {
    return this.feeService.upsertStudentDiscount(dto, req.user);
  }

  @Get('discounts')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDiscounts(
    @Req() req: any,
    @Query('schoolId') schoolId?: string,
    @Query('studentId') studentId?: string,
    @Query('feePolicyId') feePolicyId?: string,
    @Query('isActive') isActive?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.feeService.getDiscounts(req.user, {
      schoolId,
      studentId,
      feePolicyId,
      isActive,
      page,
      limit,
      sortBy,
      sortOrder,
    });
  }

  @Get('discounts/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDiscountById(@Param('id') id: string, @Req() req: any) {
    return this.feeService.getDiscountById(id, req.user);
  }

  @Post('discounts/:id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async deactivateDiscount(@Param('id') id: string, @Req() req: any) {
    return this.feeService.setDiscountActiveStatus(id, false, req.user);
  }

  @Post('discounts/:id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reactivateDiscount(@Param('id') id: string, @Req() req: any) {
    return this.feeService.setDiscountActiveStatus(id, true, req.user);
  }

  @Post('installments/generate')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async generateInstallments(@Body() dto: GenerateInstallmentsDto, @Req() req: any) {
    return this.feeService.generateInstallments(dto, req.user);
  }

  @Get('installments')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getInstallments(
    @Req() req: any,
    @Query('schoolId') schoolId?: string,
    @Query('studentId') studentId?: string,
    @Query('academicYear') academicYear?: string,
    @Query('className') className?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.feeService.getInstallments(req.user, {
      schoolId,
      studentId,
      academicYear,
      className,
      status,
      page,
      limit,
      sortBy,
      sortOrder,
    });
  }

  @Get('installments/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getInstallmentById(@Param('id') id: string, @Req() req: any) {
    return this.feeService.getInstallmentById(id, req.user);
  }

  @Post('installments/:id/payments')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async recordPayment(@Param('id') installmentId: string, @Body() dto: RecordFeePaymentDto, @Req() req: any) {
    return this.feeService.recordPayment(installmentId, dto, req.user);
  }

  @Post('payments/mock')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async mockPayment(@Body() dto: MockFeePaymentDto, @Req() req: any) {
    return this.feeService.mockPayment(dto, req.user);
  }

  @Post('payments/:id/reverse')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async reversePayment(@Param('id') id: string, @Body() body: { reason?: string } = {}, @Req() req: any) {
    return this.feeService.reversePayment(id, body?.reason, req.user);
  }

  @Post('installments/:id/manual-clearance')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async manualClearance(@Param('id') installmentId: string, @Body() dto: ManualClearanceDto, @Req() req: any) {
    return this.feeService.manualClearance(installmentId, dto, req.user);
  }

  @Post('reminders/run')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async runReminders(@Req() req: any, @Body() body: { schoolId?: string; idempotencyKey?: string } = {}) {
    return this.feeService.runSevenDayReminders(req.user, body.schoolId, body?.idempotencyKey);
  }

  @Get('payments/installment/:installmentId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getInstallmentPaymentHistory(
    @Param('installmentId') installmentId: string,
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.feeService.getPaymentsByInstallment(installmentId, req.user, { page, limit, sortBy, sortOrder });
  }

  @Get('payments/student/:studentId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStudentPaymentHistory(
    @Param('studentId') studentId: string,
    @Req() req: any,
    @Query('installmentId') installmentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.feeService.getPaymentsByStudent(studentId, req.user, {
      installmentId,
      page,
      limit,
      sortBy,
      sortOrder,
    });
  }

  @Get('payments/:id/receipt')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PARENT, UserRole.STUDENT)
  async getPaymentReceipt(@Param('id') id: string, @Req() req: any) {
    return this.feeService.getPaymentReceipt(id, req.user);
  }

  @Get('my/payments')
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  async getMyPayments(
    @Req() req: any,
    @Query('academicYear') academicYear?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.feeService.getMyPayments(req.user, { academicYear, page, limit, sortBy, sortOrder });
  }

  @Get('reports/summary')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getReportSummary(@Req() req: any, @Query('schoolId') schoolId?: string, @Query('academicYear') academicYear?: string) {
    return this.feeService.getFeeReportsSummary(req.user, { schoolId, academicYear });
  }

  @Get('reports/aging')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getReportAging(@Req() req: any, @Query('schoolId') schoolId?: string, @Query('academicYear') academicYear?: string) {
    return this.feeService.getFeeAgingBuckets(req.user, { schoolId, academicYear });
  }

  @Get('reports/class-collections')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getClassCollections(@Req() req: any, @Query('schoolId') schoolId?: string, @Query('academicYear') academicYear?: string) {
    return this.feeService.getFeeClassCollections(req.user, { schoolId, academicYear });
  }

  @Get('reports/monthly-collections')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getMonthlyCollections(@Req() req: any, @Query('schoolId') schoolId?: string, @Query('studentId') studentId?: string) {
    return this.feeService.getFeeMonthlyCollections(req.user, { schoolId, studentId });
  }

  @Get('reports/dashboard')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDashboardReport(@Req() req: any, @Query('schoolId') schoolId?: string, @Query('academicYear') academicYear?: string) {
    return this.feeService.getFeeDashboard(req.user, { schoolId, academicYear });
  }

  @Get('my/installments')
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  async myInstallments(
    @Req() req: any,
    @Query('academicYear') academicYear?: string,
    @Query('status') status?: string,
    @Query('dueFrom') dueFrom?: string,
    @Query('dueTo') dueTo?: string,
  ) {
    return this.feeService.getMyInstallments(req.user, { academicYear, status, dueFrom, dueTo });
  }

  @Get('my/summary')
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  async mySummary(@Req() req: any, @Query('academicYear') academicYear?: string) {
    return this.feeService.getMyFeeSummary(req.user, { academicYear });
  }
}
