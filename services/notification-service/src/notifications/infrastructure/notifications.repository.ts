import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { sql } from '@ledgerly/common';
import type { NewNotification } from '../domain/notification.interface';

/** One row = one "email" sent (in a real system: a call to an email provider). */
@Injectable()
export class NotificationsRepository {
  async insert(m: EntityManager, n: NewNotification): Promise<void> {
    await sql(
      m,
      `INSERT INTO notifications (event_id, event_type, invoice_id, message) VALUES ($1, $2, $3, $4)`,
      [n.eventId, n.eventType, n.invoiceId, n.message],
    );
  }
}
