/** Messages of one ordering key still being processed in this instance (see PaymentEventsConsumer). */
export interface OrderingKeyQueue {
  /** Resolves when the last enqueued message of this key has been handled. */
  tail: Promise<void>;
  /** An earlier message of this key was nacked: later ones must be nacked too, or they would overtake it. */
  failed: boolean;
}
