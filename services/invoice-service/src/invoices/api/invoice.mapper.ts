import { invoiceV1 } from '@ledgerly/proto';
import type { Invoice } from '../domain/invoice.interface';

export function toInvoiceProto(invoice: Invoice): invoiceV1.Invoice {
  return {
    id: invoice.id,
    payerAccountId: invoice.payerAccountId,
    payeeName: invoice.payeeName,
    payeeIban: invoice.payeeIban,
    amount: { amountMinor: invoice.amountMinor, currency: invoice.currency },
    // The domain uses 'DRAFT', the contract uses the prefixed enum value 'INVOICE_STATUS_DRAFT'.
    status: invoiceV1.InvoiceStatus[`INVOICE_STATUS_${invoice.status}`],
  };
}
