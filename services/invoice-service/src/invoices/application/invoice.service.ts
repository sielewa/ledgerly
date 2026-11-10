import { Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { TOPICS, type PaymentEventV1 } from '@ledgerly/events';
import { enqueueEvent, markEventProcessed } from '@ledgerly/common';
import { config } from '../../config';
import { aborted, failedPrecondition, notFound } from '../../shared/errors';
import { idempotent } from '../../shared/idempotency';
import { InvalidTransitionError } from '../domain/invalid-transition.error';
import { invoiceIssuedEvent } from '../domain/invoice-events';
import type { Invoice } from '../domain/invoice.interface';
import { transition } from '../domain/invoice-state';
import { TRANSITIONS } from '../domain/invoice-state.constants';
import type { InvoiceEvent } from '../domain/invoice-state.types';
import { InvoicesRepository } from '../infrastructure/invoices.repository';
import { PAYMENT_EVENT_TO_INVOICE_EVENT } from './invoice.constants';
import type { CreateInvoiceCommand } from './invoice.interface';
import type { PaymentEventResult } from './invoice.types';

/** Invoice use cases. Owns the transaction boundaries; input is already validated by the api layer. */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly invoices: InvoicesRepository,
  ) {}

  async create(cmd: CreateInvoiceCommand): Promise<Invoice> {
    const { idempotencyKey, ...data } = cmd;
    return this.dataSource.transaction((m) =>
      // Same key again (double click, retry after timeout) -> the stored response, no second INSERT.
      // A concurrent duplicate waits on the idempotency_keys primary key until this transaction ends.
      // ':v2': the stored response is now the domain Invoice, no longer the proto response. Stored responses are a
      // contract too: a retry that arrives after the deploy must not get an old-shaped response it can't read.
      idempotent(m, 'CreateInvoice:v2', idempotencyKey, data, () => this.invoices.insert(m, data)),
    );
  }

  async issue(invoiceId: string): Promise<Invoice> {
    const invoice = await this.dataSource.transaction(async (m) => {
      const current = await this.get(m, invoiceId);
      // Natural idempotency: "make it ISSUED" twice has the same effect as once, so a retry after a timeout gets
      // OK instead of a confusing FAILED_PRECONDITION. No idempotency key needed here.
      if (current.status === 'ISSUED') return current;

      const issued = await this.apply(m, current, 'ISSUE');
      // Transactional outbox: the event is written in the SAME transaction as the status change. Both commit or
      // neither does; the relay publishes it later, even if we crash right after COMMIT.
      await enqueueEvent(m, invoiceIssuedEvent(issued), TOPICS.invoiceEvents, issued.id);
      return issued;
    });
    // <- COMMITTED here. The event is safe in the outbox; nothing below can lose it.

    if (config.crashAfterCommit) {
      this.logger.error(`CRASH_AFTER_COMMIT: invoice ${invoice.id} committed, exiting`);
      process.exit(1);
    }
    return invoice;
  }

  async findOne(invoiceId: string): Promise<Invoice> {
    return this.dataSource.transaction((m) => this.get(m, invoiceId));
  }

  async list(limit: number, payerAccountId?: string): Promise<Invoice[]> {
    return this.dataSource.transaction((m) =>
      this.invoices.listNewestFirst(m, limit, payerAccountId),
    );
  }

  /**
   * Applies a payment.* event to the invoice state machine. Inbox row in the SAME transaction as the status
   * change: a redelivered event is detected and skipped. An event that no longer fits the current status is
   * recorded and skipped ('stale') instead of failing forever.
   */
  async applyPaymentEvent(event: PaymentEventV1): Promise<PaymentEventResult> {
    const invoiceEvent = PAYMENT_EVENT_TO_INVOICE_EVENT[event.type];
    return this.dataSource.transaction(async (m) => {
      if (!(await markEventProcessed(m, event.eventId))) return 'duplicate';

      const invoice = await this.get(m, event.data.invoiceId);
      if (TRANSITIONS[invoice.status][invoiceEvent] === undefined) return 'stale';
      await this.apply(m, invoice, invoiceEvent);
      return 'applied';
    });
  }

  // ---------------------------------------------------------------------------------------------

  /** The only place that changes an invoice's status: the state machine decides, the UPDATE is compare-and-set. */
  private async apply(m: EntityManager, invoice: Invoice, event: InvoiceEvent): Promise<Invoice> {
    let next;
    try {
      next = transition(invoice.status, event);
    } catch (err) {
      if (err instanceof InvalidTransitionError) throw failedPrecondition(err.message);
      throw err;
    }
    const updated = await this.invoices.updateStatus(m, invoice, next);
    if (!updated) {
      throw aborted(
        `invoice ${invoice.id} changed status concurrently (expected ${invoice.status})`,
      );
    }
    return updated;
  }

  private async get(m: EntityManager, invoiceId: string): Promise<Invoice> {
    const invoice = await this.invoices.findById(m, invoiceId);
    if (!invoice) throw notFound(`invoice ${invoiceId} not found`);
    return invoice;
  }
}
