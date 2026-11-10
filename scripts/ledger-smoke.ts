// Smoke test: can we reach ledger-service over gRPC at all?
import type { ServiceError } from '@grpc/grpc-js';
import { codeName, createLedgerClient } from './lib/ledger-client.ts';

const ledger = createLedgerClient();
try {
  const res = await ledger.getBalance({ accountId: '00000000-0000-0000-0000-000000000000' });
  console.log('GetBalance ->', res);
} catch (err) {
  const e = err as ServiceError;
  console.log(`GetBalance -> ${codeName(e.code)}: ${e.details}`);
} finally {
  ledger.close();
}
