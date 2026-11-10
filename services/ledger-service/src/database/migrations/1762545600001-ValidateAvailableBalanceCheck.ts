import { MigrationInterface, QueryRunner } from 'typeorm';

// Step 2 of 2. Scans existing rows under SHARE UPDATE EXCLUSIVE, which does NOT block reads or writes.
// Must run in its own transaction (migrationsTransactionMode: 'each'), otherwise the ACCESS EXCLUSIVE lock
// from step 1 would still be held during this scan. Fails if old rows violate the rule: fix the data first.
// In production this would usually ship in a later deploy, after the data has been cleaned up.
export class ValidateAvailableBalanceCheck1762545600001 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE accounts VALIDATE CONSTRAINT accounts_available_non_negative`);
  }

  async down(): Promise<void> {
    // Nothing to undo: an already validated constraint cannot be turned back into NOT VALID.
  }
}
