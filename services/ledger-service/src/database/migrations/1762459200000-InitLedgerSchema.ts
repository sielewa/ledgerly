import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitLedgerSchema1762459200000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE accounts (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code          text NOT NULL UNIQUE,
        type          text NOT NULL CHECK (type IN ('CUSTOMER', 'SYSTEM')),
        currency      char(3) NOT NULL,
        -- Cached sum of this account's entries. Source of truth is the entries table.
        balance_minor bigint NOT NULL DEFAULT 0,
        -- Cached sum of this account's ACTIVE holds.
        held_minor    bigint NOT NULL DEFAULT 0 CHECK (held_minor >= 0),
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Append-only: rows are never updated or deleted. A correction is a new (reversing) transaction.
    await q.query(`
      CREATE TABLE transactions (
        id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type       text NOT NULL CHECK (type IN ('DEPOSIT', 'CAPTURE')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Append-only. Invariant (enforced in code, verified by reconciliation):
    // SUM(amount_minor) per transaction_id = 0.
    await q.query(`
      CREATE TABLE entries (
        id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        transaction_id uuid NOT NULL REFERENCES transactions (id),
        account_id     uuid NOT NULL REFERENCES accounts (id),
        amount_minor   bigint NOT NULL CHECK (amount_minor <> 0),
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX entries_account_id_idx ON entries (account_id)`);
    await q.query(`CREATE INDEX entries_transaction_id_idx ON entries (transaction_id)`);

    // Mutable, but only ACTIVE -> CAPTURED | RELEASED.
    await q.query(`
      CREATE TABLE holds (
        id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id             uuid NOT NULL REFERENCES accounts (id),
        amount_minor           bigint NOT NULL CHECK (amount_minor > 0),
        status                 text NOT NULL CHECK (status IN ('ACTIVE', 'CAPTURED', 'RELEASED')),
        capture_transaction_id uuid REFERENCES transactions (id),
        created_at             timestamptz NOT NULL DEFAULT now(),
        updated_at             timestamptz NOT NULL DEFAULT now(),
        -- A hold has a capture transaction if and only if it is CAPTURED.
        CHECK ((status = 'CAPTURED') = (capture_transaction_id IS NOT NULL))
      )
    `);
    await q.query(`CREATE INDEX holds_account_id_idx ON holds (account_id)`);

    // Written in the same DB transaction as the operation it protects.
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

    // Mirror of the money held in Ledgerly's pooled bank account, one per currency.
    // System accounts may go negative (that is their normal state).
    await q.query(`
      INSERT INTO accounts (code, type, currency) VALUES
        ('system:bank_clearing:PLN', 'SYSTEM', 'PLN'),
        ('system:bank_clearing:EUR', 'SYSTEM', 'EUR')
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE idempotency_keys, holds, entries, transactions, accounts`);
  }
}
