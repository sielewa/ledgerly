// Unit tests for the invoice state machine. Run: pnpm --filter invoice-service test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvalidTransitionError } from './invalid-transition.error';
import { transition } from './invoice-state';
import type { InvoiceEvent, InvoiceStatus } from './invoice-state.types';

// Written independently of TRANSITIONS on purpose: a test that reads the table it tests proves nothing.
const ALLOWED: [InvoiceStatus, InvoiceEvent, InvoiceStatus][] = [
  ['DRAFT', 'ISSUE', 'ISSUED'],
  ['ISSUED', 'START_PAYMENT', 'PAYMENT_PENDING'],
  ['PAYMENT_PENDING', 'PAYMENT_SUCCEEDED', 'PAID'],
  ['PAYMENT_PENDING', 'PAYMENT_FAILED', 'ISSUED'],
];
const STATUSES: InvoiceStatus[] = ['DRAFT', 'ISSUED', 'PAYMENT_PENDING', 'PAID'];
const EVENTS: InvoiceEvent[] = ['ISSUE', 'START_PAYMENT', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED'];

for (const from of STATUSES) {
  for (const event of EVENTS) {
    const allowed = ALLOWED.find(([f, e]) => f === from && e === event);
    if (allowed) {
      test(`${from} + ${event} -> ${allowed[2]}`, () => {
        assert.equal(transition(from, event), allowed[2]);
      });
    } else {
      test(`${from} + ${event} is rejected`, () => {
        assert.throws(() => transition(from, event), InvalidTransitionError);
      });
    }
  }
}
