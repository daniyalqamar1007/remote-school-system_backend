import 'dotenv/config';
import mongoose from 'mongoose';

function buildReceiptNo(schoolId: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const rand = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
  return `RCP-${schoolId.slice(-6).toUpperCase()}-${stamp}-${rand}`;
}

async function run() {
  const uri = (process.env.MONGO_URI || process.env.MONGODB_CONNECTION_URL) as string;
  if (!uri) {
    console.error('MONGO_URI or MONGODB_CONNECTION_URL is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 20000,
  } as any);

  try {
    const db = mongoose.connection.db;

    const policyResult = await db.collection('feepolicies').updateMany(
      { academicStartMonth: { $exists: false } },
      { $set: { academicStartMonth: 1 } },
    );

    const policySoftDeleteResult = await db.collection('feepolicies').updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } },
    );

    const paymentCursor = db.collection('feepayments').find({
      $or: [
        { receiptNo: { $exists: false } },
        { transactionStatus: { $exists: false } },
        { academicYear: { $exists: false } },
        { paymentProvider: { $exists: false } },
      ],
    });

    let paymentUpdated = 0;
    while (await paymentCursor.hasNext()) {
      const payment = await paymentCursor.next();
      if (!payment?._id) continue;

      const schoolId = String(payment.schoolId || 'NOSCH');
      const updateSet: Record<string, any> = {};

      if (!payment.academicYear && payment.installmentId) {
        const installment = await db.collection('feeinstallments').findOne({ _id: payment.installmentId }, { projection: { academicYear: 1 } });
        if (installment?.academicYear) {
          updateSet.academicYear = installment.academicYear;
        }
      }

      if (!payment.receiptNo) {
        updateSet.receiptNo = buildReceiptNo(schoolId);
      }
      if (!payment.transactionStatus) {
        updateSet.transactionStatus = 'captured';
      }
      if (!payment.paymentProvider) {
        updateSet.paymentProvider = 'manual';
      }
      if (!payment.providerTransactionId && payment.externalPaymentId) {
        updateSet.providerTransactionId = payment.externalPaymentId;
      }

      if (Object.keys(updateSet).length > 0) {
        await db.collection('feepayments').updateOne({ _id: payment._id }, { $set: updateSet });
        paymentUpdated += 1;
      }
    }

    console.log('Backfill complete.');
    console.log('FeePolicy academicStartMonth updates:', policyResult.modifiedCount);
    console.log('FeePolicy isDeleted updates:', policySoftDeleteResult.modifiedCount);
    console.log('FeePayment updates:', paymentUpdated);
  } catch (err) {
    console.error('Backfill failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
