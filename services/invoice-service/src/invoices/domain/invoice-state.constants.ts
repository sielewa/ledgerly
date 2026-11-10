import type { InvoiceEvent, InvoiceStatus } from './invoice-state.types';

// Invoice lifecycle as an explicit state machine: (current status, event) -> next status.
//
//   DRAFT --ISSUE--> ISSUED --START_PAYMENT--> PAYMENT_PENDING --PAYMENT_SUCCEEDED--> PAID
//                      ^                              |
//                      +-------PAYMENT_FAILED---------+
export const TRANSITIONS: Record<InvoiceStatus, Partial<Record<InvoiceEvent, InvoiceStatus>>> = {
  DRAFT: { ISSUE: 'ISSUED' },
  ISSUED: { START_PAYMENT: 'PAYMENT_PENDING' },
  PAYMENT_PENDING: {
    PAYMENT_SUCCEEDED: 'PAID',
    PAYMENT_FAILED: 'ISSUED',
  },
  PAID: {},
};
