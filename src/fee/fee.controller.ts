import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
  ) {
    return this.feeService.getPolicies(req.user, { schoolId, academicYear, className, isActive });
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
  ) {
    return this.feeService.getDiscounts(req.user, { schoolId, studentId, feePolicyId });
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
  ) {
    return this.feeService.getInstallments(req.user, { schoolId, studentId, academicYear, className, status });
  }

  @Post('installments/:id/payments')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async recordPayment(@Param('id') installmentId: string, @Body() dto: RecordFeePaymentDto, @Req() req: any) {
    return this.feeService.recordPayment(installmentId, dto, req.user);
  }

  @Post('installments/:id/manual-clearance')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async manualClearance(@Param('id') installmentId: string, @Body() dto: ManualClearanceDto, @Req() req: any) {
    return this.feeService.manualClearance(installmentId, dto, req.user);
  }

  @Post('reminders/run')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async runReminders(@Req() req: any, @Body() body: { schoolId?: string } = {}) {
    return this.feeService.runSevenDayReminders(req.user, body.schoolId);
  }

  @Get('my/installments')
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  async myInstallments(@Req() req: any, @Query('academicYear') academicYear?: string) {
    return this.feeService.getMyInstallments(req.user, { academicYear });
  }

  @Get('my/summary')
  @Roles(UserRole.PARENT, UserRole.STUDENT)
  async mySummary(@Req() req: any, @Query('academicYear') academicYear?: string) {
    return this.feeService.getMyFeeSummary(req.user, { academicYear });
  }
}
