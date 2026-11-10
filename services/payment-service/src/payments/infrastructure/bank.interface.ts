import type { BankTransferStatus } from './bank.types';

/** The bank's view of a transfer (subset of its response we rely on). */
export interface BankTransfer {
  reference: string;
  status: BankTransferStatus;
}

export interface BankTransferRequest {
  reference: string; // our payment id: the bank's idempotency key
  amountMinor: string;
  currency: string;
  creditorIban: string;
  creditorName: string;
}
