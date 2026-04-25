import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FeeController } from './fee.controller';
import { FeeService } from './fee.service';
import { FeePolicy, FeePolicySchema } from './schema/fee-policy.schema';
import { StudentFeeDiscount, StudentFeeDiscountSchema } from './schema/student-fee-discount.schema';
import { FeeInstallment, FeeInstallmentSchema } from './schema/fee-installment.schema';
import { FeePayment, FeePaymentSchema } from './schema/fee-payment.schema';
import { FeeReminderLog, FeeReminderLogSchema } from './schema/fee-reminder-log.schema';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Parent, ParentSchema } from '../parent/schema/parent.schema';
import { Alert, AlertSchema } from '../alert/schema/alert.schema';
import { EmailModule } from '../email/email.module';
import { MockPaymentProvider } from './mock-payment.provider';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FeePolicy.name, schema: FeePolicySchema },
      { name: StudentFeeDiscount.name, schema: StudentFeeDiscountSchema },
      { name: FeeInstallment.name, schema: FeeInstallmentSchema },
      { name: FeePayment.name, schema: FeePaymentSchema },
      { name: FeeReminderLog.name, schema: FeeReminderLogSchema },
      { name: Student.name, schema: StudentSchema },
      { name: User.name, schema: UserSchema },
      { name: Parent.name, schema: ParentSchema },
      { name: Alert.name, schema: AlertSchema },
    ]),
    EmailModule,
  ],
  controllers: [FeeController],
  providers: [FeeService, MockPaymentProvider],
  exports: [FeeService],
})
export class FeeModule {}
