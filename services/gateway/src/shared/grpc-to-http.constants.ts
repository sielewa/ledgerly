import { status } from '@grpc/grpc-js';

// gRPC status -> HTTP status. The gateway is the only place that knows about both worlds.
export const HTTP_BY_GRPC: Partial<Record<status, number>> = {
  [status.INVALID_ARGUMENT]: 400,
  [status.UNAUTHENTICATED]: 401,
  [status.PERMISSION_DENIED]: 403,
  [status.NOT_FOUND]: 404,
  [status.ALREADY_EXISTS]: 409,
  [status.FAILED_PRECONDITION]: 409, // business rule says "not now" (e.g. wrong invoice status)
  [status.ABORTED]: 409, // concurrency conflict, safe to retry
  [status.RESOURCE_EXHAUSTED]: 429,
  [status.UNIMPLEMENTED]: 501,
  [status.UNAVAILABLE]: 503, // service down / unreachable: retryable
  [status.DEADLINE_EXCEEDED]: 504, // outcome UNKNOWN: retry only with the same idempotency key
};
