// Direct read-only checks on the ledger database (as ledger_svc), used to verify invariants.
import pg from 'pg';

export async function withLedgerDb<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  const db = new pg.Client({
    connectionString:
      process.env.LEDGER_DATABASE_URL ?? 'postgres://ledger_svc:ledger_pw@localhost:5432/ledger',
  });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Every invariant query must return 0 rows. Returns the number of violations found. */
export async function reconcile(db: pg.Client): Promise<number> {
  const checks: Record<string, string> = {
    'unbalanced transactions (sum of entries per transaction and currency <> 0)': `
      SELECT e.transaction_id, a.currency, SUM(e.amount_minor) AS sum
      FROM entries e JOIN accounts a ON a.id = e.account_id
      GROUP BY e.transaction_id, a.currency
      HAVING SUM(e.amount_minor) <> 0`,
    'cached balance <> sum of entries': `
      SELECT a.code, a.balance_minor, COALESCE(SUM(e.amount_minor), 0) AS entries_sum
      FROM accounts a LEFT JOIN entries e ON e.account_id = a.id
      GROUP BY a.id
      HAVING a.balance_minor <> COALESCE(SUM(e.amount_minor), 0)`,
    'cached held <> sum of ACTIVE holds': `
      SELECT a.code, a.held_minor, COALESCE(SUM(h.amount_minor), 0) AS active_holds
      FROM accounts a LEFT JOIN holds h ON h.account_id = a.id AND h.status = 'ACTIVE'
      GROUP BY a.id
      HAVING a.held_minor <> COALESCE(SUM(h.amount_minor), 0)`,
    'customer accounts with negative available balance': `
      SELECT code, balance_minor, held_minor, balance_minor - held_minor AS available
      FROM accounts
      WHERE type = 'CUSTOMER' AND balance_minor - held_minor < 0`,
  };

  let violations = 0;
  for (const [name, query] of Object.entries(checks)) {
    const { rows } = await db.query(query);
    console.log(`  ${rows.length === 0 ? 'OK  ' : 'FAIL'}  ${name}`);
    if (rows.length > 0) console.table(rows.slice(0, 5));
    violations += rows.length;
  }
  return violations;
}
