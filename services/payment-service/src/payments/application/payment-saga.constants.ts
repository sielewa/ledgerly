import { status } from '@grpc/grpc-js';

/**
 * Ledger answers to PlaceHold that will NEVER change on retry: the payment fails right away (no hold was placed,
 * so there is nothing to compensate) and the invoice goes back to ISSUED.
 *   FAILED_PRECONDITION  insufficient funds
 *   NOT_FOUND            the payer account doesn't exist
 *   INVALID_ARGUMENT     not a customer account, currency mismatch
 * Anything else (UNAVAILABLE, DEADLINE_EXCEEDED, ...) may succeed later: the payment stays STARTED and the
 * sweeper retries PlaceHold with the same idempotency key.
 */
export const PERMANENT_LEDGER_ERRORS: readonly number[] = [
  status.FAILED_PRECONDITION,
  status.NOT_FOUND,
  status.INVALID_ARGUMENT,
];
