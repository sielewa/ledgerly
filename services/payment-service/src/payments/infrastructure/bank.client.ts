import { Injectable } from '@nestjs/common';
import { config } from '../../config';
import { BankError } from './bank.error';
import type { BankTransfer, BankTransferRequest } from './bank.interface';

/** Thin REST client for the (external, unreliable) bank. */
@Injectable()
export class BankClient {
  async createTransfer(input: BankTransferRequest): Promise<BankTransfer> {
    // AbortSignal.timeout: without it, fetch waits as long as the bank keeps the socket open.
    const res = await fetch(`${config.bankUrl}/transfers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reference: input.reference,
        amount: { amountMinor: input.amountMinor, currency: input.currency },
        creditorIban: input.creditorIban,
        creditorName: input.creditorName,
      }),
      signal: AbortSignal.timeout(config.bankTimeoutMs),
    });
    if (!res.ok) throw new BankError(`bank answered HTTP ${res.status}`, res.status);
    return (await res.json()) as BankTransfer;
  }

  /** Returns undefined if the bank doesn't know this reference (404). */
  async getTransfer(reference: string): Promise<BankTransfer | undefined> {
    const res = await fetch(`${config.bankUrl}/transfers/${encodeURIComponent(reference)}`, {
      signal: AbortSignal.timeout(config.bankTimeoutMs),
    });
    if (res.status === 404) return undefined;
    if (!res.ok) throw new BankError(`bank answered HTTP ${res.status}`, res.status);
    return (await res.json()) as BankTransfer;
  }
}
