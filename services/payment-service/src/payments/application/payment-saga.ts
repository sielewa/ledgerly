import { Injectable, Logger } from '@nestjs/common';
import { invoiceV1 } from '@ledgerly/proto';
import { config } from '../../config';
import { PERMANENT_LEDGER_ERRORS } from './payment-saga.constants';
import { failedPrecondition, grpcCode, invalidArgument, notFound } from '../../shared/errors';
import type { Payment } from '../domain/payment.interface';
import type { PaymentStatus } from '../domain/payment.types';
import { stepKey } from '../domain/step-key';
import { decide } from '../domain/payment-decision';
import type { BankView } from '../domain/payment-decision.types';
import { InvoiceAlreadyHasActivePaymentError } from '../domain/invoice-already-has-active-payment.error';
import { BankClient } from '../infrastructure/bank.client';
import { BankError } from '../infrastructure/bank.error';
import { InvoicesClient } from '../infrastructure/invoices.client';
import { LedgerClient } from '../infrastructure/ledger.client';
import { PaymentsRepository } from '../infrastructure/payments.repository';

/**
 * Orchestrated saga "pay an invoice". The payments row is the durable saga state; every step is idempotent with a
 * deterministic key, so any step can be retried after a crash.
 *
 *   STARTED --PlaceHold--> FUNDS_HELD --POST /transfers--> SENT_TO_BANK --settled--> CaptureHold --> COMPLETED
 *   timeout / 5xx from the bank            --> BANK_UNKNOWN (ask the bank, never compensate blindly)
 *   rejected                               --> COMPENSATING --ReleaseHold--> FAILED
 *   ledger says no (funds, account, input) --> FAILED (no hold, nothing to compensate)
 *   ledger unreachable                     --> stays STARTED, the sweeper resumes it
 */
@Injectable()
export class PaymentSaga {
  private readonly logger = new Logger(PaymentSaga.name);

  constructor(
    private readonly payments: PaymentsRepository,
    private readonly ledger: LedgerClient,
    private readonly invoices: InvoicesClient,
    private readonly bank: BankClient,
  ) {}

  async start(invoiceId: string, idempotencyKey: string): Promise<Payment> {
    // A retry with the same key returns (and, if needed, continues) the payment it already created.
    const payment =
      (await this.payments.findByIdempotencyKey(idempotencyKey)) ??
      (await this.create(invoiceId, idempotencyKey));
    if (payment.invoiceId !== invoiceId) {
      throw invalidArgument('idempotency_key was already used to pay a different invoice');
    }
    if (payment.status !== 'STARTED') return payment; // a retry of a payment that already moved on
    return this.runFromStarted(payment);
  }

  async get(paymentId: string): Promise<Payment | undefined> {
    return this.payments.findById(paymentId);
  }

  /** Webhook = a NOTIFICATION, not the source of truth: we fetch the current status and decide on that. */
  async onBankNotification(reference: string, source: string): Promise<void> {
    await this.reconcile(reference, source);
  }

  /**
   * Finds sagas stuck in a non-final state (webhook lost, process killed mid-saga) and reconciles them with the
   * bank. Only rows untouched for a while, so we don't race with a start() that is still waiting for the bank.
   */
  async sweep(): Promise<{ checked: number }> {
    const stuck = await this.payments.findStuck(config.sweepStaleSeconds);
    for (const id of stuck) {
      try {
        await this.reconcile(id, 'sweeper');
      } catch (err) {
        this.logger.error(`sweeper: payment ${id} failed: ${String(err)}`); // the next sweep retries
      }
    }
    return { checked: stuck.length };
  }

  // ---------------------------------------------------------------------------------------------

  private async create(invoiceId: string, idempotencyKey: string): Promise<Payment> {
    // Amount, payer and payee come from the invoice, never from the client: the client only says "pay this one".
    const invoice = await this.invoices.getInvoice(invoiceId);
    if (!invoice) throw notFound(`invoice ${invoiceId} not found`);
    if (invoice.status !== invoiceV1.InvoiceStatus.INVOICE_STATUS_ISSUED) {
      throw failedPrecondition(
        `invoice is ${invoice.status.replace('INVOICE_STATUS_', '')}, only ISSUED can be paid`,
      );
    }
    try {
      return await this.payments.create({
        idempotencyKey,
        invoiceId: invoice.id,
        payerAccountId: invoice.payerAccountId,
        amountMinor: invoice.amount!.amountMinor,
        currency: invoice.amount!.currency,
        creditorIban: invoice.payeeIban,
        creditorName: invoice.payeeName,
      });
    } catch (err) {
      // One active payment per invoice, whatever the idempotency key: two tabs must not pay twice.
      if (err instanceof InvoiceAlreadyHasActivePaymentError) {
        throw failedPrecondition(err.message);
      }
      throw err;
    }
  }

  /** Steps 1 and 2 of the saga. Used by start() and by the sweeper for payments stuck in STARTED. */
  private async runFromStarted(started: Payment): Promise<Payment> {
    let payment = started;

    // Step 1: reserve the money.
    try {
      const holdId = await this.ledger.placeHold(
        stepKey(payment, 'place-hold'),
        payment.payerAccountId,
        payment.amountMinor,
        payment.currency,
      );
      const held = await this.move(payment, 'FUNDS_HELD', { holdId });
      if (!held) return this.current(payment); // a concurrent duplicate request got there first
      payment = held;
    } catch (err) {
      const code = grpcCode(err);
      if (code !== undefined && PERMANENT_LEDGER_ERRORS.includes(code)) {
        // A definite "no" from the ledger (no funds, no such account...): no hold was placed, nothing to
        // compensate. FAILED emits payment.failed, so the invoice goes back to ISSUED instead of hanging.
        const reason = (err as { details?: string }).details ?? String(err);
        return (
          (await this.move(payment, 'FAILED', { failureReason: reason })) ?? this.current(payment)
        );
      }
      // Transient (ledger down, timeout): stay STARTED. The sweeper retries PlaceHold with the same key.
      throw err;
    }

    // Step 2: ask the bank to send it.
    try {
      await this.sendTransfer(payment);
    } catch (err) {
      if (err instanceof BankError && err.httpStatus !== undefined && err.httpStatus < 500) {
        // A definite "no" (400/409): the bank did NOT accept the transfer. Safe to compensate now.
        return this.compensate(payment, String(err));
      }
      // Timeout, network error, 5xx: the outcome is UNKNOWN. The bank may have accepted it and will pay.
      // Never compensate on a timeout: record that we don't know, and ask the bank (webhook / sweeper).
      this.logger.warn(`bank outcome unknown for payment ${payment.id}: ${String(err)}`);
      return (await this.move(payment, 'BANK_UNKNOWN')) ?? this.current(payment);
    }
    if (config.crashAfterBankCall) {
      this.logger.error(
        `CRASH_AFTER_BANK_CALL: payment ${payment.id} sent, exiting before saving it`,
      );
      process.exit(1);
    }
    // Compare-and-set from FUNDS_HELD: if a webhook was faster and already moved the payment on, keep its state.
    return (await this.move(payment, 'SENT_TO_BANK')) ?? this.current(payment);
  }

  /** The ONE place that acts on the bank's view of a transfer, for webhooks and the sweeper alike. */
  private async reconcile(paymentId: string, source: string): Promise<void> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      this.logger.warn(`[${source}] unknown payment ${paymentId}`);
      return;
    }
    if (payment.status === 'STARTED') {
      // Stuck before the hold (crash or ledger down during start()): the bank can't know it yet. Resume the saga.
      this.logger.log(`[${source}] payment ${payment.id}: still STARTED -> resume from PlaceHold`);
      await this.runFromStarted(payment);
      return;
    }
    const transfer = await this.bank.getTransfer(payment.id);
    const view: BankView = transfer?.status ?? 'NOT_FOUND';
    const action = decide(payment.status, view);
    this.logger.log(
      `[${source}] payment ${payment.id}: ours ${payment.status}, bank ${view} -> ${action}`,
    );

    switch (action) {
      case 'CAPTURE':
        await this.ledger.captureHold(stepKey(payment, 'capture-hold'), payment.holdId!);
        await this.move(payment, 'COMPLETED');
        return;
      case 'COMPENSATE':
        await this.compensate(payment, 'rejected by bank');
        return;
      case 'RESEND':
        await this.sendTransfer(payment); // same reference: the bank won't create a second transfer
        await this.move(payment, 'SENT_TO_BANK');
        return;
      case 'WAIT':
        // The bank has it: our POST did arrive, even if we never saw the response.
        if (payment.status === 'FUNDS_HELD' && view === 'PENDING') {
          await this.move(payment, 'SENT_TO_BANK');
        }
        return;
      case 'IGNORE':
        return;
      case 'ALERT':
        // In production: page someone / open an incident. Never "fix" money automatically here.
        this.logger.error(
          `ALERT payment ${payment.id}: ours ${payment.status}, bank ${view}. Manual review required.`,
        );
        return;
    }
  }

  /**
   * Compensation for PlaceHold. COMPENSATING is saved BEFORE calling the ledger: after a crash the sweeper sees it
   * and retries ReleaseHold with the same deterministic key (idempotent, so never released twice).
   */
  private async compensate(payment: Payment, reason: string): Promise<Payment> {
    const compensating =
      payment.status === 'COMPENSATING'
        ? payment
        : await this.move(payment, 'COMPENSATING', { failureReason: reason });
    if (!compensating) return this.current(payment); // someone else moved it on
    await this.ledger.releaseHold(stepKey(payment, 'release-hold'), payment.holdId!);
    return (await this.move(compensating, 'FAILED')) ?? this.current(payment);
  }

  private async sendTransfer(payment: Payment): Promise<void> {
    await this.bank.createTransfer({
      reference: payment.id, // our id = the bank's idempotency key
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      creditorIban: payment.creditorIban,
      creditorName: payment.creditorName,
    });
  }

  /** Status change + the payment.* event that tells invoice-service, in one transaction (outbox). */
  private move(
    payment: Payment,
    to: PaymentStatus,
    changes: { failureReason?: string; holdId?: string } = {},
  ): Promise<Payment | undefined> {
    const event =
      to === 'COMPLETED' ? 'payment.completed' : to === 'FAILED' ? 'payment.failed' : undefined;
    return this.payments.transition(payment, to, { ...changes, event });
  }

  private async current(payment: Payment): Promise<Payment> {
    return (await this.payments.findById(payment.id))!;
  }
}
