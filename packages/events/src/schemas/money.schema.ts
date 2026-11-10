import { z } from 'zod';

export const MoneySchema = z.object({
  amountMinor: z.string().regex(/^\d+$/), // bigint as string, never a float
  currency: z.string().length(3),
});
