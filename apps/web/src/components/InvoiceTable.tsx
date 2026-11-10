import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, formatMoney, type Invoice } from '../api';
import { PaymentStatus } from './PaymentStatus';

export function InvoiceTable({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  // invoiceId -> id of the payment started from this browser tab (to show its live status next to the invoice)
  const [payments, setPayments] = useState<Record<string, string>>({});

  // The invoice status is moved by payment.* EVENTS (outbox -> Pub/Sub -> invoice-service), so it lags behind the
  // payment for a moment: eventual consistency. Polling makes the UI catch up without a page reload.
  const invoices = useQuery({
    // Only the demo account's invoices: test data created by scripts (other payers) stays out of the panel.
    queryKey: ['invoices', accountId],
    queryFn: () => api.invoices(accountId),
    refetchInterval: 1500,
  });

  const issue = useMutation({
    mutationFn: (id: string) => api.issueInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const pay = useMutation({
    // The key is created ONCE per click and passed in as a variable, so if we ever retried this mutation
    // it would carry the same key: the gateway returns the same payment instead of starting a second one.
    mutationFn: ({ id, key }: { id: string; key: string }) => api.payInvoice(id, key),
    onSuccess: async (payment) => {
      setPayments((prev) => ({ ...prev, [payment.invoiceId]: payment.id }));
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  return (
    <section className="card">
      <h2>Invoices</h2>
      {invoices.isPending && <p className="muted">Loading…</p>}
      {invoices.error && <p className="error">{invoices.error.message}</p>}
      {pay.error && <p className="error">Payment: {pay.error.message}</p>}
      {issue.error && <p className="error">Issue: {issue.error.message}</p>}
      {invoices.data?.length === 0 && <p className="muted">No invoices yet.</p>}
      {invoices.data && invoices.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Payee</th>
                <th>IBAN</th>
                <th className="num">Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.data.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  paymentId={payments[invoice.id]}
                  busy={issue.isPending || pay.isPending}
                  onIssue={() => issue.mutate(invoice.id)}
                  onPay={() => pay.mutate({ id: invoice.id, key: crypto.randomUUID() })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function InvoiceRow(props: {
  invoice: Invoice;
  paymentId: string | undefined;
  busy: boolean;
  onIssue: () => void;
  onPay: () => void;
}) {
  const { invoice, paymentId } = props;
  return (
    <tr>
      <td>{invoice.payeeName}</td>
      <td className="mono">{invoice.payeeIban.slice(0, 6)}…</td>
      <td className="num">{formatMoney(invoice.amount)}</td>
      <td>
        <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
        {paymentId && (
          <div>
            <PaymentStatus paymentId={paymentId} />
          </div>
        )}
      </td>
      <td className="actions">
        {invoice.status === 'DRAFT' && (
          <button onClick={props.onIssue} disabled={props.busy}>
            Issue
          </button>
        )}
        {invoice.status === 'ISSUED' && (
          <button onClick={props.onPay} disabled={props.busy}>
            Pay
          </button>
        )}
      </td>
    </tr>
  );
}
