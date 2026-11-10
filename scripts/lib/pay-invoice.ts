// Shared by the saga scripts: create + issue an invoice through the gateway, then pay it.
import { randomUUID } from 'node:crypto';
import pg from 'pg';

export const GATEWAY = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const PAYMENTS_DB =
  process.env.PAYMENTS_DATABASE_URL ?? 'postgres://payment_svc:payment_pw@localhost:5432/payments';

async function post(path: string, body?: unknown, key?: string): Promise<Response> {
  return fetch(`${GATEWAY}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(key ? { 'idempotency-key': key } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Returns the invoice id and the payment id (looked up by idempotency key if the pay call failed/crashed). */
export async function payNewInvoice(
  accountId: string,
  iban: string,
  amountMinor = '12300',
): Promise<{ invoiceId: string; paymentId: string; http: number | string }> {
  const created = await post(
    '/invoices',
    {
      payerAccountId: accountId,
      payeeName: 'ACME sp. z o.o.',
      payeeIban: iban,
      amount: { amountMinor, currency: 'PLN' },
    },
    randomUUID(),
  );
  const { id: invoiceId } = (await created.json()) as { id: string };
  await post(`/invoices/${invoiceId}/issue`);

  const key = randomUUID();
  let http: number | string;
  try {
    http = (await post(`/invoices/${invoiceId}/pay`, undefined, key)).status;
  } catch (err) {
    http = String(err);
  }
  const db = new pg.Client({ connectionString: PAYMENTS_DB });
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM payments WHERE idempotency_key = $1',
      [key],
    );
    return { invoiceId, paymentId: rows[0]!.id, http };
  } finally {
    await db.end();
  }
}

export async function invoiceStatus(invoiceId: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/invoices/${invoiceId}`);
  return ((await res.json()) as { status: string }).status;
}

export async function paymentStatus(paymentId: string): Promise<string> {
  const res = await fetch(`${GATEWAY}/payments/${paymentId}`);
  return ((await res.json()) as { status: string }).status;
}
