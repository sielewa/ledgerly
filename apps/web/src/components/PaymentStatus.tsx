import { useQuery } from '@tanstack/react-query';
import { api, type PaymentStatus as Status } from '../api';

const FINAL: Status[] = ['COMPLETED', 'FAILED'];

/** Polls one payment until it reaches a final state, then stops polling. */
export function PaymentStatus({ paymentId }: { paymentId: string }) {
  const { data, error } = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => api.payment(paymentId),
    // A function: decide after every fetch. Returning false stops the polling.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && FINAL.includes(status) ? false : 1000;
    },
  });

  if (error) return <span className="error">{error.message}</span>;
  if (!data) return <span className="muted">payment…</span>;

  return (
    <span className="payment">
      payment <span className={`badge badge-${data.status.toLowerCase()}`}>{data.status}</span>
      {data.failureReason && <span className="muted"> {shortReason(data.failureReason)}</span>}
    </span>
  );
}

function shortReason(reason: string): string {
  if (reason.includes('insufficient funds')) return 'insufficient funds';
  return reason.length > 60 ? `${reason.slice(0, 60)}…` : reason;
}
