import type { GrpcError } from './grpc-error.interface';

export function isGrpcError(err: unknown): err is GrpcError {
  return typeof err === 'object' && err !== null && typeof (err as GrpcError).code === 'number';
}
