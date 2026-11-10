import { commonV1 } from '@ledgerly/proto';
import { invalidArgument } from '../../shared/errors';
import { CURRENCY_PATTERN, INTEGER_PATTERN, UUID_PATTERN } from './validation.constants';

export function requireUuid(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) throw invalidArgument(`${field} must be a UUID`);
  return value;
}

export function requireCurrency(value: string): string {
  if (!CURRENCY_PATTERN.test(value))
    throw invalidArgument('currency must be an ISO 4217 code, e.g. "PLN"');
  return value;
}

export function requireIdempotencyKey(value: string): string {
  if (value.trim() === '') throw invalidArgument('idempotency_key is required');
  return value;
}

// int64 arrives as a string (loader option `longs: String`). We convert it to bigint for arithmetic.
// Never Number(): it silently loses precision above 2^53.
export function requirePositiveAmount(money: commonV1.Money | undefined): {
  amount: bigint;
  currency: string;
} {
  if (!money) throw invalidArgument('amount is required');
  if (!INTEGER_PATTERN.test(money.amountMinor))
    throw invalidArgument('amount_minor must be an integer');
  const amount = BigInt(money.amountMinor);
  if (amount <= 0n) throw invalidArgument('amount must be positive');
  return { amount, currency: requireCurrency(money.currency) };
}
