import { MigrationInterface, QueryRunner } from 'typeorm';

// Defense in depth for Problem 4: even if some code path forgets FOR UPDATE, the database itself
// refuses to let a customer's available balance (balance - held) go below zero.
//
// Step 1 of 2. NOT VALID = enforced for every new INSERT/UPDATE immediately, but existing rows are NOT
// scanned. ADD CONSTRAINT takes an ACCESS EXCLUSIVE lock (blocks even SELECT); without NOT VALID it would
// hold that lock while scanning the whole table. Step 2 is the next migration (VALIDATE CONSTRAINT).
export class AvailableBalanceCheck1762545600000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE accounts
        ADD CONSTRAINT accounts_available_non_negative
        CHECK (type = 'SYSTEM' OR balance_minor - held_minor >= 0) NOT VALID
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE accounts DROP CONSTRAINT accounts_available_non_negative`);
  }
}
