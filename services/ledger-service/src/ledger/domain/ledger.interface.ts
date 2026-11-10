import type { AccountType, HoldStatus } from './ledger.types';

export interface Account {
  id: string;
  type: AccountType;
  currency: string;
  balanceMinor: bigint; // posted money (sum of entries)
  heldMinor: bigint; // reserved by ACTIVE holds
}

export interface Hold {
  id: string;
  accountId: string;
  amountMinor: bigint;
  status: HoldStatus;
  currency: string;
}

/** One side of a double-entry transaction. Signed: + credit to the account, - debit. */
export interface Leg {
  accountId: string;
  amount: bigint;
}
