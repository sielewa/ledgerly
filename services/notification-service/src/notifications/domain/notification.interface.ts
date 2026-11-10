/** One notification to send (here: a row = one "email"). */
export interface NewNotification {
  eventId: string;
  eventType: string;
  invoiceId: string;
  message: string;
}
