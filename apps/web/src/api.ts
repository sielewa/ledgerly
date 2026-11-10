// Thin client for the gateway's public REST API. The browser never talks to internal services directly.

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAYMENT_PENDING' | 'PAID';
export type PaymentStatus =
  | 'STARTED'
  | 'FUNDS_HELD'
  | 'SENT_TO_BANK'
  | 'BANK_UNKNOWN'
  | 'COMPENSATING'
  | 'COMPLETED'
  | 'FAILED';

export interface Money {
  amountMinor: string; // integer string, never a float
  currency: string;
}

export interface Invoice {
  id: string;
  payerAccountId: string;
  payeeName: string;
  payeeIban: string;
  amount: Money;
  status: InvoiceStatus;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: Money;
  status: PaymentStatus;
  failureReason: string | null;
}

export interface Balance {
  balance: Money;
  held: Money;
  available: Money;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new ApiError(message ?? `HTTP ${res.status}`, res.status);
  }
  return data as T;
}

export const api = {
  balance: (accountId: string) => request<Balance>(`/accounts/${accountId}/balance`),
  invoices: (payerAccountId: string) =>
    request<Invoice[]>(`/invoices?payerAccountId=${encodeURIComponent(payerAccountId)}`),
  createInvoice: (
    body: { payerAccountId: string; payeeName: string; payeeIban: string; amount: Money },
    idempotencyKey: string,
  ) => request<Invoice>('/invoices', { method: 'POST', body, idempotencyKey }),
  issueInvoice: (id: string) => request<Invoice>(`/invoices/${id}/issue`, { method: 'POST' }),
  payInvoice: (id: string, idempotencyKey: string) =>
    request<Payment>(`/invoices/${id}/pay`, { method: 'POST', idempotencyKey }),
  payment: (id: string) => request<Payment>(`/payments/${id}`),
};

/** "12300" -> "123.00 PLN". String math only: amounts never pass through a float. */
export function formatMoney(money: Money | undefined): string {
  if (!money) return '–';
  const minor = money.amountMinor.replace('-', '').padStart(3, '0');
  const sign = money.amountMinor.startsWith('-') ? '−' : '';
  return `${sign}${minor.slice(0, -2)}.${minor.slice(-2)} ${money.currency}`;
}

/** "123.4" -> "12340"; undefined if it's not a positive amount with at most 2 decimals. */
export function toMinor(input: string): string | undefined {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return undefined;
  const minor = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return minor > 0n ? minor.toString() : undefined;
}
