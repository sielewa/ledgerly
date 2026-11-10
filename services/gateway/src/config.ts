// All configuration comes from environment variables (12-factor). Defaults are for local development only.
export const config = {
  httpPort: Number(process.env.PORT ?? 3000), // Cloud Run injects PORT
  invoiceServiceAddr: process.env.INVOICE_SERVICE_ADDR ?? 'localhost:50052',
  paymentServiceAddr: process.env.PAYMENT_SERVICE_ADDR ?? 'localhost:50053',
  ledgerServiceAddr: process.env.LEDGER_SERVICE_ADDR ?? 'localhost:50051',
};
