// Ledger rules and invariants. Pure TypeScript: no NestJS, no database.
import type { Account, Leg } from './ledger.interface';

/** What a customer can still spend: posted balance minus reservations. */
export function available(account: Account): bigint {
  return account.balanceMinor - account.heldMinor;
}

/** The system account that mirrors money in Ledgerly's pooled bank account, one per currency. */
export function clearingAccountCode(currency: string): string {
  return `system:bank_clearing:${currency}`;
}

/** Double-entry invariant: at least two legs that sum to zero (money is moved, never created or destroyed). */
export function assertBalanced(legs: Leg[]): void {
  const sum = legs.reduce((acc, leg) => acc + leg.amount, 0n);
  if (legs.length < 2 || sum !== 0n) {
    throw new Error(`unbalanced transaction: ${legs.length} legs, sum ${sum}`);
  }
}
