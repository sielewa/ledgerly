import type { z } from 'zod';
import type { InvoiceIssuedV1Schema } from '../schemas/invoice-events.schema';
import type { PaymentEventV1Schema } from '../schemas/payment-events.schema';

// Types are derived from the schemas, so the runtime validation and the compile-time type can never disagree.
export type InvoiceIssuedV1 = z.infer<typeof InvoiceIssuedV1Schema>;
export type PaymentEventV1 = z.infer<typeof PaymentEventV1Schema>;
