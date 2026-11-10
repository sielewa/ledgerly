// Happy-path walkthrough of the ledger: deposit -> hold -> capture, plus idempotency checks.
// Usage: node scripts/ledger-scenario.ts   (ledger-service must be running)
import type { ServiceError } from '@grpc/grpc-js';
import { codeName, createLedgerClient } from './lib/ledger-client.ts';
import { reconcile, withLedgerDb } from './lib/ledger-db.ts';

const ledger = createLedgerClient();
const run = Date.now();
const pln = (zl: number) => ({ amountMinor: String(zl * 100), currency: 'PLN' });

async function showBalance(label: string, accountId: string): Promise<void> {
  const b = await ledger.getBalance({ accountId });
  const zl = (m?: { amountMinor: string }) => (Number(m?.amountMinor) / 100).toFixed(2);
  console.log(
    `${label.padEnd(28)} balance ${zl(b.balance)} | held ${zl(b.held)} | available ${zl(b.available)}`,
  );
}

async function expectError(label: string, call: Promise<unknown>): Promise<void> {
  try {
    await call;
    console.log(`${label.padEnd(28)} UNEXPECTED SUCCESS`);
  } catch (err) {
    const e = err as ServiceError;
    console.log(`${label.padEnd(28)} ${codeName(e.code)}: ${e.details}`);
  }
}

try {
  const { accountId } = await ledger.openAccount({
    idempotencyKey: `open-${run}`,
    code: `customer:acme-${run}:PLN`,
    currency: 'PLN',
  });
  await showBalance('1. account opened', accountId);

  await ledger.postDeposit({ idempotencyKey: `dep-${run}`, accountId, amount: pln(1000) });
  await showBalance('2. deposit 1000', accountId);

  const hold = await ledger.placeHold({
    idempotencyKey: `hold-${run}`,
    accountId,
    amount: pln(300),
  });
  await showBalance('3. hold 300', accountId);

  await ledger.captureHold({ idempotencyKey: `cap-${run}`, holdId: hold.holdId });
  await showBalance('4. capture', accountId);

  console.log('\n--- idempotency ---');
  const again = await ledger.postDeposit({
    idempotencyKey: `dep-${run}`,
    accountId,
    amount: pln(1000),
  });
  console.log(`${'retry deposit (same key)'.padEnd(28)} ok, tx ${again.transactionId}`);
  await showBalance('   balance after retry', accountId);
  await expectError(
    'same key, other amount',
    ledger.postDeposit({ idempotencyKey: `dep-${run}`, accountId, amount: pln(5) }),
  );

  console.log('\n--- rules ---');
  await expectError(
    'capture again (new key)',
    ledger.captureHold({ idempotencyKey: `cap2-${run}`, holdId: hold.holdId }),
  );
  await expectError(
    'hold more than available',
    ledger.placeHold({ idempotencyKey: `big-${run}`, accountId, amount: pln(5000) }),
  );
  await expectError(
    'wrong currency',
    ledger.postDeposit({
      idempotencyKey: `eur-${run}`,
      accountId,
      amount: { amountMinor: '100', currency: 'EUR' },
    }),
  );

  console.log('\n--- release ---');
  // Happy path: a released hold gives the money back to "available"; balance never changes.
  const toRelease = await ledger.placeHold({
    idempotencyKey: `hold2-${run}`,
    accountId,
    amount: pln(200),
  });
  await showBalance('5. hold 200', accountId);
  await ledger.releaseHold({ idempotencyKey: `rel-${run}`, holdId: toRelease.holdId });
  await showBalance('6. release', accountId);

  await ledger.releaseHold({
    idempotencyKey: `rel-${run}`,
    holdId: toRelease.holdId,
  });
  await showBalance('7. retry release', accountId);

  await expectError(
    'release again (new key)',
    ledger.releaseHold({
      idempotencyKey: `rel2-${run}`,
      holdId: toRelease.holdId,
    }),
  );
  await expectError(
    'capture after release',
    ledger.captureHold({ idempotencyKey: `cap3-${run}`, holdId: toRelease.holdId }),
  );
  await expectError(
    'release a captured hold',
    ledger.releaseHold({ idempotencyKey: `rel3-${run}`, holdId: hold.holdId }),
  );
  // Regression: ReleaseHold once used CaptureHold's idempotency namespace, so reusing the capture key
  // silently returned the cached capture response (OK) and released nothing.
  await expectError(
    'release with the capture key',
    ledger.releaseHold({ idempotencyKey: `cap-${run}`, holdId: hold.holdId }),
  );
  await expectError(
    'release unknown hold',
    ledger.releaseHold({
      idempotencyKey: `rel4-${run}`,
      holdId: '00000000-0000-0000-0000-000000000000',
    }),
  );

  console.log('\n--- reconciliation ---');
  const violations = await withLedgerDb(reconcile);
  process.exitCode = violations === 0 ? 0 : 1;
} finally {
  ledger.close();
}
