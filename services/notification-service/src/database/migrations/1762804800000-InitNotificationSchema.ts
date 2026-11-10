import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitNotificationSchema1762804800000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // One row = one "email" we sent. In a real system this would be a call to an email provider;
    // here the row IS the side effect, so we can count duplicates with SQL.
    await q.query(`
      CREATE TABLE notifications (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id    uuid NOT NULL,   -- NAIVE: not unique, so a redelivered event sends a second email
        event_type  text NOT NULL,
        invoice_id  uuid NOT NULL,
        message     text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX notifications_invoice_id_idx ON notifications (invoice_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE notifications`);
  }
}
