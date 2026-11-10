// One topic per producing domain; consumers filter by `type`.
export const TOPICS = {
  invoiceEvents: 'invoice-events',
  paymentEvents: 'payment-events',
} as const;
