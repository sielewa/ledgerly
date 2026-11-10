// Problem 4 — race condition / double spend.
// Deposits DEPOSIT_ZL into a fresh account, then fires PARALLEL PlaceHold calls of HOLD_ZL at once.
// Correct result: at most floor(DEPOSIT_ZL / HOLD_ZL) holds succeed, the rest fail with FAILED_PRECONDITION,
// and available balance never goes below zero.
//
// Usage: node scripts/race-place-hold.ts   (ledger-service must be running)
//        PARALLEL=50 DEPOSIT_ZL=100 HOLD_ZL=10 node scripts/race-place-hold.ts
import type { ServiceError } from '@grpc/grpc-js';
import { codeName, createLedgerClient } from './lib/ledger-client.ts';
import { reconcile, withLedgerDb } from './lib/ledger-db.ts';

const PARALLEL = Number(process.env.PARALLEL ?? 50);
const DEPOSIT_ZL = Number(process.env.DEPOSIT_ZL ?? 100);
const HOLD_ZL = Number(process.env.HOLD_ZL ?? 10);
const pln = (zl: number) => ({ amountMinor: String(zl * 100), currency: 'PLN' });

const ledger = createLedgerClient();
const run = Date.now();

try {
  const { accountId } = await ledger.openAccount({
    idempotencyKey: `race-open-${run}`,
    code: `customer:race-${run}:PLN`,
    currency: 'PLN',
  });
  await ledger.postDeposit({
    idempotencyKey: `race-dep-${run}`,
    accountId,
    amount: pln(DEPOSIT_ZL),
  });

  console.log(
    `Deposited ${DEPOSIT_ZL} zł. Firing ${PARALLEL} parallel PlaceHold x ${HOLD_ZL} zł...`,
  );
  console.log(`Expected: at most ${Math.floor(DEPOSIT_ZL / HOLD_ZL)} holds succeed.\n`);

  const started = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: PARALLEL }, (_, i) =>
      ledger.placeHold({
        idempotencyKey: `race-hold-${run}-${i}`,
        accountId,
        amount: pln(HOLD_ZL),
      }),
    ),
  );
  const ms = Math.round(performance.now() - started);

  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const errors = new Map<string, number>();
  for (const r of results) {
    if (r.status === 'rejected') {
      const name = codeName((r.reason as ServiceError).code);
      errors.set(name, (errors.get(name) ?? 0) + 1);
    }
  }

  const b = await ledger.getBalance({ accountId });
  const zl = (m?: { amountMinor: string }) => (Number(m?.amountMinor) / 100).toFixed(2);

  console.log(`Holds succeeded: ${ok}   (in ${ms} ms)`);
  console.log(`Holds failed:    ${[...errors].map(([k, v]) => `${k} x${v}`).join(', ') || 0}`);
  console.log(
    `Balance:         balance ${zl(b.balance)} | held ${zl(b.held)} | available ${zl(b.available)}`,
  );

  console.log('\nReconciliation:');
  const violations = await withLedgerDb(reconcile);
  process.exitCode = violations === 0 ? 0 : 1;
} finally {
  ledger.close();
}
