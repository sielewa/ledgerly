import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { invoiceV1, paymentV1 } from '@ledgerly/proto';
import { INVOICE_GRPC, PAYMENT_GRPC } from '../grpc/grpc-clients.constants';
import { paymentToRest } from '../payments/payment.mapper';
import { invoiceToRest } from './invoice.mapper';
import type { CreateInvoiceBody } from './invoices.interface';

@Controller('invoices')
export class InvoicesController implements OnModuleInit {
  private invoices!: invoiceV1.InvoiceServiceClient;
  private payments!: paymentV1.PaymentServiceClient;

  constructor(
    @Inject(INVOICE_GRPC) private readonly client: ClientGrpc,
    @Inject(PAYMENT_GRPC) private readonly paymentClient: ClientGrpc,
  ) {}

  onModuleInit(): void {
    this.invoices = this.client.getService<invoiceV1.InvoiceServiceClient>(
      invoiceV1.INVOICE_SERVICE_NAME,
    );
    this.payments = this.paymentClient.getService<paymentV1.PaymentServiceClient>(
      paymentV1.PAYMENT_SERVICE_NAME,
    );
  }

  // GET /invoices?payerAccountId=<uuid> -> only that account's invoices; without it, all of them.
  @Get()
  async list(@Query('payerAccountId') payerAccountId: string | undefined) {
    const res = await firstValueFrom(
      this.invoices.listInvoices({ limit: 50, payerAccountId: payerAccountId ?? '' }),
    );
    return res.invoices.map(invoiceToRest);
  }

  @Post()
  async create(
    @Body() body: CreateInvoiceBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    // Required, not optional: a client that forgets it should fail loudly in dev, not create duplicates
    // in production. This is a breaking change of the public API (fine here: the API is new).
    // The gateway stays stateless: it only forwards the key; invoice-service stores it with the invoice.
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    const res = await firstValueFrom(
      this.invoices.createInvoice({
        idempotencyKey: idempotencyKey.trim(),
        payerAccountId: String(body.payerAccountId ?? ''),
        payeeName: String(body.payeeName ?? ''),
        payeeIban: String(body.payeeIban ?? ''),
        amount: {
          amountMinor: String(body.amount?.amountMinor ?? ''),
          currency: String(body.amount?.currency ?? ''),
        },
      }),
    );
    return invoiceToRest(res.invoice);
  }

  @Post(':id/issue')
  @HttpCode(200)
  async issue(@Param('id') id: string) {
    const res = await firstValueFrom(this.invoices.issueInvoice({ invoiceId: id }));
    return invoiceToRest(res.invoice);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const res = await firstValueFrom(this.invoices.getInvoice({ invoiceId: id }));
    return invoiceToRest(res.invoice);
  }

  // Starts the payment saga and returns its CURRENT state (often not final yet): the client polls
  // GET /payments/:id, and the invoice itself moves to PAYMENT_PENDING -> PAID via events (eventually).
  @Post(':id/pay')
  @HttpCode(202)
  async pay(
    @Param('id') id: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    if (!idempotencyKey?.trim())
      throw new BadRequestException('Idempotency-Key header is required');
    const res = await firstValueFrom(
      this.payments.startPayment({ invoiceId: id, idempotencyKey: idempotencyKey.trim() }),
    );
    return paymentToRest(res.payment);
  }
}
