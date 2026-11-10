export const PAYMENT_COLUMNS =
  'id, invoice_id, idempotency_key, payer_account_id, amount_minor, currency, creditor_iban, creditor_name, status, hold_id, failure_reason';

/**
 * Saga states the sweeper revisits. Written INTO the SQL text (not passed as a parameter): Postgres can use the
 * partial index payments_unfinished_idx only if it can prove, at planning time, that the query's condition matches
 * the index's WHERE clause, and it can't do that for a parameter's value.
 */
export const UNFINISHED_STATUSES_SQL =
  "'STARTED', 'FUNDS_HELD', 'SENT_TO_BANK', 'BANK_UNKNOWN', 'COMPENSATING'";
