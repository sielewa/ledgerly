import type { PaymentStatus } from '../domain/payment.types';

/** A row of the payments table, as Postgres returns it (snake_case, bigint as string). */
export interface PaymentRow {
  id: string;
  invoice_id: string | null;
  idempotency_key: string;
  payer_account_id: string;
  amount_minor: string;
  currency: string;
  creditor_iban: string;
  creditor_name: string;
  status: PaymentStatus;
  hold_id: string | null;
  failure_reason: string | null;
}
