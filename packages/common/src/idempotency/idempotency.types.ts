import type { EntityManager } from 'typeorm';

/** Runs `operation` at most once per (operationName, key); see createIdempotent. */
export type Idempotent = <T>(
  m: EntityManager,
  operationName: string,
  key: string,
  request: unknown,
  operation: () => Promise<T>,
) => Promise<T>;
