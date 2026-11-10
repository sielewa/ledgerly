import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { PaymentEventV1Schema } from '@ledgerly/events';
import { config } from '../../config';
import { InvoiceService } from '../application/invoice.service';
import type { OrderingKeyQueue } from './ordering-key-queue.interface';

/**
 * Moves invoices through their state machine as payment-service reports progress (choreography-style reaction).
 *
 * Ordering keys guarantee the order of DELIVERY, not of PROCESSING: the client library emits the next message of a
 * key without waiting for our (async) handler to finish. payment.started and payment.failed of one invoice used to
 * be handled concurrently: failed read the invoice still ISSUED, was skipped as "stale", and started then moved it
 * to PAYMENT_PENDING for good. So messages of one ordering key are processed one after another here.
 */
@Injectable()
export class PaymentEventsConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentEventsConsumer.name);
  private subscription?: Subscription;
  private readonly queues = new Map<string, OrderingKeyQueue>();

  constructor(
    private readonly invoices: InvoiceService,
    private readonly pubsub: PubSub,
  ) {}

  onApplicationBootstrap(): void {
    this.subscription = this.pubsub.subscription(config.paymentEventsSubscription);
    this.subscription.on('message', (message: Message) => this.enqueue(message));
    this.subscription.on('error', (err) => this.logger.error(`subscription error: ${String(err)}`));
    this.logger.log(`listening on ${config.paymentEventsSubscription}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.subscription?.close();
  }

  /** Chains the message behind earlier messages with the same ordering key (different keys still run in parallel). */
  private enqueue(message: Message): void {
    const key = message.orderingKey || message.id;
    const queue = this.queues.get(key) ?? { tail: Promise.resolve(), failed: false };
    const tail = queue.tail.then(async () => {
      if (queue.failed) {
        // An earlier message of this key was nacked and will be redelivered: don't let this one overtake it.
        message.nack();
        return;
      }
      queue.failed = !(await this.handle(message));
    });
    queue.tail = tail;
    this.queues.set(key, queue);
    void tail.finally(() => {
      if (queue.tail === tail) this.queues.delete(key); // nothing queued behind it: forget the key
    });
  }

  /** Returns false if the message was nacked. Never throws. */
  private async handle(message: Message): Promise<boolean> {
    try {
      const event = PaymentEventV1Schema.parse(JSON.parse(message.data.toString()));
      const result = await this.invoices.applyPaymentEvent(event);
      this.logger.log(`${event.type} for invoice ${event.data.invoiceId}: ${result}`);
      // Ack after commit, for applied, duplicate and stale alike: none of them gets better by redelivery.
      message.ack();
      return true;
    } catch (err) {
      // Nothing committed; Pub/Sub redelivers. A message that can never succeed is a poison message
      // (on GCP: max delivery attempts + dead-letter topic).
      this.logger.error(`failed to handle message ${message.id}: ${String(err)}`);
      message.nack();
      return false;
    }
  }
}
