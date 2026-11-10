import type { InvoiceStatus } from '../domain/invoice-state.types';

/** A row of the invoices table, as Postgres returns it (snake_case, bigint as string). */
export interface InvoiceRow {
  id: string;
  payer_account_id: string;
  payee_name: string;
  payee_iban: string;
  amount_minor: string;
  currency: string;
  status: InvoiceStatus;
}
