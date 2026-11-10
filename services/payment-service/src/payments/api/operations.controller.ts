import { Controller, HttpCode, Post } from '@nestjs/common';
import { PaymentSaga } from '../application/payment-saga';

/** Operational endpoints, called by infrastructure rather than users. */
@Controller()
export class OperationsController {
  constructor(private readonly saga: PaymentSaga) {}

  // On GCP: Cloud Scheduler calls this every minute. Locally: curl -X POST localhost:3100/sweep
  @Post('sweep')
  @HttpCode(200)
  sweep() {
    return this.saga.sweep();
  }
}
