import type { Transfer } from './transfers.interface';
import type { WebhookType } from './webhooks.types';

export interface WebhookEvent {
  id: string; // unique per webhook event: the receiver deduplicates on it
  type: WebhookType;
  createdAt: string;
  data: Transfer; // snapshot of the transfer at the time of the event
}
