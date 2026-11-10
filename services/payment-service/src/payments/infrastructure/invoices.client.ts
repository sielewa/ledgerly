import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import { firstValueFrom } from 'rxjs';
import { invoiceV1 } from '@ledgerly/proto';
import { grpcCode } from '../../shared/errors';
import { INVOICES_GRPC } from './grpc-clients.constants';

/** invoice-service over gRPC. The payment reads amount, payer and payee from here, never from the client. */
@Injectable()
export class InvoicesClient implements OnModuleInit {
  private invoices!: invoiceV1.InvoiceServiceClient;

  constructor(@Inject(INVOICES_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.invoices = this.client.getService<invoiceV1.InvoiceServiceClient>(
      invoiceV1.INVOICE_SERVICE_NAME,
    );
  }

  /** Returns undefined if the invoice does not exist. */
  async getInvoice(invoiceId: string): Promise<invoiceV1.Invoice | undefined> {
    try {
      const res = await firstValueFrom(this.invoices.getInvoice({ invoiceId }));
      return res.invoice;
    } catch (err) {
      if (grpcCode(err) === status.NOT_FOUND) return undefined;
      throw err;
    }
  }
}
