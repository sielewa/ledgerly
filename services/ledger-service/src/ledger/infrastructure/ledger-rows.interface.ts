import type { AccountType, HoldStatus } from '../domain/ledger.types';

/** A row of the accounts table, as Postgres returns it (bigint as string). */
export interface AccountRow {
  id: string;
  type: AccountType;
  currency: string;
  balance_minor: string;
  held_minor: string;
}

/** A hold joined with its account's currency. */
export interface HoldRow {
  id: string;
  account_id: string;
  amount_minor: string;
  status: HoldStatus;
  currency: string;
}
