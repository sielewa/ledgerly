// Shared infrastructure for our services. Framework-free on purpose: only TYPES are imported from typeorm and
// @google-cloud/pubsub, and nothing from NestJS. A runtime dependency here could give a service a second copy of a
// library, and classes like RpcException or DataSource are matched by identity (instanceof / DI tokens).
// Service-specific things (gRPC error mapping, input validation) stay in the services.
export { sql, isUniqueViolation } from './database/sql';
export { createIdempotent } from './idempotency/idempotent';
export type { Idempotent } from './idempotency/idempotency.types';
export { markEventProcessed } from './messaging/inbox';
export { enqueueEvent } from './messaging/outbox';
export { OutboxRelay } from './messaging/outbox-relay';
export type { OutboxRelayOptions, RelayLogger } from './messaging/outbox.interface';
