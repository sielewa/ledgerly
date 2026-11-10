// Event contracts shared by producers and consumers. Like .proto files, these are a public API:
// change them only in a backward-compatible way (add optional fields), or bump schemaVersion.
//
// Envelope fields:
// - eventId:       unique per event. Consumers deduplicate on it (at-least-once delivery => duplicates happen).
// - type:          what happened, past tense ("invoice.issued"), not a command ("issue invoice").
// - schemaVersion: lets a consumer handle v1 and v2 side by side during a migration.
// - occurredAt:    when it happened in the producer, not when it was delivered.
export { MoneySchema } from './schemas/money.schema';
export { InvoiceIssuedV1Schema } from './schemas/invoice-events.schema';
export { PaymentEventV1Schema } from './schemas/payment-events.schema';
export type { InvoiceIssuedV1, PaymentEventV1 } from './types/events.types';
export { TOPICS } from './topics.constants';
