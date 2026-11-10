import { randomUUID } from 'node:crypto';
import { PaymentEventV1Schema, type PaymentEventV1 } from '@ledgerly/events';
import type { Payment } from './payment.interface';

/**
 * Builds a payment.* event and validates it with the CONSUMER's schema before it is stored: a bad event fails
 * the producer's transaction, instead of being committed and rejected by the consumer hours later.
 */
export function paymentEvent(payment: Payment, type: PaymentEventV1['type']): PaymentEventV1 {
  if (!payment.invoiceId)
    throw new Error(`payment ${payment.id} has no invoice, nothing to publish`);
  const base = {
    eventId: randomUUID(),
    schemaVersion: 1 as const,
    occurredAt: new Date().toISOString(),
  };
  const data = {
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    amount: { amountMinor: payment.amountMinor, currency: payment.currency },
  };
  return PaymentEventV1Schema.parse(
    type === 'payment.failed'
      ? { ...base, type, data: { ...data, reason: payment.failureReason ?? 'unknown' } }
      : { ...base, type, data },
  );
}
