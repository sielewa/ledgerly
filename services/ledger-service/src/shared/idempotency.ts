import { createIdempotent } from '@ledgerly/common';
import { invalidArgument } from './errors';

// Reusing an idempotency key for a different request is the caller's bug: INVALID_ARGUMENT.
export const idempotent = createIdempotent(invalidArgument);
