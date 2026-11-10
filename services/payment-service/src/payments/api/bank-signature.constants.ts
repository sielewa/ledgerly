// Replay protection: a signed webhook is accepted only within this window around its timestamp (both ways).
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
