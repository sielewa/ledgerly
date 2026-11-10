/** Business rule (enforced by a partial unique index): at most one non-FAILED payment per invoice. */
export class InvoiceAlreadyHasActivePaymentError extends Error {
  constructor() {
    super('this invoice already has an active payment');
    this.name = 'InvoiceAlreadyHasActivePaymentError';
  }
}
