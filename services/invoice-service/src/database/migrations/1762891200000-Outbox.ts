import { MigrationInterface, QueryRunner } from 'typeorm';

// Transactional outbox: an event is written here in the SAME transaction as the state change it describes,
// so "invoice ISSUED" and "invoice.issued must be published" are committed together or not at all.
// A relay publishes pending rows to Pub/Sub afterwards (at-least-once).
export class Outbox1762891200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE outbox (
        id            bigserial PRIMARY KEY,   -- insertion order; the relay publishes in this order
        event_id      uuid NOT NULL UNIQUE,    -- the id consumers deduplicate on
        topic         text NOT NULL,
        ordering_key  text NOT NULL,           -- the entity id; for Pub/Sub ordering keys (Stage 6)
        payload       jsonb NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        published_at  timestamptz              -- NULL = still to publish
      )
    `);
    // Partial index: the relay only ever looks for unpublished rows, which stay a tiny fraction of the table.
    await q.query(`CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE outbox`);
  }
}
