import { Module } from '@nestjs/common';
import { InvoiceEventsConsumer } from './api/invoice-events.consumer';
import { NotificationService } from './application/notification.service';
import { NotificationsRepository } from './infrastructure/notifications.repository';

@Module({
  providers: [InvoiceEventsConsumer, NotificationService, NotificationsRepository],
})
export class NotificationsModule {}
