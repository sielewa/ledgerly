// Stage 5: the "pay an invoice" saga against an unreliable bank. Three scenarios, each on a fresh account with 1000 PLN:
//   happy    -> bank settles
//   rejected -> bank rejects (IBAN "XX…")          Problem 5: partial failure, needs compensation
//   timeout  -> bank stores it but never answers (IBAN "TT…"), then settles   Problem 3: unknown outcome
//
// For each one we compare FOUR sources of truth: the invoice status (moved by payment.* events), our payment
// status, the bank's transfer status, and the customer's ledger balance. In a correct system they always tell the same story.
//
// Usage (all services running, see README): node scripts/payment-saga.ts
import { createLedgerClient } from './lib/ledger-client.ts';
import { invoiceStatus, payNewInvoice, paymentStatus } from './lib/pay-invoice.ts';

const BANK = process.env.BANK_URL ?? 'http://localhost:4000';
const ledger = createLedgerClient();
const run = Date.now();
const zl = (minor?: string) => (Number(minor ?? 0) / 100).toFixed(2);

async function freshAccount(name: string): Promise<string> {
  const { accountId } = await ledger.openAccount({
    idempotencyKey: `open-${name}-${run}`,
    code: `customer:${name}-${run}:PLN`,
    currency: 'PLN',
  });
  await ledger.postDeposit({
    idempotencyKey: `dep-${name}-${run}`,
    accountId,
    amount: { amountMinor: '100000', currency: 'PLN' },
  });
  return accountId;
}

async function report(
  label: string,
  accountId: string,
  invoiceId: string,
  paymentId: string,
): Promise<void> {
  const bankRes = await fetch(`${BANK}/transfers/${paymentId}`);
  const bank = bankRes.ok ? ((await bankRes.json()) as { status: string }).status : 'NOT FOUND';
  const b = await ledger.getBalance({ accountId });
  console.log(`${label}`);
  console.log(`   invoice status:   ${await invoiceStatus(invoiceId)}`);
  console.log(`   payment status:   ${await paymentStatus(paymentId)}`);
  console.log(`   bank transfer:    ${bank}`);
  console.log(
    `   ledger:           balance ${zl(b.balance?.amountMinor)} | held ${zl(b.held?.amountMinor)} | available ${zl(b.available?.amountMinor)}`,
  );
}

const scenarios = [
  {
    label: '1. happy path',
    iban: 'PL61109010140000071219812874',
    expect: 'PAID, COMPLETED, SETTLED, balance 877.00, held 0.00',
  },
  {
    label: '2. bank rejects',
    iban: 'XX00000000000000000000',
    expect: 'ISSUED (can be paid again), FAILED, REJECTED, balance 1000.00, held 0.00',
  },
  {
    label: '3. bank times out',
    iban: 'TT61109010140000071219812874',
    expect: 'PAID, COMPLETED, SETTLED, balance 877.00, held 0.00',
  },
];

const started = [];
for (const s of scenarios) {
  const accountId = await freshAccount(s.label.slice(0, 1));
  const paid = await payNewInvoice(accountId, s.iban);
  started.push({ ...s, accountId, ...paid });
}

console.log('waiting for the bank to settle/reject and send webhooks...\n');
await new Promise((resolve) => setTimeout(resolve, 6000));

for (const s of started) {
  await report(`${s.label}   (POST /pay -> HTTP ${s.http})`, s.accountId, s.invoiceId, s.paymentId);
  console.log(`   expected:         ${s.expect}\n`);
}
