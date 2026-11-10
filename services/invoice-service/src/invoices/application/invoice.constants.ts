import type { PaymentEventV1 } from '@ledgerly/events';
import type { InvoiceEvent } from '../domain/invoice-state.types';

/** payment.* events (another service's language) -> events of our invoice state machine. */
export const PAYMENT_EVENT_TO_INVOICE_EVENT: Record<PaymentEventV1['type'], InvoiceEvent> = {
  'payment.started': 'START_PAYMENT',
  'payment.completed': 'PAYMENT_SUCCEEDED',
  'payment.failed': 'PAYMENT_FAILED',
};
