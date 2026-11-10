/** The part of the bank's webhook payload we use: it's only a NOTIFICATION, the status is fetched by GET. */
export interface BankWebhookEvent {
  id: string;
  type: 'transfer.pending' | 'transfer.settled' | 'transfer.rejected';
  data: { reference: string };
}
