// An EXTERNAL, unreliable bank. Not one of our services: no Nest, no database, no shared packages —
// in real life we wouldn't see its code at all, only its REST API and webhooks.

function rate(name: string): number {
  const value = Number(process.env[name] ?? 0);
  if (!(value >= 0 && value <= 1))
    throw new Error(`${name} must be between 0 and 1, got ${process.env[name]}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // Where the bank sends webhooks (payment-service in Stage 5).
  webhookUrl: process.env.WEBHOOK_URL ?? 'http://localhost:3100/webhooks/bank',
  // Shared secret, agreed out of band. Both sides compute HMAC-SHA256 with it.
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'dev-webhook-secret',
  // How long after acceptance the transfer settles/is rejected (and the webhook goes out).
  webhookDelayMs: Number(process.env.WEBHOOK_DELAY_MS ?? 2000),

  // --- chaos switches (probabilities 0..1) ---
  failRate: rate('FAIL_RATE'), // 500, transfer NOT stored
  timeoutRate: rate('TIMEOUT_RATE'), // transfer STORED, response never sent
  rejectRate: rate('REJECT_RATE'), // accepted, later transfer.rejected
  duplicateWebhookRate: rate('DUPLICATE_WEBHOOK_RATE'), // the same webhook delivered twice
  reorderWebhooks: process.env.REORDER_WEBHOOKS === 'true', // final status arrives BEFORE transfer.pending
};
