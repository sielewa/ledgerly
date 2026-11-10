import type { InvoiceStatus } from './invoice-state.types';

export interface Invoice {
  id: string;
  payerAccountId: string; // a ledger account (another service's database: stored as an id, no foreign key)
  payeeName: string;
  payeeIban: string;
  amountMinor: string; // bigint as string, never a float
  currency: string;
  status: InvoiceStatus;
}
