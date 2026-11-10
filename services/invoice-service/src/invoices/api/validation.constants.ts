export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;
export const INTEGER_PATTERN = /^-?\d+$/;
// Shape check only (country code, check digits, 11-30 alphanumerics), not the mod-97 checksum.
export const IBAN_PATTERN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
