// Public REST shape. Deliberately NOT the proto type: the public API stays stable even if internal
// contracts change, and we expose "DRAFT" instead of the proto enum name "INVOICE_STATUS_DRAFT".
export interface CreateInvoiceBody {
  payerAccountId: string;
  payeeName: string;
  payeeIban: string;
  amount: { amountMinor: string; currency: string };
}
