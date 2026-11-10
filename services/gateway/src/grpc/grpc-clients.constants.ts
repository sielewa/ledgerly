import { PROTO_DIR } from '@ledgerly/proto';

// DI tokens of the gRPC clients (one HTTP/2 connection per downstream service).
export const INVOICE_GRPC = 'INVOICE_GRPC';
export const PAYMENT_GRPC = 'PAYMENT_GRPC';
export const LEDGER_GRPC = 'LEDGER_GRPC';

// Must match ts-proto options in packages/proto/buf.gen.yaml (int64 as string, enums as strings).
export const GRPC_LOADER_OPTIONS = {
  includeDirs: [PROTO_DIR],
  longs: String,
  enums: String,
  defaults: true,
};
