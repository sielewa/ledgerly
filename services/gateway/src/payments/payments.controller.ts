import { Controller, Get, Inject, OnModuleInit, Param } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { paymentV1 } from '@ledgerly/proto';
import { PAYMENT_GRPC } from '../grpc/grpc-clients.constants';
import { paymentToRest } from './payment.mapper';

@Controller('payments')
export class PaymentsController implements OnModuleInit {
  private payments!: paymentV1.PaymentServiceClient;

  constructor(@Inject(PAYMENT_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.payments = this.client.getService<paymentV1.PaymentServiceClient>(
      paymentV1.PAYMENT_SERVICE_NAME,
    );
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const res = await firstValueFrom(this.payments.getPayment({ paymentId: id }));
    return paymentToRest(res.payment);
  }
}
