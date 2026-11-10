export const MAX_BODY_BYTES = 64 * 1024;
// Webhook delivery: 1 + retries with exponential backoff (1s, 2s, 4s, 8s), then give up.
export const MAX_WEBHOOK_ATTEMPTS = 5;
