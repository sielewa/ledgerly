import type { status } from '@grpc/grpc-js';

/** What a gRPC client call rejects with: a plain object, not an Error subclass we could instanceof. */
export interface GrpcError {
  code: status;
  details?: string;
}
