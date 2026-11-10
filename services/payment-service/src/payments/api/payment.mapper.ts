import { paymentV1 } from '@ledgerly/proto';
import type { Payment } from '../domain/payment.interface';

export function toPaymentProto(p: Payment): paymentV1.Payment {
  return {
    id: p.id,
    invoiceId: p.invoiceId ?? '',
    payerAccountId: p.payerAccountId,
    amount: { amountMinor: p.amountMinor, currency: p.currency },
    status: paymentV1.PaymentStatus[`PAYMENT_STATUS_${p.status}`],
    failureReason: p.failureReason ?? '',
  };
}
