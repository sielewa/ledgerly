import { randomUUID } from 'node:crypto';
import { InvoiceIssuedV1Schema, type InvoiceIssuedV1 } from '@ledgerly/events';
import type { Invoice } from './invoice.interface';

/**
 * The invoice.issued event, validated with the CONSUMER's schema before it is stored: a bad event fails the
 * producer's transaction instead of being committed and rejected by a consumer hours later.
 */
export function invoiceIssuedEvent(invoice: Invoice): InvoiceIssuedV1 {
  return InvoiceIssuedV1Schema.parse({
    eventId: randomUUID(),
    type: 'invoice.issued',
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    data: {
      invoiceId: invoice.id,
      payerAccountId: invoice.payerAccountId,
      payeeName: invoice.payeeName,
      amount: { amountMinor: invoice.amountMinor, currency: invoice.currency },
    },
  });
}
