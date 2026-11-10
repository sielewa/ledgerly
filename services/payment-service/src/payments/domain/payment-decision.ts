import { DECISIONS } from './payment-decision.constants';
import type { BankView, SagaAction } from './payment-decision.types';
import type { PaymentStatus } from './payment.types';

export function decide(status: PaymentStatus, bank: BankView): SagaAction {
  // STARTED: the hold isn't even placed; the bank can't know this payment. Leave it to the start() flow.
  if (status === 'STARTED') return 'WAIT';
  return DECISIONS[status][bank];
}
