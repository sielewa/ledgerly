import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ledgerV1 } from '@ledgerly/proto';
import { isUniqueViolation } from '@ledgerly/common';
import { alreadyExists, failedPrecondition, invalidArgument, notFound } from '../../shared/errors';
import { idempotent } from '../../shared/idempotency';
import { available, clearingAccountCode } from '../domain/ledger';
import type { Account, Hold } from '../domain/ledger.interface';
import { LedgerRepository } from '../infrastructure/ledger.repository';

/**
 * Ledger use cases. Every mutation: one DB transaction + idempotency by the caller's key, stored atomically with
 * the effect. Input is validated by the api layer.
 *
 * The commands ARE the gRPC request messages on purpose: the request is what gets hashed for idempotency. If the
 * hashed shape changed, a retry with a key stored before a deploy (e.g. the payment saga's sweeper retrying
 * ReleaseHold with its deterministic key) would be rejected as "a different request" and the saga would get stuck.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ledger: LedgerRepository,
  ) {}

  async openAccount(req: ledgerV1.OpenAccountRequest): Promise<ledgerV1.OpenAccountResponse> {
    return this.dataSource.transaction((m) =>
      idempotent(m, 'OpenAccount', req.idempotencyKey, req, async () => {
        try {
          return { accountId: await this.ledger.insertCustomerAccount(m, req.code, req.currency) };
        } catch (err) {
          if (isUniqueViolation(err)) throw alreadyExists(`account "${req.code}" already exists`);
          throw err;
        }
      }),
    );
  }

  async postDeposit(req: ledgerV1.PostDepositRequest): Promise<ledgerV1.PostDepositResponse> {
    const amount = BigInt(req.amount!.amountMinor);
    const currency = req.amount!.currency;
    return this.dataSource.transaction((m) =>
      idempotent(m, 'PostDeposit', req.idempotencyKey, req, async () => {
        const account = await this.customerAccount(m, req.accountId, currency);
        const clearingId = await this.clearingAccountId(m, currency);
        const transactionId = await this.ledger.postTransaction(m, 'DEPOSIT', [
          { accountId: account.id, amount },
          { accountId: clearingId, amount: -amount },
        ]);
        return { transactionId };
      }),
    );
  }

  async getBalance(req: ledgerV1.GetBalanceRequest): Promise<ledgerV1.GetBalanceResponse> {
    return this.dataSource.transaction(async (m) => {
      const account = await this.ledger.findAccount(m, req.accountId);
      if (!account) throw notFound(`account ${req.accountId} not found`);
      const money = (v: bigint) => ({ amountMinor: v.toString(), currency: account.currency });
      return {
        accountId: account.id,
        balance: money(account.balanceMinor),
        held: money(account.heldMinor),
        available: money(available(account)),
      };
    });
  }

  async placeHold(req: ledgerV1.PlaceHoldRequest): Promise<ledgerV1.PlaceHoldResponse> {
    const amount = BigInt(req.amount!.amountMinor);
    return this.dataSource.transaction((m) =>
      idempotent(m, 'PlaceHold', req.idempotencyKey, req, async () => {
        // We use forUpdate to lock account row and protect against race condition specifically check-then-act
        const account = await this.customerAccount(m, req.accountId, req.amount!.currency, {
          forUpdate: true,
        });
        if (available(account) < amount) {
          throw failedPrecondition(
            `insufficient funds: available ${available(account)}, requested ${amount}`,
          );
        }
        const holdId = await this.ledger.insertHold(m, account.id, amount);
        await this.ledger.addHeld(m, account.id, amount);
        return { holdId };
      }),
    );
  }

  async captureHold(req: ledgerV1.CaptureHoldRequest): Promise<ledgerV1.CaptureHoldResponse> {
    return this.dataSource.transaction((m) =>
      idempotent(m, 'CaptureHold', req.idempotencyKey, req, async () => {
        const hold = await this.activeHold(m, req.holdId, 'captured');
        const clearingId = await this.clearingAccountId(m, hold.currency);
        const transactionId = await this.ledger.postTransaction(m, 'CAPTURE', [
          { accountId: hold.accountId, amount: -hold.amountMinor },
          { accountId: clearingId, amount: hold.amountMinor },
        ]);
        await this.ledger.markHoldCaptured(m, hold.id, transactionId);
        await this.ledger.addHeld(m, hold.accountId, -hold.amountMinor);
        return { transactionId };
      }),
    );
  }

  async releaseHold(req: ledgerV1.ReleaseHoldRequest): Promise<ledgerV1.ReleaseHoldResponse> {
    return this.dataSource.transaction((m) =>
      idempotent(m, 'ReleaseHold', req.idempotencyKey, req, async () => {
        const hold = await this.activeHold(m, req.holdId, 'released');
        await this.ledger.markHoldReleased(m, hold.id);
        await this.ledger.addHeld(m, hold.accountId, -hold.amountMinor);
        return {};
      }),
    );
  }

  // ---------------------------------------------------------------------------------------------

  private async customerAccount(
    m: EntityManager,
    accountId: string,
    currency: string,
    options?: { forUpdate?: boolean },
  ): Promise<Account> {
    const account = await this.ledger.findAccount(m, accountId, options);
    if (!account) throw notFound(`account ${accountId} not found`);
    if (account.type !== 'CUSTOMER') throw invalidArgument('not a customer account');
    if (account.currency !== currency) {
      throw invalidArgument(`currency mismatch: account is ${account.currency}, got ${currency}`);
    }
    return account;
  }

  private async clearingAccountId(m: EntityManager, currency: string): Promise<string> {
    const id = await this.ledger.findAccountIdByCode(m, clearingAccountCode(currency));
    if (!id) throw failedPrecondition(`currency ${currency} is not supported`);
    return id;
  }

  /** Locks the hold (FOR UPDATE) and requires it to be ACTIVE: a hold is captured or released at most once. */
  private async activeHold(m: EntityManager, holdId: string, action: string): Promise<Hold> {
    const hold = await this.ledger.lockHold(m, holdId);
    if (!hold) throw notFound(`hold ${holdId} not found`);
    if (hold.status !== 'ACTIVE') {
      throw failedPrecondition(`hold is ${hold.status}, only ACTIVE holds can be ${action}`);
    }
    return hold;
  }
}
