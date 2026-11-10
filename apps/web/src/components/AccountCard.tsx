import { useQuery } from '@tanstack/react-query';
import { api, formatMoney } from '../api';

export function AccountCard({ accountId }: { accountId: string }) {
  // queryKey identifies the data in the cache; refetchInterval polls it (the hold appears and disappears live).
  const { data, isPending, error } = useQuery({
    queryKey: ['balance', accountId],
    queryFn: () => api.balance(accountId),
    refetchInterval: 2000,
  });

  return (
    <section className="card">
      <h2>Demo account</h2>
      {isPending && <p className="muted">Loading…</p>}
      {error && <p className="error">{error.message}</p>}
      {data && (
        <dl className="balance">
          <div>
            <dt>Balance</dt>
            <dd>{formatMoney(data.balance)}</dd>
          </div>
          <div>
            <dt>Held</dt>
            <dd>{formatMoney(data.held)}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd className="strong">{formatMoney(data.available)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
