import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { InvoiceIssuedV1 } from '@ledgerly/events';
import { markEventProcessed } from '@ledgerly/common';
import { NotificationsRepository } from '../infrastructure/notifications.repository';
import type { NotificationResult } from './notification.types';

@Injectable()
export class NotificationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsRepository,
  ) {}

  /**
   * Inbox: Pub/Sub and the producer's outbox relay are at-least-once, so the same eventId can arrive more than
   * once, even concurrently. The dedup row and the side effect commit together, so a crash can't leave one without
   * the other. The PRIMARY KEY (not a SELECT) decides: a concurrent copy waits on it, then conflicts.
   */
  async onInvoiceIssued(event: InvoiceIssuedV1): Promise<NotificationResult> {
    return this.dataSource.transaction(async (m) => {
      if (!(await markEventProcessed(m, event.eventId))) return 'duplicate';
      await this.notifications.insert(m, {
        eventId: event.eventId,
        eventType: event.type,
        invoiceId: event.data.invoiceId,
        message: `Invoice for ${event.data.payeeName}: ${event.data.amount.amountMinor} ${event.data.amount.currency} minor units`,
      });
      return 'sent';
    });
  }
}
