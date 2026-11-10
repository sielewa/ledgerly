import type { TransferStatus } from './transfers.types';

export interface Transfer {
  reference: string; // chosen by the CLIENT (our payment id); the bank's idempotency key
  amountMinor: string;
  currency: string;
  creditorIban: string;
  creditorName: string;
  status: TransferStatus;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransferRequest {
  reference: string;
  amount: { amountMinor: string; currency: string };
  creditorIban: string;
  creditorName: string;
}
