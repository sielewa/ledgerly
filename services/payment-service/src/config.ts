// All configuration comes from environment variables (12-factor). Defaults are for local development only.
export const config = {
  httpPort: Number(process.env.PORT ?? 3100), // bank webhooks + /sweep
  grpcPort: Number(process.env.GRPC_PORT ?? 50053), // StartPayment / GetPayment for the gateway
  invoiceAddr: process.env.INVOICE_SERVICE_ADDR ?? 'localhost:50052',
  gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ledgerly-local',
  pubsubEmulatorHost:
    process.env.PUBSUB_EMULATOR_HOST ??
    (process.env.NODE_ENV === 'production' ? undefined : 'localhost:8085'),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://payment_svc:payment_pw@localhost:5432/payments',
  ledgerAddr: process.env.LEDGER_ADDR ?? 'localhost:50051',
  bankUrl: process.env.BANK_URL ?? 'http://localhost:4000',
  // How long we wait for the bank before giving up on the HTTP call (NOT on the payment!).
  bankTimeoutMs: Number(process.env.BANK_TIMEOUT_MS ?? 3000),
  // The sweeper only touches sagas untouched for this long (don't race with a start() still waiting).
  sweepStaleSeconds: Number(process.env.SWEEP_STALE_SECONDS ?? 10),
  // Chaos switch: die right after the bank accepted the transfer, before saving SENT_TO_BANK (stuck saga).
  crashAfterBankCall: process.env.CRASH_AFTER_BANK_CALL === 'true',
  bankWebhookSecret: process.env.BANK_WEBHOOK_SECRET ?? 'dev-webhook-secret',
};
