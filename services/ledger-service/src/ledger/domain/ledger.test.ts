// Run: pnpm --filter ledger-service test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBalanced, available } from './ledger';
import type { Account } from './ledger.interface';

test('a deposit is balanced: customer +100, clearing -100', () => {
  assert.doesNotThrow(() =>
    assertBalanced([
      { accountId: 'customer', amount: 100n },
      { accountId: 'clearing', amount: -100n },
    ]),
  );
});

test('legs that do not sum to zero are rejected (money created out of thin air)', () => {
  assert.throws(() =>
    assertBalanced([
      { accountId: 'customer', amount: 100n },
      { accountId: 'clearing', amount: -99n },
    ]),
  );
});

test('a single leg is rejected even if it is zero', () => {
  assert.throws(() => assertBalanced([{ accountId: 'customer', amount: 0n }]));
});

test('available = balance - held', () => {
  const account: Account = {
    id: 'a',
    type: 'CUSTOMER',
    currency: 'PLN',
    balanceMinor: 100_000n,
    heldMinor: 12_300n,
  };
  assert.equal(available(account), 87_700n);
});
