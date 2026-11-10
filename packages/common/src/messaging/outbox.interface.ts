export interface RelayLogger {
  log(message: string): void;
  error(message: string): void;
}

export interface OutboxRelayOptions {
  batchSize?: number;
  pollIntervalMs?: number;
  /** Chaos switch: exit after publishing a batch, before marking it published (reproduces duplicate delivery). */
  crashAfterPublish?: boolean;
}

/** A row of the outbox table, as read by the relay. */
export interface OutboxRow {
  id: string;
  event_id: string;
  topic: string;
  ordering_key: string;
  payload: Record<string, unknown>;
}
