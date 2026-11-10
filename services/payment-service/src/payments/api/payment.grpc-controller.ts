import { Controller } from '@nestjs/common';
import { paymentV1 } from '@ledgerly/proto';
import { asRpcError, invalidArgument, notFound } from '../../shared/errors';
import { PaymentSaga } from '../application/payment-saga';
import { UUID_PATTERN } from './validation.constants';
import { toPaymentProto } from './payment.mapper';

/** gRPC API for our own services (the gateway). Thin: validate input, call the saga, map to the contract. */
@Controller()
@paymentV1.PaymentServiceControllerMethods()
export class PaymentGrpcController implements paymentV1.PaymentServiceController {
  constructor(private readonly saga: PaymentSaga) {}

  async startPayment(req: paymentV1.StartPaymentRequest): Promise<paymentV1.StartPaymentResponse> {
    if (!req.idempotencyKey.trim()) throw invalidArgument('idempotency_key is required');
    if (!UUID_PATTERN.test(req.invoiceId)) throw invalidArgument('invoice_id must be a UUID');
    try {
      return {
        payment: toPaymentProto(await this.saga.start(req.invoiceId, req.idempotencyKey.trim())),
      };
    } catch (err) {
      throw asRpcError(err);
    }
  }

  async getPayment(req: paymentV1.GetPaymentRequest): Promise<paymentV1.GetPaymentResponse> {
    const payment = await this.saga.get(req.paymentId);
    if (!payment) throw notFound(`payment ${req.paymentId} not found`);
    return { payment: toPaymentProto(payment) };
  }
}
