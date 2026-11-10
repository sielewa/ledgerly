import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TOPICS, type PaymentEventV1 } from '@ledgerly/events';
import { enqueueEvent, isUniqueViolation, sql } from '@ledgerly/common';
import { InvoiceAlreadyHasActivePaymentError } from '../domain/invoice-already-has-active-payment.error';
import type { NewPayment, Payment } from '../domain/payment.interface';
import type { PaymentStatus } from '../domain/payment.types';
import { paymentEvent } from '../domain/payment-events';
import type { PaymentRow } from './payment-row.interface';
import { toPayment } from './payment-row.mapper';
import { PAYMENT_COLUMNS, UNFINISHED_STATUSES_SQL } from './payments.constants';

/** All SQL of the payments table (+ its outbox events). Each method is one short transaction. */
@Injectable()
export class PaymentsRepository {
  private readonly logger = new Logger(PaymentsRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async findById(id: string): Promise<Payment | undefined> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
    return this.one(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE id = $1`, [id]);
  }

  async findByIdempotencyKey(key: string): Promise<Payment | undefined> {
    return this.one(`SELECT ${PAYMENT_COLUMNS} FROM payments WHERE idempotency_key = $1`, [key]);
  }

  /**
   * Inserts the payment and its payment.started event in ONE transaction (outbox). A concurrent request with the
   * same idempotency key gets the payment that request created.
   * @throws InvoiceAlreadyHasActivePaymentError: the partial unique index allows one non-FAILED payment per invoice.
   */
  async create(input: NewPayment): Promise<Payment> {
    try {
      return await this.dataSource.transaction(async (m) => {
        const { rows } = await sql<PaymentRow>(
          m,
          `INSERT INTO payments (idempotency_key, invoice_id, payer_account_id, amount_minor, currency,
                                 creditor_iban, creditor_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING ${PAYMENT_COLUMNS}`,
          [
            input.idempotencyKey,
            input.invoiceId,
            input.payerAccountId,
            input.amountMinor,
            input.currency,
            input.creditorIban,
            input.creditorName,
          ],
        );
        if (!rows[0]) {
          const existing = await sql<PaymentRow>(
            m,
            `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE idempotency_key = $1`,
            [input.idempotencyKey],
          );
          return toPayment(existing.rows[0]!);
        }
        const payment = toPayment(rows[0]);
        await this.enqueue(m, payment, 'payment.started');
        return payment;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new InvoiceAlreadyHasActivePaymentError();
      throw err;
    }
  }

  /**
   * Compare-and-set status change: succeeds only if the payment is still in the status we read. A webhook, the
   * sweeper and start() can act on the same payment concurrently; the loser gets undefined and stops.
   * `event` is written to the outbox in the same transaction as the status change.
   */
  async transition(
    payment: Payment,
    to: PaymentStatus,
    changes: { failureReason?: string; holdId?: string; event?: PaymentEventV1['type'] } = {},
  ): Promise<Payment | undefined> {
    return this.dataSource.transaction(async (m) => {
      const { rows } = await sql<PaymentRow>(
        m,
        `UPDATE payments
         SET status = $3, hold_id = COALESCE($4, hold_id), failure_reason = COALESCE($5, failure_reason),
             updated_at = now()
         WHERE id = $1 AND status = $2
         RETURNING ${PAYMENT_COLUMNS}`,
        [payment.id, payment.status, to, changes.holdId ?? null, changes.failureReason ?? null],
      );
      if (!rows[0]) {
        this.logger.warn(
          `payment ${payment.id}: ${payment.status} -> ${to} lost the race, skipped`,
        );
        return undefined;
      }
      const updated = toPayment(rows[0]);
      if (changes.event) await this.enqueue(m, updated, changes.event);
      this.logger.log(`payment ${payment.id}: ${payment.status} -> ${to}`);
      return updated;
    });
  }

  /** Sagas in a non-final state, untouched for `staleSeconds` (uses the partial index payments_unfinished_idx). */
  async findStuck(staleSeconds: number, limit = 50): Promise<string[]> {
    return this.dataSource.transaction(async (m) => {
      const { rows } = await sql<{ id: string }>(
        m,
        `SELECT id FROM payments
         WHERE status IN (${UNFINISHED_STATUSES_SQL})
           AND updated_at < now() - make_interval(secs => $1)
         ORDER BY updated_at
         LIMIT $2`,
        [staleSeconds, limit],
      );
      return rows.map((r) => r.id);
    });
  }

  private async enqueue(
    m: EntityManager,
    payment: Payment,
    type: PaymentEventV1['type'],
  ): Promise<void> {
    if (!payment.invoiceId) return; // legacy payment without an invoice: nobody to tell
    // Ordering key = invoice id: payment.started must reach invoice-service before payment.completed/failed.
    await enqueueEvent(m, paymentEvent(payment, type), TOPICS.paymentEvents, payment.invoiceId);
  }

  private async one(text: string, params: unknown[]): Promise<Payment | undefined> {
    return this.dataSource.transaction(async (m) => {
      const { rows } = await sql<PaymentRow>(m, text, params);
      return rows[0] && toPayment(rows[0]);
    });
  }
}
