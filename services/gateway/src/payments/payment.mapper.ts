import { paymentV1 } from '@ledgerly/proto';

// Public REST shape: "COMPLETED" instead of the proto enum name "PAYMENT_STATUS_COMPLETED".
export function paymentToRest(payment: paymentV1.Payment | undefined) {
  if (!payment) throw new Error('payment-service returned no payment');
  return {
    ...payment,
    status: payment.status.replace('PAYMENT_STATUS_', ''),
    failureReason: payment.failureReason || null,
  };
}
