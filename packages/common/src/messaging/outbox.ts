import type { EntityManager } from 'typeorm';
import { sql } from '../database/sql';

/**
 * Transactional outbox, write side. Call inside the SAME transaction as the state change the event describes:
 * both commit or neither does. `orderingKey` is the entity id (events of one entity stay in order on Pub/Sub).
 *
 * Requires: CREATE TABLE outbox (id bigserial PK, event_id uuid UNIQUE, topic text, ordering_key text,
 *                                payload jsonb, created_at timestamptz, published_at timestamptz NULL)
 */
export async function enqueueEvent(
  m: EntityManager,
  event: { eventId: string },
  topic: string,
  orderingKey: string,
): Promise<void> {
  await sql(
    m,
    `INSERT INTO outbox (event_id, topic, ordering_key, payload) VALUES ($1, $2, $3, $4)`,
    [event.eventId, topic, orderingKey, JSON.stringify(event)],
  );
}
