import { MigrationInterface, QueryRunner } from 'typeorm';

// Inbox for events this service consumes (payment.*). Written in the same transaction as the invoice status
// change, so a redelivered event is recognised and skipped.
export class ProcessedEvents1763064000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE processed_events (
        event_id   uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE processed_events`);
  }
}
