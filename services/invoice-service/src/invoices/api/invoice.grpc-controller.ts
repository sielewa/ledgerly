import { Controller } from '@nestjs/common';
import { invoiceV1 } from '@ledgerly/proto';
import { InvoiceService } from '../application/invoice.service';
import { toInvoiceProto } from './invoice.mapper';
import { requireIban, requirePositiveAmount, requireText, requireUuid } from './validation';

/** gRPC API. Thin transport layer: validate and normalize input, call a use case, map to the contract. */
@Controller()
@invoiceV1.InvoiceServiceControllerMethods()
export class InvoiceGrpcController implements invoiceV1.InvoiceServiceController {
  constructor(private readonly invoices: InvoiceService) {}

  async createInvoice(
    req: invoiceV1.CreateInvoiceRequest,
  ): Promise<invoiceV1.CreateInvoiceResponse> {
    const { amount, currency } = requirePositiveAmount(req.amount);
    const invoice = await this.invoices.create({
      idempotencyKey: requireText(req.idempotencyKey, 'idempotency_key'),
      payerAccountId: requireUuid(req.payerAccountId, 'payer_account_id'),
      payeeName: requireText(req.payeeName, 'payee_name'),
      // Normalized (uppercase, no spaces) BEFORE hashing for idempotency: " pl61…" and "PL61…" are the same request.
      payeeIban: requireIban(req.payeeIban),
      amountMinor: amount.toString(),
      currency,
    });
    return { invoice: toInvoiceProto(invoice) };
  }

  async issueInvoice(req: invoiceV1.IssueInvoiceRequest): Promise<invoiceV1.IssueInvoiceResponse> {
    return {
      invoice: toInvoiceProto(await this.invoices.issue(requireUuid(req.invoiceId, 'invoice_id'))),
    };
  }

  async getInvoice(req: invoiceV1.GetInvoiceRequest): Promise<invoiceV1.GetInvoiceResponse> {
    return {
      invoice: toInvoiceProto(
        await this.invoices.findOne(requireUuid(req.invoiceId, 'invoice_id')),
      ),
    };
  }

  async listInvoices(req: invoiceV1.ListInvoicesRequest): Promise<invoiceV1.ListInvoicesResponse> {
    const limit = req.limit >= 1 && req.limit <= 100 ? req.limit : 50;
    const payerAccountId = req.payerAccountId
      ? requireUuid(req.payerAccountId, 'payer_account_id')
      : undefined;
    return { invoices: (await this.invoices.list(limit, payerAccountId)).map(toInvoiceProto) };
  }
}
