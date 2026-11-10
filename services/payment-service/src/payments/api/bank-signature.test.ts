// Run: pnpm --filter payment-service test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyBankSignature } from './bank-signature';
import { SIGNATURE_TOLERANCE_SECONDS } from './bank-signature.constants';

const SECRET = 'dev-webhook-secret';
const NOW = 1_794_142_664; // fixed clock: tests must not depend on the real time
const BODY = JSON.stringify({
  id: 'af2e71de-0000-4000-8000-000000000000',
  type: 'transfer.settled',
  data: { reference: 'pay_5490c5a8', amountMinor: '12300', currency: 'PLN', status: 'SETTLED' },
});

// What the bank does (written independently of the code under test).
function header(body: string, t: number, secret = SECRET): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

test('accepts a valid signature', () => {
  assert.equal(verifyBankSignature(BODY, header(BODY, NOW), SECRET, NOW), true);
});

test('accepts a signature a bit older than now (network delay, bank retries)', () => {
  assert.equal(verifyBankSignature(BODY, header(BODY, NOW - 60), SECRET, NOW), true);
});

test('rejects a modified body (attacker changes the amount)', () => {
  const tampered = BODY.replace('12300', '99900');
  assert.equal(verifyBankSignature(tampered, header(BODY, NOW), SECRET, NOW), false);
});

test('rejects a body that differs only in whitespace (verify the RAW body, never re-serialized JSON)', () => {
  const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
  assert.equal(verifyBankSignature(reserialized, header(BODY, NOW), SECRET, NOW), false);
});

test('rejects a signature made with a different secret', () => {
  assert.equal(verifyBankSignature(BODY, header(BODY, NOW, 'attacker-secret'), SECRET, NOW), false);
});

test('rejects a replay: valid signature, but older than the tolerance window', () => {
  const old = NOW - SIGNATURE_TOLERANCE_SECONDS - 1;
  assert.equal(verifyBankSignature(BODY, header(BODY, old), SECRET, NOW), false);
});

test('rejects a timestamp too far in the future', () => {
  const future = NOW + SIGNATURE_TOLERANCE_SECONDS + 1;
  assert.equal(verifyBankSignature(BODY, header(BODY, future), SECRET, NOW), false);
});

test('rejects an old signature with only the timestamp bumped (timestamp is part of what is signed)', () => {
  const oldV1 = header(BODY, NOW - 3600).split(',')[1]!;
  assert.equal(verifyBankSignature(BODY, `t=${NOW},${oldV1}`, SECRET, NOW), false);
});

for (const [name, bad] of [
  ['missing header', undefined],
  ['empty header', ''],
  ['garbage', 'hello'],
  ['no v1', `t=${NOW}`],
  ['no t', `v1=${'a'.repeat(64)}`],
  ['t not a number', `t=abc,v1=${'a'.repeat(64)}`],
  ['v1 too short (must not throw)', `t=${NOW},v1=abc`],
  ['v1 not hex', `t=${NOW},v1=${'z'.repeat(64)}`],
] as const) {
  test(`rejects a malformed header without throwing: ${name}`, () => {
    assert.equal(verifyBankSignature(BODY, bad, SECRET, NOW), false);
  });
}
