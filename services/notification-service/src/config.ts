// All configuration comes from environment variables (12-factor). Defaults are for local development only.
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgres://notification_svc:notification_pw@localhost:5432/notifications',
  gcpProjectId: process.env.GCP_PROJECT_ID ?? 'ledgerly-local',
  pubsubEmulatorHost:
    process.env.PUBSUB_EMULATOR_HOST ?? (isProduction ? undefined : 'localhost:8085'),
  // One subscription per consumer service: each service gets its own copy of every message.
  subscription: process.env.INVOICE_EVENTS_SUBSCRIPTION ?? 'notification-service.invoice-events',
};
