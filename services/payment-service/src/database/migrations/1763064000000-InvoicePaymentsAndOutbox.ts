import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoicePaymentsAndOutbox1763064000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Payments are now always for an invoice. Rows created before this change have none, so the rule is added
    // NOT VALID: enforced for every new or updated row, old rows are left alone (no VALIDATE on purpose).
    await q.query(`ALTER TABLE payments ADD COLUMN invoice_id uuid`);
    await q.query(`
      ALTER TABLE payments ADD CONSTRAINT payments_invoice_required
        CHECK (invoice_id IS NOT NULL) NOT VALID
    `);

    // Business rule enforced by the database: at most ONE active (not FAILED) payment per invoice.
    // Idempotency keys only catch a retry of the SAME click; two tabs / two clicks have different keys.
    // A FAILED payment doesn't count, so a rejected invoice can be paid again.
    await q.query(`
      CREATE UNIQUE INDEX payments_one_active_per_invoice
        ON payments (invoice_id) WHERE status <> 'FAILED'
    `);

    // The sweeper's query: non-final sagas ordered by age.
    await q.query(`
      CREATE INDEX payments_unfinished_idx ON payments (updated_at)
        WHERE status IN ('FUNDS_HELD', 'SENT_TO_BANK', 'BANK_UNKNOWN', 'COMPENSATING')
    `);

    // Transactional outbox for payment.* events (same shape as in invoice-service).
    await q.query(`
      CREATE TABLE outbox (
        id            bigserial PRIMARY KEY,
        event_id      uuid NOT NULL UNIQUE,
        topic         text NOT NULL,
        ordering_key  text NOT NULL,
        payload       jsonb NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        published_at  timestamptz
      )
    `);
    await q.query(`CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE outbox`);
    await q.query(`DROP INDEX payments_unfinished_idx`);
    await q.query(`DROP INDEX payments_one_active_per_invoice`);
    await q.query(`ALTER TABLE payments DROP CONSTRAINT payments_invoice_required`);
    await q.query(`ALTER TABLE payments DROP COLUMN invoice_id`);
  }
}
