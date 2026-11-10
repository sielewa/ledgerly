// Pure module: no Nest, no database. The service asks it "is this allowed and where do I end up?"
import { InvalidTransitionError } from './invalid-transition.error';
import { TRANSITIONS } from './invoice-state.constants';
import type { InvoiceEvent, InvoiceStatus } from './invoice-state.types';

export function transition(from: InvoiceStatus, event: InvoiceEvent): InvoiceStatus {
  const next = TRANSITIONS[from][event];
  if (next === undefined) throw new InvalidTransitionError(from, event);
  return next;
}
