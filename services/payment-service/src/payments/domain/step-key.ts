import type { Payment } from './payment.interface';

/**
 * Deterministic idempotency key for one step of one saga: derived from the PERSISTED payment id, so after a crash
 * the very same key is computed again. Never `randomUUID()` at the call site: a retry would get a new key and the
 * "idempotency" would protect nothing.
 */
export function stepKey(payment: Payment, step: string): string {
  return `payment:${payment.id}:${step}`;
}
