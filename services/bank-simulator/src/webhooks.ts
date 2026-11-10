import { createHmac, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config';
import { MAX_WEBHOOK_ATTEMPTS } from './bank.constants';
import { log } from './log';
import type { Transfer } from './transfers.interface';
import type { WebhookEvent } from './webhooks.interface';
import type { WebhookType } from './webhooks.types';

/**
 * Signature header, Stripe-style: `Bank-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>`.
 * The signed string is `${t}.${rawBody}`: the timestamp is covered by the signature, so an attacker
 * can't take an old, validly signed webhook and just change its timestamp to replay it.
 */
export function sign(rawBody: string, timestamp: number, secret = config.webhookSecret): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** Delivers one webhook, retrying non-2xx answers with exponential backoff (1s, 2s, 4s, 8s), like real banks. */
export async function deliver(type: WebhookType, transfer: Transfer): Promise<void> {
  const event: WebhookEvent = {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    data: { ...transfer },
  };
  const body = JSON.stringify(event);
  const copies = Math.random() < config.duplicateWebhookRate ? 2 : 1;

  for (let copy = 1; copy <= copies; copy++) {
    for (let attempt = 1; attempt <= MAX_WEBHOOK_ATTEMPTS; attempt++) {
      try {
        // Signed at send time: a retry a minute later carries a fresh timestamp, same body and event id.
        const status = await post(body, sign(body, Math.floor(Date.now() / 1000)));
        log(
          `webhook ${type} ${event.id} (${transfer.reference}) copy ${copy}/${copies} -> HTTP ${status}`,
        );
        if (status >= 200 && status < 300) break;
      } catch (err) {
        log(`webhook ${type} ${event.id} attempt ${attempt} failed: ${String(err)}`);
      }
      if (attempt === MAX_WEBHOOK_ATTEMPTS) {
        log(`webhook ${type} ${event.id} GAVE UP after ${MAX_WEBHOOK_ATTEMPTS} attempts`);
      } else {
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
}

// node:http instead of fetch: on Node 24 / macOS, undici's fetch to a refused port threw `setTypeOfService EINVAL`
// from a socket event handler (uncatchable by try/catch) and killed the whole bank process.
function post(body: string, signature: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      config.webhookUrl,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          'bank-signature': signature,
        },
        timeout: 5000,
      },
      (res) => {
        res.resume(); // drain the body, we only need the status
        resolve(res.statusCode ?? 0);
      },
    );
    req.on('timeout', () => req.destroy(new Error('webhook timed out')));
    req.on('error', reject);
    req.end(body);
  });
}
