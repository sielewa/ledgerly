import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';

// Error codes are part of the contract (see ledger.proto). Nest sends { code, message } as gRPC status.
function rpcError(code: status, message: string): RpcException {
  return new RpcException({ code, message });
}

export function notFound(msg: string): RpcException {
  return rpcError(status.NOT_FOUND, msg);
}
export function invalidArgument(msg: string): RpcException {
  return rpcError(status.INVALID_ARGUMENT, msg);
}
export function failedPrecondition(msg: string): RpcException {
  return rpcError(status.FAILED_PRECONDITION, msg);
}
export function alreadyExists(msg: string): RpcException {
  return rpcError(status.ALREADY_EXISTS, msg);
}
// Concurrency conflict (someone changed the row between our read and write). The caller may retry.
export function aborted(msg: string): RpcException {
  return rpcError(status.ABORTED, msg);
}

/** The gRPC status code of an error from a gRPC client call (a plain { code, details } object), if any. */
export function grpcCode(err: unknown): number | undefined {
  return typeof err === 'object' && err !== null ? (err as { code?: number }).code : undefined;
}

/** Errors from downstream gRPC clients are plain { code, details } objects; keep their code instead of UNKNOWN. */
export function asRpcError(err: unknown): unknown {
  if (err instanceof RpcException) return err;
  const e = err as { code?: unknown; details?: unknown };
  if (typeof e?.code === 'number')
    return new RpcException({ code: e.code, message: String(e.details) });
  return err;
}
