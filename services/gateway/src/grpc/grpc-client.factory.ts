import { join } from 'node:path';
import { ClientProviderOptions, Transport } from '@nestjs/microservices';
import { PROTO_DIR } from '@ledgerly/proto';
import { GRPC_LOADER_OPTIONS } from './grpc-clients.constants';

export function grpcClient(
  name: string,
  pkg: string,
  protoFile: string,
  url: string,
): ClientProviderOptions {
  return {
    name,
    transport: Transport.GRPC,
    options: {
      package: pkg,
      protoPath: join(PROTO_DIR, protoFile),
      url,
      loader: GRPC_LOADER_OPTIONS,
    },
  };
}
