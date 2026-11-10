// Stage 3, Problem 1: dual write -> lost event.
// Issues an invoice through the gateway and checks: is it ISSUED in invoices DB, and did notification-service
// get the event (row in notifications DB)? Correct result: ISSUED and exactly 1 notification.
//
// Usage (gateway, invoice-service and notification-service running):
//   node scripts/lost-event.ts                 create + issue a new invoice
//   node scripts/lost-event.ts <invoiceId>     retry "issue" for an existing invoice (e.g. after a crash)
//
// Run invoice-service with CRASH_AFTER_COMMIT=true to kill it between the DB commit and the publish.
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const INVOICES_DB =
  process.env.INVOICES_DATABASE_URL ?? 'postgres://invoice_svc:invoice_pw@localhost:5432/invoices';
const NOTIFICATIONS_DB =
  process.env.NOTIFICATIONS_DATABASE_URL ??
  'postgres://notification_svc:notification_pw@localhost:5432/notifications';

async function queryOne<T>(url: string, text: string, params: unknown[]): Promise<T | undefined> {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    return (await db.query(text, params)).rows[0] as T | undefined;
  } finally {
    await db.end();
  }
}

async function createInvoice(): Promise<string> {
  const res = await fetch(`${GATEWAY}/invoices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({
      payerAccountId: '11111111-1111-1111-1111-111111111111',
      payeeName: `lost-event-${Date.now()}`,
      payeeIban: 'PL61109010140000071219812874',
      amount: { amountMinor: '12300', currency: 'PLN' },
    }),
  });
  if (res.status !== 201) throw new Error(`create failed: HTTP ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

const invoiceId = process.argv[2] ?? (await createInvoice());
console.log(`invoice:                 ${invoiceId}`);

const issue = await fetch(`${GATEWAY}/invoices/${invoiceId}/issue`, { method: 'POST' });
console.log(`POST /issue:             HTTP ${issue.status}`);

// Give the event time to travel invoice-service -> Pub/Sub -> notification-service.
await new Promise((resolve) => setTimeout(resolve, 3000));

const invoice = await queryOne<{ status: string }>(
  INVOICES_DB,
  'SELECT status FROM invoices WHERE id = $1',
  [invoiceId],
);
const notifications = await queryOne<{ n: string }>(
  NOTIFICATIONS_DB,
  'SELECT count(*) AS n FROM notifications WHERE invoice_id = $1',
  [invoiceId],
);
console.log(`status in invoices DB:   ${invoice?.status}`);
console.log(`notifications sent:      ${notifications?.n}   (expected 1)`);
