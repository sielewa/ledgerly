// Smoke test of the bank simulator's contract: idempotency by reference, status query, webhooks.
// Starts a tiny webhook receiver on :3100 (where payment-service will listen in Stage 5) that only PRINTS
// what arrives — it does NOT verify signatures yet (that's the next task).
//
// Usage: pnpm --filter bank-simulator start   (in another terminal), then: node scripts/bank-smoke.ts
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const BANK = process.env.BANK_URL ?? 'http://localhost:4000';

const received: string[] = [];
const receiver = createServer((req, res) => {
  let body = '';
  req.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
  req.on('end', () => {
    const event = JSON.parse(body) as {
      id: string;
      type: string;
      data: { reference: string; status: string };
    };
    const line = `${event.type.padEnd(18)} ${event.data.reference}  status=${event.data.status}  event=${event.id.slice(0, 8)}`;
    received.push(line);
    console.log(
      `   webhook <- ${line}\n               bank-signature: ${String(req.headers['bank-signature'])}`,
    );
    res.writeHead(200).end();
  });
});
await new Promise<void>((resolve) => receiver.listen(3100, resolve));

async function post(
  reference: string,
  iban = 'PL61109010140000071219812874',
  amountMinor = '12300',
) {
  const res = await fetch(`${BANK}/transfers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      reference,
      amount: { amountMinor, currency: 'PLN' },
      creditorIban: iban,
      creditorName: 'ACME sp. z o.o.',
    }),
  });
  const body = (await res.json()) as { status?: string; error?: string };
  return `HTTP ${res.status} ${body.status ?? body.error}`;
}

const ok = `pay_${randomUUID().slice(0, 8)}`;
const bad = `pay_${randomUUID().slice(0, 8)}`;

console.log(`1. POST /transfers ${ok}:                  ${await post(ok)}`);
console.log(
  `2. same reference again (retry):          ${await post(ok)}   <- same transfer, no 2nd payment`,
);
console.log(`3. same reference, different amount:      ${await post(ok, undefined, '99900')}`);
console.log(
  `4. GET /transfers/${ok}:                  HTTP ${(await fetch(`${BANK}/transfers/${ok}`)).status}`,
);
console.log(
  `5. GET unknown reference:                 HTTP ${(await fetch(`${BANK}/transfers/pay_nope`)).status}`,
);
console.log(
  `6. POST with IBAN "XX…" (will reject):    ${await post(bad, 'XX00000000000000000000')}`,
);

console.log('\nwaiting for webhooks...');
await new Promise((resolve) => setTimeout(resolve, 4000));
const final = (await (await fetch(`${BANK}/transfers/${ok}`)).json()) as { status: string };
console.log(`\n7. GET /transfers/${ok} after settle:     ${final.status}`);
console.log(
  `   webhooks received: ${received.length} (expected 4: pending+settled, pending+rejected)`,
);
receiver.close();
