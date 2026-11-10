import { PROTO_DIR } from '@ledgerly/proto';

// DI tokens of the gRPC clients this service uses.
export const LEDGER_GRPC = 'LEDGER_GRPC';
export const INVOICES_GRPC = 'INVOICES_GRPC';

// Must match ts-proto options in packages/proto/buf.gen.yaml (int64 as string, enums as strings).
export const GRPC_LOADER_OPTIONS = {
  includeDirs: [PROTO_DIR],
  longs: String,
  enums: String,
  defaults: true,
};
