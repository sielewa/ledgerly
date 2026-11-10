// Verifies the `bank-signature` header of a webhook from the bank.
//
// Header format:  t=<unix seconds>,v1=<hex HMAC-SHA256>
// Signed string:  `${t}.${rawBody}`   (HMAC-SHA256 with the shared secret, hex digest)
//
// Run the tests: pnpm --filter payment-service test

import { createHmac, timingSafeEqual } from 'node:crypto';
import { SIGNATURE_TOLERANCE_SECONDS } from './bank-signature.constants';

export function verifyBankSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;

  const headerEntries = header.split(',');
  if (headerEntries.length !== 2) return false;
  if (headerEntries[0]?.split('=')[0] !== 't') return false;
  if (headerEntries[1]?.split('=')[0] !== 'v1') return false;

  const tRaw = headerEntries[0].split('=')[1]; // string | undefined
  if (
    !tRaw ||
    !/^\d+$/.test(tRaw) ||
    Math.abs(nowSeconds - Number(tRaw)) > SIGNATURE_TOLERANCE_SECONDS
  )
    return false;

  const v1 = headerEntries[1].split('=')[1];
  if (!v1) return false;

  const expected = createHmac('sha256', secret).update(`${tRaw}.${rawBody}`).digest();

  const v1Buffer = Buffer.from(v1, 'hex');
  if (v1Buffer.length !== expected.length) return false;

  return timingSafeEqual(v1Buffer, expected);
}
