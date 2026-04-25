export type MockPaymentScenario = 'success' | 'pending' | 'failure';

export interface PaymentProviderResponse {
  transactionId: string;
  status: 'captured' | 'pending' | 'failed';
  reference: string;
}

export interface PaymentProviderInput {
  amount: number;
  scenario?: MockPaymentScenario;
  referenceNo?: string;
  note?: string;
  externalPaymentId?: string;
}

export interface PaymentProvider {
  initiatePayment(input: PaymentProviderInput): Promise<PaymentProviderResponse>;
}