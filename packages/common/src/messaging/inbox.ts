import type { EntityManager } from 'typeorm';
import { sql } from '../database/sql';

/**
 * Inbox (idempotent consumer). Records that `eventId` was processed; returns false if it already was.
 * Call it FIRST, inside the same transaction as the event's side effects: the PRIMARY KEY decides, so a concurrent
 * copy of the same event waits for this transaction and then sees the conflict.
 *
 * Requires: CREATE TABLE processed_events (event_id uuid PRIMARY KEY, created_at timestamptz DEFAULT now())
 */
export async function markEventProcessed(m: EntityManager, eventId: string): Promise<boolean> {
  const inserted = await sql(
    m,
    `INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING`,
    [eventId],
  );
  return inserted.rowCount === 1;
}
