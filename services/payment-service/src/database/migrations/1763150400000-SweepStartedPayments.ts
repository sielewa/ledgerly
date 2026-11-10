import { MigrationInterface, QueryRunner } from 'typeorm';

// The sweeper now also resumes sagas stuck in STARTED (crash or ledger down before the hold was placed).
// The partial index must cover the same statuses as the sweeper's query, or Postgres won't use it.
export class SweepStartedPayments1763150400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX payments_unfinished_idx`);
    await q.query(`
      CREATE INDEX payments_unfinished_idx ON payments (updated_at)
        WHERE status IN ('STARTED', 'FUNDS_HELD', 'SENT_TO_BANK', 'BANK_UNKNOWN', 'COMPENSATING')
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX payments_unfinished_idx`);
    await q.query(`
      CREATE INDEX payments_unfinished_idx ON payments (updated_at)
        WHERE status IN ('FUNDS_HELD', 'SENT_TO_BANK', 'BANK_UNKNOWN', 'COMPENSATING')
    `);
  }
}
