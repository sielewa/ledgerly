import type { BankView, InFlightOrDone, SagaAction } from './payment-decision.types';

// What to do when we learn the bank's view of a transfer, given OUR view of the payment.
// One table for both sources of truth (a webhook or the sweeper's GET), so the two can never disagree.
export const DECISIONS: Record<InFlightOrDone, Record<BankView, SagaAction>> = {
  // "Hold placed, POST maybe sent": the bank can know before we saved SENT_TO_BANK (webhook faster than the
  // HTTP response, timeout, crash between the POST and our UPDATE).
  FUNDS_HELD: { PENDING: 'WAIT', SETTLED: 'CAPTURE', REJECTED: 'COMPENSATE', NOT_FOUND: 'RESEND' },
  // The bank confirmed it. NOT_FOUND now contradicts that confirmation: resending could pay twice.
  SENT_TO_BANK: { PENDING: 'WAIT', SETTLED: 'CAPTURE', REJECTED: 'COMPENSATE', NOT_FOUND: 'ALERT' },
  // Timeout: the outcome is unknown, so we ask. NOT_FOUND = our POST never arrived, resend it.
  BANK_UNKNOWN: {
    PENDING: 'WAIT',
    SETTLED: 'CAPTURE',
    REJECTED: 'COMPENSATE',
    NOT_FOUND: 'RESEND',
  },
  // We are releasing the hold. REJECTED again = finish (or retry) the compensation; it's idempotent.
  COMPENSATING: { PENDING: 'IGNORE', SETTLED: 'ALERT', REJECTED: 'COMPENSATE', NOT_FOUND: 'ALERT' },
  COMPLETED: { PENDING: 'IGNORE', SETTLED: 'IGNORE', REJECTED: 'ALERT', NOT_FOUND: 'ALERT' },
  // FAILED + NOT_FOUND is normal: insufficient funds means we never sent anything.
  FAILED: { PENDING: 'IGNORE', SETTLED: 'ALERT', REJECTED: 'IGNORE', NOT_FOUND: 'IGNORE' },
};
