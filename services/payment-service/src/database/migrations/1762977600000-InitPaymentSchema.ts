import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPaymentSchema1762977600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // One row = one saga ("pay this invoice"). The row IS the durable saga state: after a crash we read it
    // to know which step we were on. Its id is the bank `reference` and the root of every step's idempotency key.
    await q.query(`
      CREATE TABLE payments (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key  text NOT NULL UNIQUE,   -- from the client: one "Pay" click = one payment
        payer_account_id uuid NOT NULL,          -- ledger account (other service's DB: no FK)
        amount_minor     bigint NOT NULL CHECK (amount_minor > 0),
        currency         char(3) NOT NULL,
        creditor_iban    text NOT NULL,
        creditor_name    text NOT NULL,
        status           text NOT NULL DEFAULT 'STARTED' CHECK (status IN (
                           'STARTED', 'FUNDS_HELD', 'SENT_TO_BANK', 'BANK_UNKNOWN',
                           'COMPENSATING', 'COMPLETED', 'FAILED')),
        hold_id          uuid,                   -- set once the ledger hold exists
        failure_reason   text,
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE payments`);
  }
}
