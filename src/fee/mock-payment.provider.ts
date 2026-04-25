import { Injectable } from '@nestjs/common';
import { PaymentProvider, PaymentProviderInput, PaymentProviderResponse } from './payment-provider.interface';

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  async initiatePayment(input: PaymentProviderInput): Promise<PaymentProviderResponse> {
    const scenario = input.scenario || 'success';
    const referenceSeed = input.referenceNo || input.externalPaymentId || 'MOCK';
    const transactionId = `TXN-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const reference = `REF-${String(referenceSeed).replace(/[^a-z0-9]/gi, '').slice(0, 16).toUpperCase()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;

    if (scenario === 'pending') {
      return { transactionId, status: 'pending', reference };
    }

    if (scenario === 'failure') {
      return { transactionId, status: 'failed', reference };
    }

    return { transactionId, status: 'captured', reference };
  }
}