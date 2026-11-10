import { Module } from '@nestjs/common';
import { InvoiceGrpcController } from './api/invoice.grpc-controller';
import { PaymentEventsConsumer } from './api/payment-events.consumer';
import { InvoiceService } from './application/invoice.service';
import { InvoicesRepository } from './infrastructure/invoices.repository';

@Module({
  controllers: [InvoiceGrpcController],
  providers: [InvoiceService, InvoicesRepository, PaymentEventsConsumer],
})
export class InvoicesModule {}
