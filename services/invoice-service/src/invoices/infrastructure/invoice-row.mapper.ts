import type { Invoice } from '../domain/invoice.interface';
import type { InvoiceRow } from './invoice-row.interface';

export function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    payerAccountId: row.payer_account_id,
    payeeName: row.payee_name,
    payeeIban: row.payee_iban,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
  };
}
