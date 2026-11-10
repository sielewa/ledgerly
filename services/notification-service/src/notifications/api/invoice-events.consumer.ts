import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Message, PubSub, Subscription } from '@google-cloud/pubsub';
import { InvoiceIssuedV1Schema } from '@ledgerly/events';
import { config } from '../../config';
import { NotificationService } from '../application/notification.service';

/** Inbound adapter: Pub/Sub subscription -> use case. Decides ack vs nack. */
@Injectable()
export class InvoiceEventsConsumer implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(InvoiceEventsConsumer.name);
  private subscription?: Subscription;

  constructor(
    private readonly notifications: NotificationService,
    private readonly pubsub: PubSub,
  ) {}

  onApplicationBootstrap(): void {
    this.subscription = this.pubsub.subscription(config.subscription);
    // The listener must not be async: an async callback's rejected promise would be swallowed by the
    // EventEmitter. handle() catches everything itself and decides ack vs nack.
    this.subscription.on('message', (message: Message) => void this.handle(message));
    this.subscription.on('error', (err) => this.logger.error(`subscription error: ${String(err)}`));
    this.logger.log(`listening on ${config.subscription}`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.subscription?.close();
  }

  private async handle(message: Message): Promise<void> {
    try {
      const event = InvoiceIssuedV1Schema.parse(JSON.parse(message.data.toString()));
      const result = await this.notifications.onInvoiceIssued(event);
      if (result === 'duplicate') {
        this.logger.log(
          `duplicate event detected for invoice ${event.data.invoiceId} (event ${event.eventId})`,
        );
      } else {
        this.logger.log(
          `📧 sent "invoice issued" email for invoice ${event.data.invoiceId} (event ${event.eventId})`,
        );
      }
      // Ack only AFTER commit, for new events and duplicates alike. A duplicate must be acked, not nacked:
      // nack would redeliver an already handled message in a tight loop.
      message.ack();
    } catch (err) {
      this.logger.error(`failed to handle message ${message.id}: ${String(err)}`);
      // Ask for redelivery. Nothing was committed (the transaction rolled back), so a retry is safe.
      // An event that can never succeed loops here: that's a poison message -> max attempts + dead-letter topic.
      message.nack();
    }
  }
}
