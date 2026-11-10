import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, toMinor } from '../api';

// The bank simulator reacts to the IBAN prefix, so the outcome of a payment can be chosen up front.
const IBAN_PRESETS = [
  { label: 'Bank accepts', iban: 'PL61109010140000071219812874' },
  { label: 'Bank rejects', iban: 'XX00000000000000000000' },
  { label: 'Bank times out', iban: 'TT61109010140000071219812874' },
];

export function CreateInvoiceForm({ accountId }: { accountId: string }) {
  const queryClient = useQueryClient();
  const [payeeName, setPayeeName] = useState('ACME sp. z o.o.');
  const [payeeIban, setPayeeIban] = useState(IBAN_PRESETS[0]!.iban);
  const [amount, setAmount] = useState('123.00');
  // One key per INTENT ("this form, this invoice"), created when the form is shown, NOT per request:
  // a double click or a retry sends the same key, so the gateway returns the first invoice instead of a second one.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const create = useMutation({
    mutationFn: (amountMinor: string) =>
      api.createInvoice(
        {
          payerAccountId: accountId,
          payeeName,
          payeeIban,
          amount: { amountMinor, currency: 'PLN' },
        },
        idempotencyKey,
      ),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID()); // the next invoice is a new intent
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const amountMinor = toMinor(amount);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (amountMinor) create.mutate(amountMinor);
  }

  return (
    <section className="card">
      <h2>New invoice</h2>
      <form className="form" onSubmit={submit}>
        <label>
          Payee
          <input value={payeeName} onChange={(e) => setPayeeName(e.target.value)} required />
        </label>
        <label>
          IBAN
          <input value={payeeIban} onChange={(e) => setPayeeIban(e.target.value)} required />
        </label>
        <div className="presets" role="group" aria-label="Bank behaviour">
          {IBAN_PRESETS.map((p) => (
            <button
              key={p.iban}
              type="button"
              className={p.iban === payeeIban ? 'chip active' : 'chip'}
              onClick={() => setPayeeIban(p.iban)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <label>
          Amount (PLN)
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            aria-invalid={!amountMinor}
          />
        </label>
        <button type="submit" disabled={!amountMinor || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create draft'}
        </button>
        {create.error && <p className="error">{create.error.message}</p>}
      </form>
    </section>
  );
}
