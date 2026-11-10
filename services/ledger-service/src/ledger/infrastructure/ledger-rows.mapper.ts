import type { Account, Hold } from '../domain/ledger.interface';
import type { AccountRow, HoldRow } from './ledger-rows.interface';

export function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    type: r.type,
    currency: r.currency,
    balanceMinor: BigInt(r.balance_minor),
    heldMinor: BigInt(r.held_minor),
  };
}

export function toHold(r: HoldRow): Hold {
  return {
    id: r.id,
    accountId: r.account_id,
    amountMinor: BigInt(r.amount_minor),
    status: r.status,
    currency: r.currency,
  };
}
