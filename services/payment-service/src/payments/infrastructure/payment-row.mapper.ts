import type { Payment } from '../domain/payment.interface';
import type { PaymentRow } from './payment-row.interface';

export function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    idempotencyKey: row.idempotency_key,
    payerAccountId: row.payer_account_id,
    amountMinor: row.amount_minor,
    currency: row.currency,
    creditorIban: row.creditor_iban,
    creditorName: row.creditor_name,
    status: row.status,
    holdId: row.hold_id,
    failureReason: row.failure_reason,
  };
}
