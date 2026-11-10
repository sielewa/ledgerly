import { setTimeout as sleep } from 'node:timers/promises';
import type { PubSub, Topic } from '@google-cloud/pubsub';
import type { DataSource } from 'typeorm';
import { sql } from '../database/sql';
import { DEFAULT_BATCH_SIZE, DEFAULT_POLL_INTERVAL_MS } from './outbox.constants';
import type { OutboxRelayOptions, OutboxRow, RelayLogger } from './outbox.interface';

/**
 * Polling publisher: moves events from the outbox table to Pub/Sub. One per service instance.
 *
 * AT-LEAST-ONCE, not exactly-once: if we crash after publishing but before the UPDATE commits, the rows are still
 * unpublished and will be sent again. Consumers must deduplicate on eventId (inbox).
 *
 * A plain class on purpose (no NestJS imports). Its onApplicationBootstrap / onApplicationShutdown methods are
 * called by Nest when a service registers it as a provider, and could be called by any other host.
 */
export class OutboxRelay {
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly topics = new Map<string, Topic>();
  private running = false;
  private loop?: Promise<void>;

  constructor(
    private readonly dataSource: DataSource,
    private readonly pubsub: PubSub,
    private readonly logger: RelayLogger,
    private readonly options: OutboxRelayOptions = {},
  ) {
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  onApplicationBootstrap(): void {
    this.running = true;
    this.loop = this.run();
  }

  async onApplicationShutdown(): Promise<void> {
    this.running = false;
    await this.loop; // let the current batch finish (and commit) before the DB pool closes
  }

  // A loop with await + sleep instead of setInterval: a slow batch can never overlap with the next one.
  private async run(): Promise<void> {
    while (this.running) {
      try {
        const published = await this.publishBatch();
        if (published === this.batchSize) continue; // backlog: take the next batch right away
      } catch (err) {
        // Nothing is lost: the transaction rolled back, the rows are still unpublished. Retry next tick.
        this.logger.error(`relay batch failed: ${String(err)}`);
      }
      await sleep(this.pollIntervalMs);
    }
  }

  private async publishBatch(): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      // SKIP LOCKED: another instance's relay takes DIFFERENT rows instead of waiting for (or re-publishing) ours.
      // The row locks are held until COMMIT, so the publish below happens inside this transaction: keep batches
      // small, a slow Pub/Sub keeps the transaction (and a pool connection) open.
      const { rows } = await sql<OutboxRow>(
        m,
        `SELECT id, event_id, topic, ordering_key, payload FROM outbox
         WHERE published_at IS NULL
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [this.batchSize],
      );

      // Sequential on purpose: keeps the order of events within this batch.
      for (const row of rows) {
        const topic = this.topic(row.topic);
        try {
          // orderingKey: Pub/Sub delivers messages with the same key in publish order (on ordered subscriptions).
          await topic.publishMessage({
            json: row.payload,
            orderingKey: row.ordering_key,
            attributes: { eventId: row.event_id },
          });
        } catch (err) {
          // With ordering on, a failed publish PAUSES this ordering key in the client: every later message with
          // the same key is rejected until we resume it. Without this, one network blip blocks an entity's
          // events forever. The transaction rolls back; the next tick retries from this row.
          topic.resumePublishing(row.ordering_key);
          throw err;
        }
        this.logger.log(`published ${String(row.payload.type)} ${row.event_id}`);
      }

      if (rows.length > 0 && this.options.crashAfterPublish) {
        this.logger.error(
          `CRASH_AFTER_PUBLISH: published ${rows.length} event(s), exiting before UPDATE`,
        );
        process.exit(1);
      }

      if (rows.length > 0) {
        await sql(m, `UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])`, [
          rows.map((r) => r.id),
        ]);
      }
      return rows.length;
    });
  }

  // One Topic object per topic: it holds the client-side batching and ordering state.
  private topic(name: string): Topic {
    let topic = this.topics.get(name);
    if (!topic) {
      topic = this.pubsub.topic(name, { messageOrdering: true });
      this.topics.set(name, topic);
    }
    return topic;
  }
}
