// Creates (once) a demo customer account with 1000.00 PLN and writes its id to apps/web/.env.local,
// so the web panel knows which account pays the invoices. Safe to run many times: fixed idempotency keys.
//
// Usage (ledger-service running): pnpm seed
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLedgerClient } from './lib/ledger-client.ts';

const ledger = createLedgerClient();

const { accountId } = await ledger.openAccount({
  idempotencyKey: 'seed:demo-account',
  code: 'customer:demo:PLN',
  currency: 'PLN',
});
await ledger.postDeposit({
  idempotencyKey: 'seed:demo-deposit',
  accountId,
  amount: { amountMinor: '100000', currency: 'PLN' },
});

const envFile = join(import.meta.dirname, '..', 'apps', 'web', '.env.local');
mkdirSync(dirname(envFile), { recursive: true });
writeFileSync(envFile, `VITE_DEMO_ACCOUNT_ID=${accountId}\n`);
console.log(`demo account ${accountId} (1000.00 PLN) -> ${envFile}`);
