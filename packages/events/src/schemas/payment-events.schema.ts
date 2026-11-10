import { z } from 'zod';
import { MoneySchema } from './money.schema';

// Published by payment-service (through its outbox). invoice-service moves the invoice through its state machine:
//   payment.started   -> ISSUED -> PAYMENT_PENDING
//   payment.completed -> PAYMENT_PENDING -> PAID
//   payment.failed    -> PAYMENT_PENDING -> ISSUED (can be paid again)
// Published with orderingKey = invoiceId: events of one invoice must not overtake each other.
const envelope = {
  eventId: z.uuid(),
  schemaVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
};
const data = {
  paymentId: z.guid(),
  invoiceId: z.guid(),
  amount: MoneySchema,
};

export const PaymentEventV1Schema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('payment.started'), data: z.object(data) }),
  z.object({ ...envelope, type: z.literal('payment.completed'), data: z.object(data) }),
  z.object({
    ...envelope,
    type: z.literal('payment.failed'),
    data: z.object({ ...data, reason: z.string() }),
  }),
]);
