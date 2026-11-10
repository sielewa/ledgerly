import { join } from 'node:path';

// Directory with the .proto sources. NestJS loads .proto files at runtime (via @grpc/proto-loader),
// so services need the real files, not only the generated TypeScript types.
export const PROTO_DIR = join(__dirname, '..', 'proto');

// Each proto package is exported under its own namespace, because every generated
// file exports the same helper names (e.g. `protobufPackage`) and `export *` would clash.
export * as commonV1 from './gen/ledgerly/common/v1/money';
export * as ledgerV1 from './gen/ledgerly/ledger/v1/ledger';
export * as invoiceV1 from './gen/ledgerly/invoice/v1/invoice';
export * as paymentV1 from './gen/ledgerly/payment/v1/payment';
