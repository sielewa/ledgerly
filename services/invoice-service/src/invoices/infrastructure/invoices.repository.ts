import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { sql } from '@ledgerly/common';
import type { Invoice } from '../domain/invoice.interface';
import type { InvoiceStatus } from '../domain/invoice-state.types';
import type { InvoiceRow } from './invoice-row.interface';
import { toInvoice } from './invoice-row.mapper';
import { INVOICE_COLUMNS } from './invoices.constants';

/**
 * All SQL of the invoices table. Every method takes the transaction's EntityManager: the APPLICATION layer decides
 * the transaction boundary (status change + outbox event + inbox row must commit together).
 */
@Injectable()
export class InvoicesRepository {
  async insert(m: EntityManager, invoice: Omit<Invoice, 'id' | 'status'>): Promise<Invoice> {
    const { rows } = await sql<InvoiceRow>(
      m,
      `INSERT INTO invoices (payer_account_id, payee_name, payee_iban, amount_minor, currency)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${INVOICE_COLUMNS}`,
      [
        invoice.payerAccountId,
        invoice.payeeName,
        invoice.payeeIban,
        invoice.amountMinor,
        invoice.currency,
      ],
    );
    return toInvoice(rows[0]!);
  }

  async findById(m: EntityManager, id: string): Promise<Invoice | undefined> {
    const { rows } = await sql<InvoiceRow>(
      m,
      `SELECT ${INVOICE_COLUMNS} FROM invoices WHERE id = $1`,
      [id],
    );
    return rows[0] && toInvoice(rows[0]);
  }

  /** Optionally only one payer's invoices (uses invoices_payer_account_id_idx). */
  async listNewestFirst(
    m: EntityManager,
    limit: number,
    payerAccountId?: string,
  ): Promise<Invoice[]> {
    const { rows } = await sql<InvoiceRow>(
      m,
      `SELECT ${INVOICE_COLUMNS} FROM invoices
       WHERE ($2::uuid IS NULL OR payer_account_id = $2::uuid)
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit, payerAccountId ?? null],
    );
    return rows.map(toInvoice);
  }

  /**
   * Compare-and-set: only succeeds if the status is still the one we read (optimistic concurrency, the status acts
   * as the version; no FOR UPDATE on the read). Returns undefined if someone changed it in between.
   */
  async updateStatus(
    m: EntityManager,
    invoice: Invoice,
    next: InvoiceStatus,
  ): Promise<Invoice | undefined> {
    const { rows } = await sql<InvoiceRow>(
      m,
      `UPDATE invoices SET status = $3, updated_at = now()
       WHERE id = $1 AND status = $2
       RETURNING ${INVOICE_COLUMNS}`,
      [invoice.id, invoice.status, next],
    );
    return rows[0] && toInvoice(rows[0]);
  }
}
