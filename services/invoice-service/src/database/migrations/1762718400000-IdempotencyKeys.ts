import { MigrationInterface, QueryRunner } from 'typeorm';

// Same shape as in ledger-service. Written in the SAME transaction as the invoice it protects, so
// "key stored" and "invoice created" commit or roll back together (no dual write between two stores).
export class IdempotencyKeys1762718400000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE idempotency_keys (
        operation    text NOT NULL,
        key          text NOT NULL,
        request_hash text NOT NULL,
        response     jsonb,
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (operation, key)
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE idempotency_keys`);
  }
}
