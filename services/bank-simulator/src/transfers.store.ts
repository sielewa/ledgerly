import type { Transfer } from './transfers.interface';

// In memory on purpose: restarting the bank simulator forgets everything. Fine for a test double.
export const transfers = new Map<string, Transfer>();
