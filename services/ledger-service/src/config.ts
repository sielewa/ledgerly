// All configuration comes from environment variables (12-factor). Defaults are for local development only.
export const config = {
  grpcPort: Number(process.env.GRPC_PORT ?? 50051),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://ledger_svc:ledger_pw@localhost:5432/ledger',
};
