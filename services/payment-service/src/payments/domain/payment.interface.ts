import type { PaymentStatus } from './payment.types';

/** The payment as the saga sees it (the persisted saga state). */
export interface Payment {
  id: string;
  invoiceId: string | null; // NULL only for payments created before invoices were wired in
  idempotencyKey: string;
  payerAccountId: string;
  amountMinor: string;
  currency: string;
  creditorIban: string;
  creditorName: string;
  status: PaymentStatus;
  holdId: string | null;
  failureReason: string | null;
}

/** A payment about to be created: everything but the generated id and the saga state. */
export interface NewPayment {
  idempotencyKey: string;
  invoiceId: string;
  payerAccountId: string;
  amountMinor: string;
  currency: string;
  creditorIban: string;
  creditorName: string;
}
