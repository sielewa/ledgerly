import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { sql } from '@ledgerly/common';
import { assertBalanced } from '../domain/ledger';
import type { Account, Hold, Leg } from '../domain/ledger.interface';
import type { AccountRow, HoldRow } from './ledger-rows.interface';
import { toAccount, toHold } from './ledger-rows.mapper';

/**
 * All SQL of the ledger (accounts, holds, transactions, entries). Every method takes the transaction's
 * EntityManager: the application layer owns the transaction, so locks taken here are held until its COMMIT.
 */
@Injectable()
export class LedgerRepository {
  /** @throws a unique violation (23505) if the code is taken. */
  async insertCustomerAccount(m: EntityManager, code: string, currency: string): Promise<string> {
    const { rows } = await sql<{ id: string }>(
      m,
      `INSERT INTO accounts (code, type, currency) VALUES ($1, 'CUSTOMER', $2) RETURNING id`,
      [code, currency],
    );
    return rows[0]!.id;
  }

  /**
   * forUpdate: row lock until COMMIT. Concurrent check-then-act on the same account (e.g. two PlaceHolds) then runs
   * one at a time, and the second one reads the balance AFTER the first one's change (no double spend).
   */
  async findAccount(
    m: EntityManager,
    accountId: string,
    options?: { forUpdate?: boolean },
  ): Promise<Account | undefined> {
    const { rows } = await sql<AccountRow>(
      m,
      `SELECT id, type, currency, balance_minor, held_minor FROM accounts WHERE id = $1 ${options?.forUpdate ? 'FOR UPDATE' : ''}`,
      [accountId],
    );
    return rows[0] && toAccount(rows[0]);
  }

  async findAccountIdByCode(m: EntityManager, code: string): Promise<string | undefined> {
    const { rows } = await sql<{ id: string }>(m, `SELECT id FROM accounts WHERE code = $1`, [
      code,
    ]);
    return rows[0]?.id;
  }

  /** Atomic increment/decrement of the reserved amount (never read-modify-write in the application). */
  async addHeld(m: EntityManager, accountId: string, delta: bigint): Promise<void> {
    await sql(
      m,
      `UPDATE accounts SET held_minor = held_minor + $2, updated_at = now() WHERE id = $1`,
      [accountId, delta.toString()],
    );
  }

  async insertHold(m: EntityManager, accountId: string, amount: bigint): Promise<string> {
    const { rows } = await sql<{ id: string }>(
      m,
      `INSERT INTO holds (account_id, amount_minor, status) VALUES ($1, $2, 'ACTIVE') RETURNING id`,
      [accountId, amount.toString()],
    );
    return rows[0]!.id;
  }

  /** FOR UPDATE OF h: a concurrent Capture/Release of the same hold waits here, then sees the new status. */
  async lockHold(m: EntityManager, holdId: string): Promise<Hold | undefined> {
    const { rows } = await sql<HoldRow>(
      m,
      `SELECT h.id, h.account_id, h.amount_minor, h.status, a.currency
       FROM holds h JOIN accounts a ON a.id = h.account_id
       WHERE h.id = $1
       FOR UPDATE OF h`,
      [holdId],
    );
    return rows[0] && toHold(rows[0]);
  }

  async markHoldCaptured(m: EntityManager, holdId: string, transactionId: string): Promise<void> {
    await sql(
      m,
      `UPDATE holds SET status = 'CAPTURED', capture_transaction_id = $2, updated_at = now()
       WHERE id = $1 AND status = 'ACTIVE'`,
      [holdId, transactionId],
    );
  }

  async markHoldReleased(m: EntityManager, holdId: string): Promise<void> {
    await sql(
      m,
      `UPDATE holds SET status = 'RELEASED', updated_at = now() WHERE id = $1 AND status = 'ACTIVE'`,
      [holdId],
    );
  }

  /**
   * Writes one balanced ledger transaction: the only place that creates entries or changes balances.
   * Entries are append-only; a correction is a new transaction, never an UPDATE/DELETE of an entry.
   */
  async postTransaction(
    m: EntityManager,
    type: 'DEPOSIT' | 'CAPTURE',
    legs: Leg[],
  ): Promise<string> {
    assertBalanced(legs);

    const { rows } = await sql<{ id: string }>(
      m,
      `INSERT INTO transactions (type) VALUES ($1) RETURNING id`,
      [type],
    );
    const transactionId = rows[0]!.id;

    // Update accounts in a fixed order (by id). If two transactions touch the same two accounts in opposite order,
    // each could lock one row and wait for the other forever (deadlock).
    const ordered = [...legs].sort((a, b) => a.accountId.localeCompare(b.accountId));
    for (const leg of ordered) {
      await sql(
        m,
        `INSERT INTO entries (transaction_id, account_id, amount_minor) VALUES ($1, $2, $3)`,
        [transactionId, leg.accountId, leg.amount.toString()],
      );
      await sql(
        m,
        `UPDATE accounts SET balance_minor = balance_minor + $2, updated_at = now() WHERE id = $1`,
        [leg.accountId, leg.amount.toString()],
      );
    }
    return transactionId;
  }
}
