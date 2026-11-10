import { Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { config } from '../../config';
import { PaymentSaga } from '../application/payment-saga';
import { verifyBankSignature } from './bank-signature';
import type { BankWebhookEvent } from './bank-webhook.interface';

/** HTTP endpoint for the bank's webhooks (the outside world, not gRPC). */
@Controller('webhooks')
export class BankWebhookController {
  constructor(private readonly saga: PaymentSaga) {}

  @Post('bank')
  @HttpCode(200)
  async bank(
    @Req() req: RawBodyRequest<Request>,
    @Headers('bank-signature') signature: string | undefined,
  ) {
    // Verify over the RAW bytes, not over re-serialized req.body (whitespace / key order would differ).
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!verifyBankSignature(raw, signature, config.bankWebhookSecret)) {
      throw new UnauthorizedException('invalid signature');
    }
    const event = JSON.parse(raw) as BankWebhookEvent;
    // Any exception below -> HTTP 500 -> the bank retries the webhook later (at-least-once again).
    await this.saga.onBankNotification(event.data.reference, `webhook ${event.type}`);
    return { received: true };
  }
}
