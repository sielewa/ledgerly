import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProcessedEvents1794135503794 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE processed_events (
        event_id uuid PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE processed_events`);
  }
}
