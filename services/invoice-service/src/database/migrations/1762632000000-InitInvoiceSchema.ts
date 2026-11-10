import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitInvoiceSchema1762632000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE invoices (
        id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Ledger account id. NO foreign key: accounts live in ledger-service's database (database per service).
        payer_account_id uuid NOT NULL,
        payee_name       text NOT NULL CHECK (payee_name <> ''),
        payee_iban       text NOT NULL,
        amount_minor     bigint NOT NULL CHECK (amount_minor > 0),
        currency         char(3) NOT NULL,
        status           text NOT NULL DEFAULT 'DRAFT'
                         CHECK (status IN ('DRAFT', 'ISSUED', 'PAYMENT_PENDING', 'PAID')),
        created_at       timestamptz NOT NULL DEFAULT now(),
        updated_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX invoices_payer_account_id_idx ON invoices (payer_account_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE invoices`);
  }
}
