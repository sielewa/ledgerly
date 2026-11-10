// Run: pnpm --filter payment-service test
// The cells that encode a real incident; the rest of the table is covered by its exhaustive type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from './payment-decision';

const cases = [
  // Problem 3: a timeout is an unknown outcome — ask, never compensate blindly.
  ['BANK_UNKNOWN', 'SETTLED', 'CAPTURE', 'timeout, but the bank paid: charge the customer'],
  [
    'BANK_UNKNOWN',
    'NOT_FOUND',
    'RESEND',
    'timeout, POST never arrived: resend with the same reference',
  ],
  // Webhook faster than our own HTTP response / crash before saving SENT_TO_BANK.
  ['FUNDS_HELD', 'SETTLED', 'CAPTURE', 'the bank knows before we saved SENT_TO_BANK'],
  // Problem 5: partial failure needs compensation, and compensation must be retried until done.
  ['SENT_TO_BANK', 'REJECTED', 'COMPENSATE', 'rejected: release the hold'],
  ['COMPENSATING', 'REJECTED', 'COMPENSATE', 'crash during ReleaseHold: finish it (idempotent)'],
  // Duplicates and out-of-order webhooks.
  ['COMPLETED', 'SETTLED', 'IGNORE', 'duplicate settled'],
  ['COMPLETED', 'PENDING', 'IGNORE', 'late pending after settled'],
  // Contradictions: never "fix" money automatically.
  ['FAILED', 'SETTLED', 'ALERT', 'money left after we gave up'],
  ['SENT_TO_BANK', 'NOT_FOUND', 'ALERT', 'the bank forgot a transfer it confirmed'],
  // Normal: insufficient funds = we never sent anything.
  ['FAILED', 'NOT_FOUND', 'IGNORE', 'never sent'],
] as const;

for (const [ours, bank, expected, why] of cases) {
  test(`${ours} + ${bank} -> ${expected} (${why})`, () => {
    assert.equal(decide(ours, bank), expected);
  });
}
