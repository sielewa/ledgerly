import { commonV1 } from '@ledgerly/proto';
import { invalidArgument } from '../../shared/errors';
import {
  CURRENCY_PATTERN,
  IBAN_PATTERN,
  INTEGER_PATTERN,
  UUID_PATTERN,
} from './validation.constants';

// Input validation at the API boundary. Stays in the service (not @ledgerly/common): it throws NestJS gRPC errors.

export function requireUuid(value: string, field: string): string {
  if (!UUID_PATTERN.test(value)) throw invalidArgument(`${field} must be a UUID`);
  return value;
}

export function requireText(value: string, field: string): string {
  if (value.trim() === '') throw invalidArgument(`${field} is required`);
  return value.trim();
}

export function requireIban(value: string): string {
  const iban = value.replace(/\s+/g, '').toUpperCase();
  if (!IBAN_PATTERN.test(iban)) throw invalidArgument('payee_iban is not a valid IBAN');
  return iban;
}

export function requirePositiveAmount(money: commonV1.Money | undefined): {
  amount: bigint;
  currency: string;
} {
  if (!money) throw invalidArgument('amount is required');
  if (!INTEGER_PATTERN.test(money.amountMinor))
    throw invalidArgument('amount_minor must be an integer');
  const amount = BigInt(money.amountMinor);
  if (amount <= 0n) throw invalidArgument('amount must be positive');
  if (!CURRENCY_PATTERN.test(money.currency))
    throw invalidArgument('currency must be an ISO 4217 code');
  return { amount, currency: money.currency };
}
