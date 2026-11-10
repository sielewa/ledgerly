import { z } from 'zod';
import { MoneySchema } from './money.schema';

export const InvoiceIssuedV1Schema = z.object({
  eventId: z.uuid(),
  type: z.literal('invoice.issued'),
  schemaVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  // z.guid() = any 8-4-4-4-12 hex, like Postgres `uuid` and the producers' validation. z.uuid() is strict
  // RFC 9562 (version/variant digits) and rejected ids the producer had already accepted and committed.
  data: z.object({
    invoiceId: z.guid(),
    payerAccountId: z.guid(),
    payeeName: z.string(),
    amount: MoneySchema,
  }),
});
