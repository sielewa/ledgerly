import type { InvoiceEvent, InvoiceStatus } from './invoice-state.types';

export class InvalidTransitionError extends Error {
  readonly from: InvoiceStatus;
  readonly event: InvoiceEvent;

  constructor(from: InvoiceStatus, event: InvoiceEvent) {
    super(`cannot apply ${event} to an invoice in status ${from}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.event = event;
  }
}
