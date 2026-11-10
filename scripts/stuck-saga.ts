// Stage 5, Problem 10: stuck saga. payment-service dies right after the bank accepted the transfer
// (CRASH_AFTER_BANK_CALL=true), the bank gives up delivering webhooks to the dead service, and after a restart
// nothing moves the payment on — until the sweeper reconciles it with the bank.
//
// Usage:
//   1. payment-service with CRASH_AFTER_BANK_CALL=true, then:  node scripts/stuck-saga.ts
//   2. wait ~20 s (the bank retries webhooks 1+2+4+8 s, then gives up), restart payment-service normally
//   3. node scripts/stuck-saga.ts <paymentId>            -> still stuck
//   4. curl -X POST localhost:3100/sweep; node scripts/stuck-saga.ts <paymentId>
import pg from 'pg';
import { createLedgerClient } from './lib/ledger-client.ts';
import { invoiceStatus, payNewInvoice } from './lib/pay-invoice.ts';

const BANK = process.env.BANK_URL ?? 'http://localhost:4000';
const PAYMENTS_DB =
  process.env.PAYMENTS_DATABASE_URL ?? 'postgres://payment_svc:payment_pw@localhost:5432/payments';
const ledger = createLedgerClient();
const zl = (minor?: string) => (Number(minor ?? 0) / 100).toFixed(2);

async function paymentRow(where: string, value: string) {
  const db = new pg.Client({ connectionString: PAYMENTS_DB });
  await db.connect();
  try {
    const { rows } = await db.query<{
      id: string;
      status: string;
      payer_account_id: string;
      invoice_id: string;
    }>(`SELECT id, status, payer_account_id, invoice_id FROM payments WHERE ${where} = $1`, [
      value,
    ]);
    return rows[0]!;
  } finally {
    await db.end();
  }
}

async function report(paymentId: string): Promise<void> {
  const p = await paymentRow('id', paymentId);
  const bankRes = await fetch(`${BANK}/transfers/${paymentId}`);
  const bank = bankRes.ok ? ((await bankRes.json()) as { status: string }).status : 'NOT FOUND';
  const b = await ledger.getBalance({ accountId: p.payer_account_id });
  console.log(`payment ${paymentId}`);
  console.log(`   invoice status:   ${await invoiceStatus(p.invoice_id)}`);
  console.log(`   payment status:   ${p.status}`);
  console.log(`   bank transfer:    ${bank}`);
  console.log(
    `   ledger:           balance ${zl(b.balance?.amountMinor)} | held ${zl(b.held?.amountMinor)}`,
  );
}

const existing = process.argv[2];
if (existing) {
  await report(existing);
} else {
  const run = Date.now();
  const { accountId } = await ledger.openAccount({
    idempotencyKey: `open-stuck-${run}`,
    code: `customer:stuck-${run}:PLN`,
    currency: 'PLN',
  });
  await ledger.postDeposit({
    idempotencyKey: `dep-stuck-${run}`,
    accountId,
    amount: { amountMinor: '100000', currency: 'PLN' },
  });
  const { paymentId, http } = await payNewInvoice(accountId, 'PL61109010140000071219812874');
  console.log(`POST /invoices/:id/pay -> ${http} (payment-service died mid-saga)`);
  await report(paymentId);
}
