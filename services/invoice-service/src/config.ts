// All configuration comes from environment variables (12-factor). Defaults are for local development only.
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  grpcPort: Number(process.env.GRPC_PORT ?? 50052),
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://invoice_svc:invoice_pw@localhost:5432/invoices',
  gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ledgerly-local',
  // Locally we always talk to the emulator, so a missing variable can never publish to real GCP.
  pubsubEmulatorHost:
    process.env.PUBSUB_EMULATOR_HOST ?? (isProduction ? undefined : 'localhost:8085'),
  // invoice-service's own copy of payment-service's events.
  paymentEventsSubscription:
    process.env.PAYMENT_EVENTS_SUBSCRIPTION ?? 'invoice-service.payment-events',
  // Chaos switch: kill the process right after the DB commit, before the event is published.
  crashAfterCommit: process.env.CRASH_AFTER_COMMIT === 'true',
  // Chaos switch: the relay publishes a batch and dies before marking it published -> redelivery.
  crashAfterPublish: process.env.CRASH_AFTER_PUBLISH === 'true',
};
