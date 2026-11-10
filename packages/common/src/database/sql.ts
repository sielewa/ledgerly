import type { EntityManager, QueryResult } from 'typeorm';

/**
 * Runs raw SQL on the transaction's connection. TypeORM's `query()` returns different shapes per statement
 * (rows for SELECT, [rows, count] for UPDATE/DELETE); this always returns { rows, rowCount }, so "0 rows updated"
 * checks (compare-and-set, ON CONFLICT DO NOTHING) are reliable.
 *
 * Takes the EntityManager of `dataSource.transaction(async (m) => ...)`: every query of one use case runs on the
 * same connection, inside the same transaction, holding the same locks.
 */
export async function sql<T = Record<string, unknown>>(
  m: EntityManager,
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  if (!m.queryRunner) throw new Error('sql() must be called inside dataSource.transaction()');
  const res = (await m.queryRunner.query(text, params, true)) as QueryResult<T>;
  return { rows: res.records, rowCount: res.affected ?? res.records.length };
}

/** Postgres 23505: a UNIQUE constraint or unique index rejected the row. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
