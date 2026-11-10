// Stage 2 problem: duplicate submission (double click / retry after a lost response) on POST /invoices.
// The user clicked "Create" ONCE (double click / retry). Correct result: exactly 1 invoice per scenario.
//
// The client generates the Idempotency-Key once per user intent (per opened form) and resends it on every
// retry. Only the client can do that: the gateway sees two clicks as two unrelated HTTP requests.
//
// Usage: node scripts/double-submit-invoice.ts   (gateway on :3000 and invoice-service must be running)
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const run = Date.now();

function createInvoice(
  payeeName: string,
  idempotencyKey: string | null,
  amountMinor = '12300',
): Promise<Response> {
  return fetch(`${GATEWAY}/invoices`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      payerAccountId: '11111111-1111-1111-1111-111111111111',
      payeeName,
      payeeIban: 'PL61109010140000071219812874',
      amount: { amountMinor, currency: 'PLN' },
    }),
  });
}

async function countInvoices(payeeName: string): Promise<number> {
  const db = new pg.Client({
    connectionString:
      process.env.INVOICES_DATABASE_URL ??
      'postgres://invoice_svc:invoice_pw@localhost:5432/invoices',
  });
  await db.connect();
  try {
    const { rows } = await db.query<{ n: string }>(
      'SELECT count(*) AS n FROM invoices WHERE payee_name = $1',
      [payeeName],
    );
    return Number(rows[0]!.n);
  } finally {
    await db.end();
  }
}

const idOf = async (r: Response) => ((await r.json()) as { id?: string }).id;

// 1. Double click: the button fires two identical requests ~at the same time (same form -> same key).
const doubleClick = `double-click-${run}`;
const formKey = randomUUID();
const responses = await Promise.all([
  createInvoice(doubleClick, formKey),
  createInvoice(doubleClick, formKey),
]);
const ids = await Promise.all(responses.map(idOf));
console.log(`1. double click:         HTTP ${responses.map((r) => r.status).join(', ')}`);
console.log(`   same invoice id:      ${ids[0] === ids[1]}`);
console.log(`   invoices created:     ${await countInvoices(doubleClick)}   (expected 1)`);

// 2. Retry after a lost response: the request succeeded on the server, but the client never saw the
//    answer (timeout, network drop, mobile switching cells), so it sends the same request again.
const retry = `retry-${run}`;
const retryKey = randomUUID();
await createInvoice(retry, retryKey); // pretend this response was lost on the way back
const second = await createInvoice(retry, retryKey);
console.log(`2. retry after timeout:  HTTP ${second.status}`);
console.log(`   invoices created:     ${await countInvoices(retry)}   (expected 1)`);

// 3. Two identical invoices ON PURPOSE (two deliveries in one month): two forms -> two keys -> two invoices.
//    This is why the key must not be a hash of the body and why UNIQUE(payee, amount, iban) would be wrong.
const onPurpose = `on-purpose-${run}`;
await createInvoice(onPurpose, randomUUID());
await createInvoice(onPurpose, randomUUID());
console.log(
  `3. two forms, same data: invoices created: ${await countInvoices(onPurpose)}   (expected 2)`,
);

// 4. No header at all: rejected, nothing created.
const noKey = `no-key-${run}`;
const missing = await createInvoice(noKey, null);
console.log(
  `4. no Idempotency-Key:   HTTP ${missing.status} (expected 400), invoices created: ${await countInvoices(noKey)}`,
);

// 5. Client bug: the same key reused for a DIFFERENT request. Must not silently return the old invoice.
const reused = await createInvoice(doubleClick, formKey, '99900');
console.log(
  `5. key reused, new body: HTTP ${reused.status} (expected 400) ${JSON.stringify(await reused.json())}`,
);
