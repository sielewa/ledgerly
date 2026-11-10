import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { sql } from '../database/sql';
import type { Idempotent } from './idempotency.types';

/**
 * Requires in the service's database:
 *   CREATE TABLE idempotency_keys (operation text, key text, request_hash text, response jsonb, created_at timestamptz,
 *                                  PRIMARY KEY (operation, key))
 *
 * Builds `idempotent()`: runs `operation` at most once per (operationName, key). Call it inside the SAME DB
 * transaction as the operation, so the key and the operation's effects are committed (or rolled back) together.
 *
 * - first call:               key inserted, operation runs, its response is stored
 * - retry, same request:      stored response is returned, operation does NOT run again
 * - retry, different request: rejected with `conflictError` (the caller reused a key for something else)
 *
 * Concurrent calls with the same key: the second INSERT waits on the primary key until the first transaction
 * finishes, then sees the conflict and returns the stored response.
 *
 * `conflictError` lets each service throw its own transport error (e.g. gRPC INVALID_ARGUMENT): this package
 * stays framework-free, so it can never bring a second copy of NestJS into a service.
 */
export function createIdempotent(conflictError: (message: string) => Error): Idempotent {
  return async function idempotent<T>(
    m: EntityManager,
    operationName: string,
    key: string,
    request: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    const requestHash = createHash('sha256').update(JSON.stringify(request)).digest('hex');

    const inserted = await sql(
      m,
      `INSERT INTO idempotency_keys (operation, key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [operationName, key, requestHash],
    );

    if (inserted.rowCount === 0) {
      const { rows } = await sql<{ request_hash: string; response: T }>(
        m,
        `SELECT request_hash, response FROM idempotency_keys WHERE operation = $1 AND key = $2`,
        [operationName, key],
      );
      const existing = rows[0];
      if (!existing) throw new Error('idempotency key vanished'); // cannot happen inside one transaction
      if (existing.request_hash !== requestHash) {
        throw conflictError(`idempotency_key "${key}" was already used with a different request`);
      }
      return existing.response;
    }

    const response = await operation();
    await sql(m, `UPDATE idempotency_keys SET response = $3 WHERE operation = $1 AND key = $2`, [
      operationName,
      key,
      JSON.stringify(response),
    ]);
    return response;
  };
}
