import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config';
import { MAX_BODY_BYTES } from './bank.constants';
import { log } from './log';
import { sameRequest, validate } from './transfers';
import type { Transfer, TransferRequest } from './transfers.interface';
import { transfers } from './transfers.store';
import { deliver } from './webhooks';

//   POST /transfers              -> 202 PENDING (or 200 with the existing transfer for a repeated reference)
//   GET  /transfers/:reference   -> 200 transfer | 404
//   webhooks to WEBHOOK_URL:        transfer.pending, then transfer.settled | transfer.rejected

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Decides the outcome and sends the webhooks in the background. */
async function processTransfer(transfer: Transfer): Promise<void> {
  // Deterministic rejection for tests: an IBAN starting with "XX". Otherwise random, per REJECT_RATE.
  const rejected = transfer.creditorIban.startsWith('XX') || Math.random() < config.rejectRate;
  const pendingSnapshot = { ...transfer };

  if (!config.reorderWebhooks) await deliver('transfer.pending', pendingSnapshot);
  await sleep(config.webhookDelayMs);

  transfer.status = rejected ? 'REJECTED' : 'SETTLED';
  if (rejected) transfer.rejectionReason = 'creditor account closed';
  transfer.updatedAt = new Date().toISOString();
  log(`transfer ${transfer.reference} -> ${transfer.status}`);
  await deliver(rejected ? 'transfer.rejected' : 'transfer.settled', transfer);

  // REORDER_WEBHOOKS: the "pending" webhook arrives AFTER the final status. A receiver that blindly applies
  // every webhook would move a SETTLED payment back to PENDING.
  if (config.reorderWebhooks) await deliver('transfer.pending', pendingSnapshot);
}

async function createTransfer(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const error = validate(body);
  if (error) return send(res, 400, { error });
  const request = body as TransferRequest;

  // Idempotency by reference: the CLIENT's id. A retry after a timeout must not send the money twice.
  const existing = transfers.get(request.reference);
  if (existing) {
    if (!sameRequest(existing, request)) {
      return send(res, 409, {
        error: `reference ${request.reference} already used for a different transfer`,
      });
    }
    log(
      `POST /transfers ${request.reference}: repeated reference, returning existing (${existing.status})`,
    );
    return send(res, 200, existing);
  }

  // FAIL_RATE: a clean failure BEFORE anything is stored. Safe to retry.
  if (Math.random() < config.failRate) {
    log(`POST /transfers ${request.reference}: CHAOS 500 (not stored)`);
    return send(res, 500, { error: 'internal bank error' });
  }

  const now = new Date().toISOString();
  const transfer: Transfer = {
    reference: request.reference,
    amountMinor: request.amount.amountMinor,
    currency: request.amount.currency,
    creditorIban: request.creditorIban,
    creditorName: request.creditorName,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  };
  transfers.set(transfer.reference, transfer);
  void processTransfer(transfer).catch((err: unknown) =>
    log(`processing ${transfer.reference} failed: ${String(err)}`),
  );

  // TIMEOUT_RATE: the transfer IS stored and WILL settle, but the client never gets an answer.
  // Deterministic timeout for tests: an IBAN starting with "TT". Otherwise random, per TIMEOUT_RATE.
  if (transfer.creditorIban.startsWith('TT') || Math.random() < config.timeoutRate) {
    log(`POST /transfers ${transfer.reference}: CHAOS timeout (stored, no response)`);
    setTimeout(() => res.destroy(), 60_000).unref(); // hang up much later; the client's own timeout fires first
    return;
  }

  log(
    `POST /transfers ${transfer.reference}: accepted ${transfer.amountMinor} ${transfer.currency}`,
  );
  send(res, 202, transfer);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://bank');
  const match = /^\/transfers\/([^/]+)$/.exec(url.pathname);

  const handle = async (): Promise<void> => {
    if (req.method === 'POST' && url.pathname === '/transfers') return createTransfer(req, res);
    if (req.method === 'GET' && match) {
      const transfer = transfers.get(decodeURIComponent(match[1]!));
      return transfer ? send(res, 200, transfer) : send(res, 404, { error: 'transfer not found' });
    }
    send(res, 404, { error: 'not found' });
  };

  handle().catch((err: unknown) => {
    log(`${req.method} ${url.pathname} failed: ${String(err)}`);
    if (!res.headersSent) send(res, 400, { error: 'bad request' });
  });
});

server.listen(config.port, () => {
  log(`bank-simulator on :${config.port}, webhooks -> ${config.webhookUrl}`);
  log(
    `chaos: FAIL_RATE=${config.failRate} TIMEOUT_RATE=${config.timeoutRate} REJECT_RATE=${config.rejectRate} ` +
      `DUPLICATE_WEBHOOK_RATE=${config.duplicateWebhookRate} REORDER_WEBHOOKS=${config.reorderWebhooks} ` +
      `WEBHOOK_DELAY_MS=${config.webhookDelayMs}`,
  );
});
