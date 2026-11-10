import { AccountCard } from './components/AccountCard';
import { CreateInvoiceForm } from './components/CreateInvoiceForm';
import { InvoiceTable } from './components/InvoiceTable';

const accountId = import.meta.env.VITE_DEMO_ACCOUNT_ID as string | undefined;

export function App() {
  if (!accountId) {
    return (
      <main className="page">
        <h1>Ledgerly</h1>
        <p className="notice">
          No demo account yet. With the services running, run <code>pnpm seed</code> and restart the
          dev server.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-header">
        <h1>Ledgerly</h1>
        <p className="muted">
          Invoices paid through a ledger hold and an unreliable bank. Statuses update live
          (polling).
        </p>
      </header>
      <AccountCard accountId={accountId} />
      <CreateInvoiceForm accountId={accountId} />
      <InvoiceTable accountId={accountId} />
    </main>
  );
}
