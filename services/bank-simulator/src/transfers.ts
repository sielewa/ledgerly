import type { Transfer, TransferRequest } from './transfers.interface';

/** Returns an error message, or undefined if the request is valid. */
export function validate(body: unknown): string | undefined {
  const b = body as Partial<TransferRequest> | undefined;
  if (!b || typeof b !== 'object') return 'body must be a JSON object';
  if (typeof b.reference !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(b.reference)) {
    return 'reference must be 1-64 chars [A-Za-z0-9_-]';
  }
  if (typeof b.amount?.amountMinor !== 'string' || !/^[1-9]\d*$/.test(b.amount.amountMinor)) {
    return 'amount.amountMinor must be a positive integer string';
  }
  if (typeof b.amount.currency !== 'string' || !/^[A-Z]{3}$/.test(b.amount.currency)) {
    return 'amount.currency must be a 3-letter code';
  }
  if (typeof b.creditorIban !== 'string' || b.creditorIban.length < 15)
    return 'creditorIban is invalid';
  if (typeof b.creditorName !== 'string' || b.creditorName.trim() === '')
    return 'creditorName is required';
  return undefined;
}

/** Same reference + same content = the same transfer (replay). Same reference + different content = client bug. */
export function sameRequest(t: Transfer, r: TransferRequest): boolean {
  return (
    t.amountMinor === r.amount.amountMinor &&
    t.currency === r.amount.currency &&
    t.creditorIban === r.creditorIban &&
    t.creditorName === r.creditorName
  );
}
