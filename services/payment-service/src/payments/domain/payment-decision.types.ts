import type { PaymentStatus } from './payment.types';

/** What the bank says about our transfer (NOT_FOUND only comes from GET /transfers/:reference). */
export type BankView = 'PENDING' | 'SETTLED' | 'REJECTED' | 'NOT_FOUND';

export type SagaAction =
  | 'CAPTURE' //    CaptureHold -> COMPLETED
  | 'COMPENSATE' // -> COMPENSATING -> ReleaseHold -> FAILED
  | 'RESEND' //     POST /transfers again with the SAME reference (safe: the bank is idempotent by reference)
  | 'WAIT' //       nothing to do yet
  | 'IGNORE' //     stale or duplicate information
  | 'ALERT'; //     "impossible" combination: money may be wrong, a human must look

/** Every status in which the bank may already know the transfer (all but STARTED). */
export type InFlightOrDone = Exclude<PaymentStatus, 'STARTED'>;
