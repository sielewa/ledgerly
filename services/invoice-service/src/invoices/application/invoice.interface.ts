export interface CreateInvoiceCommand {
  idempotencyKey: string;
  payerAccountId: string;
  payeeName: string;
  payeeIban: string;
  amountMinor: string;
  currency: string;
}
