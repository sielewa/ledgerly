// Stage 3, Problem 2: duplicate delivery. The outbox relay is at-least-once: if it dies after publishing
// but before marking the rows as published, it publishes them again after restart. Pub/Sub itself is also
// at-least-once (redelivery after a missed ack deadline). The consumer must turn this into effectively-once.
// Correct result: exactly 1 notification per event, however many times the event is delivered.
//
// Usage:
//   1. start invoice-service with CRASH_AFTER_PUBLISH=true
//   2. node scripts/duplicate-delivery.ts              -> creates + issues an invoice, relay publishes and dies
//   3. restart invoice-service normally                -> relay publishes the same event again
//   4. node scripts/duplicate-delivery.ts <invoiceId>  -> counts notifications for that invoice
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const NOTIFICATIONS_DB =
  process.env.NOTIFICATIONS_DATABASE_URL ??
  'postgres://notification_svc:notification_pw@localhost:5432/notifications';

async function report(invoiceId: string): Promise<void> {
  const db = new pg.Client({ connectionString: NOTIFICATIONS_DB });
  await db.connect();
  try {
    const { rows } = await db.query<{ notifications: string; events: string }>(
      `SELECT count(*) AS notifications, count(DISTINCT event_id) AS events
       FROM notifications WHERE invoice_id = $1`,
      [invoiceId],
    );
    console.log(`invoice:                 ${invoiceId}`);
    console.log(`distinct events:         ${rows[0]!.events}`);
    console.log(`notifications sent:      ${rows[0]!.notifications}   (expected 1)`);
  } finally {
    await db.end();
  }
}

const existing = process.argv[2];
if (existing) {
  await report(existing);
} else {
  const created = await fetch(`${GATEWAY}/invoices`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({
      payerAccountId: '11111111-1111-1111-1111-111111111111',
      payeeName: `duplicate-delivery-${Date.now()}`,
      payeeIban: 'PL61109010140000071219812874',
      amount: { amountMinor: '12300', currency: 'PLN' },
    }),
  });
  const { id } = (await created.json()) as { id: string };
  const issue = await fetch(`${GATEWAY}/invoices/${id}/issue`, { method: 'POST' });
  console.log(`POST /issue:             HTTP ${issue.status}`);
  await new Promise((resolve) => setTimeout(resolve, 6000)); // relay tick + Pub/Sub + consumer (first publish after start is slower)
  await report(id);
}
