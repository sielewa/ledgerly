import { invoiceV1 } from '@ledgerly/proto';

// Public REST shape: "DRAFT" instead of the proto enum name "INVOICE_STATUS_DRAFT".
export function invoiceToRest(invoice: invoiceV1.Invoice | undefined) {
  if (!invoice) throw new Error('invoice-service returned no invoice');
  return { ...invoice, status: invoice.status.replace('INVOICE_STATUS_', '') };
}
