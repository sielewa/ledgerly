export type PaymentStatus =
  | 'STARTED'
  | 'FUNDS_HELD'
  | 'SENT_TO_BANK'
  | 'BANK_UNKNOWN'
  | 'COMPENSATING'
  | 'COMPLETED'
  | 'FAILED';
