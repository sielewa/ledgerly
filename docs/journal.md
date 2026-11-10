# Ledgerly — learning journal

## Stage 0 — Skeleton (monorepo, contracts, local infra)

**Problem (EN name):** Leaky service boundaries — "database per service" that exists only by convention.
Side quest: floating promises (fire-and-forget async calls).

**How I reproduced it:**

- `scripts/check-db-isolation.sh` (20 checks: 4 service users × own DB connect, own DB create table,
  3 × rejected from foreign DB). Before the init script: 0/20 — and the "rejected" checks deliberately
  failed too, because the test requires the specific error `permission denied for database`,
  not just "any connection error" (a non-existent user also can't connect — that would be a false pass).
- In Postgres every new database grants `CONNECT` and `TEMPORARY` to `PUBLIC` by default
  (`\l` shows `=Tc/...`), so without an explicit `REVOKE` any service user could open any other
  service's database.
- Floating promise demo: a handler calls `publishEvent()` without `await` → `tsc` reports no errors,
  the handler returns `"ok"`, then the rejected promise kills the Node process
  (`unhandledRejection`). ESLint `no-floating-promises` caught it before running.

**Root cause:**

- Postgres defaults are permissive: `PUBLIC` can connect to every new database.
- The `postgres` Docker image runs `/docker-entrypoint-initdb.d/*` only when the data volume is empty —
  editing the init script without `pnpm infra:reset` silently does nothing (log: `ignoring /docker-entrypoint-initdb.d/*`).
- A floating promise is valid TypeScript — the compiler can't see that nobody handles the result.

**Fix:**

- `infra/postgres/init/01-databases.sql`: one login role per service, `CREATE DATABASE ... OWNER <svc>`,
  `REVOKE ALL ON DATABASE ... FROM PUBLIC` → 20/20.
- Contracts in a shared `@ledgerly/proto` package (Buf + ts-proto), versioned proto packages (`ledgerly.common.v1`),
  `int64` mapped to `string` in TS (never JS `number` for money).
- Type-aware ESLint with `no-floating-promises` and `no-misused-promises`.

**Trade-offs:**

- One Postgres instance with separate DBs is cheap, but not full isolation: catalogs (DB and role names) are
  cluster-wide and resources (CPU, connections) are shared — a noisy neighbour can hurt others.
  Full isolation = separate instances (more cost and ops).
- Monorepo makes contract changes easy (one PR), but also makes coupling easy — needs explicit rules
  (no cross-service imports, shared code only for contracts/infra). Deployments stay independent, so
  contract changes must still be backward compatible.
- Generated proto code is not committed: `.proto` is the single source of truth, but PR diffs don't show
  generated changes.

**Gotchas from the setup (not on the problem list, but real):**

- Apple M4: `gcloud` in the emulator image crashes with `SIGILL` (exit 132) and no logs — my first hypothesis
  (JVM) was wrong; bisecting showed `gcloud --version` itself crashes. Fix: call the emulator launcher directly.
- `pnpm add typescript` installed TS 7 (native Go compiler), but Nest CLI requires `~6.0` and typescript-eslint `<6.1` → pinned 6.0.
- pnpm 12 blocks dependency `postinstall` scripts by default (supply-chain protection) and requires an explicit
  decision (`allowBuilds` in `pnpm-workspace.yaml`).
- NestJS deserializes gRPC with `@grpc/proto-loader` at runtime, independently of ts-proto types — options
  (`longs: String`, `enums: String`) must match `forceLong=string`, `stringEnums=true`.

**Interview version (EN, 3–4 sentences):**
"Database per service only works if it's enforced, not just agreed on — so each service gets its own
Postgres role that physically can't connect to another service's database; in Postgres that means revoking
the default CONNECT privilege from PUBLIC. Contracts live in a shared, versioned proto package, but since
services deploy independently, every contract change still has to be backward compatible. I also enforce
`no-floating-promises` in lint, because an un-awaited async call compiles fine but lets a request succeed
while its side effect silently fails."

## Stage 1 — ledger-service (double-entry, holds, Problem 4)

**Problem (EN name):** Race condition / double spend — a check-then-act (TOCTOU) bug in `PlaceHold`
(write skew across concurrent transactions).

**How I reproduced it:**

- `scripts/race-place-hold.ts`: open an account, deposit 100 PLN, fire 50 parallel `PlaceHold` of 10 PLN
  (`Promise.allSettled`), then run reconciliation SQL.
- Naive version: **18 holds succeeded** (max 10 possible) → `held 180.00 | available -80.00`, reconciliation
  FAIL "customer accounts with negative available balance". Stable 18 on every run; with 40 PLN holds: 10 instead of 2,
  available -300.
- Why exactly 18 / 10: the pg pool has 10 connections, so the first 10 transactions all read the same balance before
  anyone commits. Pool size limits the damage but never prevents it — more pool slots or more Cloud Run instances
  make it worse.
- Every single transaction was internally correct (entries balanced, cached `held` = sum of active holds) —
  only the cross-transaction business rule "available >= 0" broke.

**Root cause:** In READ COMMITTED (Postgres default) a plain `SELECT` takes no lock and sees the last committed
state. All concurrent requests read `available = 100`, all passed the funds check, then each incremented
`held_minor` (the increment itself is atomic, the decision based on the stale read is not).

**Fix:**

- `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE` in `PlaceHold` (pessimistic row lock, held until COMMIT/ROLLBACK):
  concurrent holds on the same account run one at a time, and each re-reads the latest balance.
  Result: exactly 10 holds, available 0.00, reconciliation OK — also with 200 parallel calls.
- Defense in depth: `CHECK (type = 'SYSTEM' OR balance_minor - held_minor >= 0)` on `accounts`, so no code path
  (other method, future bug, manual SQL) can write a negative available balance.
- Added as two migrations: `ADD CONSTRAINT ... NOT VALID` (brief ACCESS EXCLUSIVE, no scan, enforced for new writes)
  then `VALIDATE CONSTRAINT` (scan under SHARE UPDATE EXCLUSIVE, doesn't block reads/writes), with
  `migrationsTransactionMode: 'each'` — TypeORM's default runs all pending migrations in ONE transaction, which would
  keep the ACCESS EXCLUSIVE lock during the scan. Demonstrated on the dirty DB: step 1 passed, step 2 failed on the old
  -80 PLN rows, and those rows became "frozen" (even `UPDATE ... SET updated_at` was rejected).
- Every mutation is idempotent per caller key: `idempotency_keys (operation, key)` + request hash + stored response,
  written in the same DB transaction as the operation.

**Trade-offs:**

- Pessimistic locking serializes writes per account: fine for one customer, but a hot row (e.g. `bank_clearing`,
  touched by every deposit/capture) becomes a throughput bottleneck. Locks must be taken in a consistent order
  (we sort legs by account id) to avoid deadlocks, and transactions must stay short (never call external APIs inside).
- Optimistic locking (version column, retry on 0 rows updated) avoids waiting but under high contention most
  attempts fail and retry. Good for low contention / long "think time" (forms, HTTP If-Match).
- Alternative for this exact case: one atomic conditional update
  `UPDATE accounts SET held_minor = held_minor + $2 WHERE id = $1 AND balance_minor - held_minor >= $2` (0 rows = insufficient funds).
- Isolation levels: Postgres REPEATABLE READ would turn the naive race into `40001 could not serialize` errors
  (needs app-level retry); MySQL InnoDB REPEATABLE READ (its default) would NOT — plain SELECT reads a snapshot,
  UPDATE reads the latest row and silently proceeds, so the same bug happens there. SERIALIZABLE in Postgres (SSI)
  also catches write skew, at the cost of retries.
- Failed operations are not remembered by the idempotency table (rollback removes the key) — a retry after a deposit
  can succeed. Stripe stores error responses too; both are valid if documented.

**Bugs I made on the way (and what caught them):**

- `SELECT ... FOR UPDATE FROM ...` (wrong clause position) → TypeScript was happy, every call failed with `UNKNOWN`.
- Added a `forUpdate` option but didn't pass it → compiled, looked fixed, the race script still showed 18 holds.
- `ReleaseHold` used the `'CaptureHold'` idempotency namespace (copy-paste); both requests have identical fields, so a
  release reusing the capture key silently returned the cached capture response (OK, nothing released). Regression test added.

**Interview version (EN, 3–4 sentences):**
"Our PlaceHold had a check-then-act race: under READ COMMITTED a plain SELECT takes no lock, so fifty concurrent
requests all saw 100 PLN available and eighteen holds of 10 PLN were approved. I fixed it with SELECT … FOR UPDATE on
the account row, so holds on one account are serialized and each sees the latest balance, and I added a CHECK
constraint so the database itself rejects a negative available balance, whatever code path writes it. I added the
constraint as NOT VALID first and validated it separately, so it never locks a large table while scanning it."

## Stage 2 — gateway + invoice-service (duplicate submission, Idempotency-Key)

**Problem (EN name):** Duplicate submission — POST is not idempotent, so a double click or a retry after a lost
response (timeout = unknown outcome) creates a second invoice.

**How I reproduced it:** `scripts/double-submit-invoice.ts` against gateway (REST) → invoice-service (gRPC).
Naive version, 4 runs, same result every time:

- double click (2 parallel identical POSTs): HTTP 201, 201 → **2 invoices** (expected 1)
- retry after a "lost" response: HTTP 201 → **2 invoices** (expected 1)
  The client gets 201 both times, so nothing looks wrong on its side.

**Root cause:** nothing in the request ties the second POST to the first one. Same body ≠ same intent, and the server
had no way to tell "the same request again" from "a new invoice with the same data".

**Fix:**

- The CLIENT generates an `Idempotency-Key` once per user intent (per opened form) and resends it on every retry.
  Only the client knows two requests are the same intent; the gateway sees two unrelated HTTP calls.
- Gateway requires the header (400 if missing) and forwards it; it stays stateless (no Redis, no in-memory map).
- `CreateInvoiceRequest.idempotency_key = 5` — new field number, an additive (backward-compatible) proto change.
- invoice-service stores `(operation, key, request_hash, response)` in `idempotency_keys` in the SAME transaction as
  the INSERT into `invoices`. Retry → stored response; concurrent duplicate waits on the primary key, then replays;
  same key + different body → 400 (client bug).
- After: double click → 1 invoice (same id), retry → 1, two forms with identical data → 2 (legitimate),
  no key → 400 and 0 invoices, key reused with a different body → 400.

**Trade-offs:**

- Required header = breaking change of the public API (OK, the API is new). Optional (Stripe) = compatible, but
  clients that forget it are silently unprotected. The proto change itself is additive; compatibility is per contract.
- The key must not be a hash of the body, and `UNIQUE(payee, amount, iban)` would be wrong: two identical invoices on
  purpose are valid. The body hash only detects key reuse for a different request.
- Storing the key in the service DB (same transaction) vs Redis in the gateway: Redis = dual write between two stores,
  needs an atomic SET NX claim for concurrent requests, and can be evicted.
- Replay returns a snapshot (status DRAFT even if the invoice is ISSUED now). By design, like Stripe; the client uses
  GET for current state. Could add an `Idempotent-Replayed: true` header.

**Review findings on my own fix (known debt):**

- 🔴 Keys are global, not per tenant: two clients using the same key with the same body → the second gets the first's
  invoice (cross-tenant data leak) and its own invoice is silently never created. Fix: `PRIMARY KEY (tenant_id,
operation, key)` with tenant from the verified JWT, never from the body. Waiting for auth.
- 🟠 No retention: 500k ops/day ≈ 180M rows ≈ 200 GB/year. TTL (24h–7 days) must exceed the longest client retry
  horizon and is part of the API contract; clean up in batches (index on `created_at`) or drop daily partitions.
- 🟡 No length/format limit on the key (goes into a PK index and logs) → validate in the gateway (e.g. ≤ 255 chars).

**Also on the way:**

- State machine as a transition table (`Record<Status, Partial<Record<Event, Status>>>`) + compare-and-set UPDATE
  (`WHERE id = $1 AND status = $2`, 0 rows → ABORTED) — optimistic concurrency with status as the version.
- gRPC → HTTP error mapping in one filter (INVALID_ARGUMENT 400, NOT_FOUND 404, FAILED_PRECONDITION/ABORTED/
  ALREADY_EXISTS 409, UNAVAILABLE 503, ...); 5xx hides internal details.
- Monorepo gotcha: adding `@nestjs/platform-express` to one package made pnpm create a second `@nestjs/core` variant →
  "Nest can't resolve dependencies of the TypeOrmCoreModule". Duplicate package instances break DI / `instanceof`.
- After `pnpm proto:gen` the proto package must be rebuilt, otherwise services compile against stale types.

**Interview version (EN, 3–4 sentences):**
"Creating an invoice is a POST, which isn't idempotent, so a double click or a retry after a timeout created a
duplicate — I reproduced two invoices from one user action. The client now generates an Idempotency-Key once per user
intent and resends it on retries; the gateway forwards it, and the invoice service stores the key, a request hash and
the response in the same database transaction as the invoice, so a retry gets the original response instead of a new
invoice. In production I'd scope keys to the authenticated tenant and expire them after a documented retention window."

## Stage 3 — events, transactional outbox, inbox (Problems 1 and 2)

**Problem (EN name):**

1. Dual write → lost event (and its mirror image, the ghost event).
2. Duplicate delivery: at-least-once delivery means the same event arrives more than once.

**How I reproduced it:**

- `scripts/lost-event.ts` with `CRASH_AFTER_COMMIT=true`: `POST /issue` → 503, the invoice is ISSUED in the DB, **0
  notifications**. After a restart the client retried `issue`: HTTP 200 (natural idempotency, already ISSUED), still
  **0 notifications**, so the event was lost forever. In normal mode: 1 notification.
- `scripts/duplicate-delivery.ts` with `CRASH_AFTER_PUBLISH=true`: the relay publishes the batch and dies before marking
  it published. After the restart it publishes the same `event_id` again and the naive consumer creates **2 notifications**.

**Root cause:**

1. The DB commit and `pubsub.publish()` are two writes to two systems with no shared transaction. Commit → publish
   loses the event on a crash in between. Publish → commit sends an event about a change that may roll back (ghost event).
2. Every step that retries until success (relay, Pub/Sub redelivery after a missed ack) is at-least-once.
   Exactly-once end-to-end isn't available, so duplicates are normal, not a bug in the broker.

**Fix:**

1. **Transactional outbox:** the event is inserted into `outbox` in the same transaction as the status change, after
   validation with the consumer's zod schema. `OutboxRelay` (one loop per instance, `await` + sleep instead of setInterval)
   runs `SELECT … ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`, publishes the rows, sets `published_at` and commits.
   - After a crash the event waits in the outbox and goes out after restart without any client retry (0 → 1).
   - Two instances and 300 events: a 146/154 split, 300 notifications, 0 duplicates.
2. **Inbox (idempotent consumer, my code):** `processed_events(event_id PRIMARY KEY)`, inserted with
   `ON CONFLICT DO NOTHING` in the same transaction as the notification. A conflict means a duplicate: it is logged as
   a duplicate and acked, not nacked. The ack happens only after commit. Result: 2 → 1 notification.

**Trade-offs:**

- **Outbox:**
  - It is at-least-once, not exactly-once. Effectively-once = at-least-once + idempotent consumer.
  - The relay publishes inside an open transaction (row locks held until COMMIT), so batches must be small and the
    publish needs a timeout.
  - SKIP LOCKED gives throughput but breaks per-entity ordering across instances. The fix is ordering keys plus a
    state machine on the consumer (Stage 6).
  - Polling vs CDC (Debezium reading the WAL).
  - The relay inside the service process vs a separate worker. A loop in the background "sleeps" on Cloud Run
    (problem 13).
- **Inbox:**
  - A separate table vs `UNIQUE` on the side-effect table. The inbox is generic: one event can cause several side
    effects, or none.
  - It only fully protects side effects in the same DB. For an external side effect (a real email API), use the
    provider's idempotency key with `event_id`, or accept a rare duplicate.
- **Retention:** `outbox` and `processed_events` grow forever without cleanup. The inbox window must exceed the longest
  redelivery or replay (subscription retention up to 31 days, relay catch-up after downtime, manual DLT replay).

**Incidents on the way:**

- **Contract mismatch.** The producer and Postgres accept any 8-4-4-4-12 hex UUID; zod 4 `z.uuid()` is strict
  RFC 9562 and rejected the test account `1111…`. The event was committed and published but the consumer couldn't
  accept it. Changed to `z.guid()`, and the producer now validates with the same schema before inserting into the outbox.
- **Poison message.** The consumer nacked the bad message and Pub/Sub redelivered it immediately: 139 attempts in a few
  seconds. Fix (Stage 8): max delivery attempts + dead-letter topic + retry backoff. After fixing the schema the same
  message was processed: nothing was lost, because nothing was acked.
- **First publish slow.** The first publish after process start waits a few seconds for the GCP metadata-server lookup
  (`MetadataLookupWarning`), so the repro scripts need to wait longer than one relay tick.

**Interview version (EN, 3–4 sentences):**
"Writing to the database and then publishing to Pub/Sub is a dual write: when I killed the process between the two,
the invoice was issued but the event was lost for good — even a client retry didn't help. I fixed it with a
transactional outbox: the event is stored in the same transaction as the state change, and a relay publishes pending
rows using FOR UPDATE SKIP LOCKED so several instances can share the work. That makes delivery at-least-once, so I
reproduced a duplicate by crashing the relay after publishing, and made the consumer idempotent with an inbox table
keyed by event id, written in the same transaction as the side effect — at-least-once plus idempotency gives
effectively-once."

## Stage 4 — bank-simulator (an unreliable external system) + webhook signatures

**Problem (EN name):** integrating with an unreliable external payment API. Asynchronous processing (202 Accepted +
webhooks), a timeout with an unknown outcome, and forged or replayed webhooks.

**How I reproduced it:** `scripts/bank-smoke.ts`.

- Repeated reference → 200 with the same transfer.
- Same reference with a different amount → 409.
- An IBAN starting with `XX` → `transfer.rejected`.
- Webhooks pending → settled/rejected, each with `bank-signature: t=…,v1=…`.
- With `TIMEOUT_RATE=1`: the client times out (curl exit 28), yet `GET /transfers/:reference` shows the transfer
  stored as PENDING, and it settles later. The response was lost, not the money.

**Root cause:** a call across a network to a system we don't control. The response can be lost after the work is done,
and the callback endpoint is public, so anyone who knows the URL can call it.

**Fix (the parts in this stage):**

- The bank is idempotent by the client's `reference` (our payment id), so retrying with the same reference is safe and
  `GET /transfers/:reference` can reconcile.
- Rule for Stage 5: a timeout is an unknown outcome, never a failure. Never release the hold on a timeout; move to
  BANK_UNKNOWN and ask the bank.
- `verifyBankSignature` (my code):
  - recomputes `HMAC-SHA256(secret, "<t>.<rawBody>")`, using the timestamp string exactly as received;
  - accepts a ±5 min window (replay protection);
  - compares in constant time (`timingSafeEqual`, length checked first, because it throws on a length mismatch);
  - returns `false` and never throws for any malformed header.

**Trade-offs:**

- **Signature ≠ deduplication.** A retried or duplicated webhook carries a valid, fresh signature. The inbox (by event id)
  handles duplicates.
- **Raw body.** It has to be the raw body: re-serialized JSON breaks the signature (whitespace, key order). In Nest this
  means enabling `rawBody`.
- **Strict header parsing.** Exactly `t,v1` is simple but breaks secret rotation (Stripe sends `v1=<old>,v1=<new>`
  during a rotation window). Rotation = accept a signature from either secret for a while.
- **Bank simulator design.** Plain `node:http` + `Map` on purpose: it imitates someone else's system. Its chaos switches
  feed Stage 5.

**On the way:** TypeScript 6 defaults `types` to `[]`, so a package with no dependencies doesn't see `@types/node`; I
added it explicitly. `Buffer.from(x, 'hex')` silently drops non-hex characters instead of throwing.

**Interview version (EN, 3–4 sentences):**
"Payments with a bank are asynchronous: the transfer is accepted with a 202 and the final status arrives by webhook, so
a timeout on the request means an unknown outcome — we query the bank by our idempotent reference instead of assuming
failure. Webhooks hit a public endpoint, so we verify an HMAC signature over the timestamp and the raw body, reject
anything outside a five-minute window to stop replays, and compare signatures in constant time. A valid signature only
proves who sent it — duplicates are still handled by deduplicating on the event id."

## Stage 5 — payment saga (Problems 3, 5, 10)

**Problem (EN name):**

1. Treating an unknown outcome (timeout) as a failure.
2. Partial failure without a compensating action.
3. Stuck saga.
4. Bonus: a race between two channels (webhook vs our own HTTP response) with state-unaware handlers.

**How I reproduced it:** `scripts/payment-saga.ts`. Three accounts with 1000 PLN each. For each one I compare the
payment status, the bank transfer status and the ledger.

- **Rejected (IBAN `XX…`):** FAILED / REJECTED / **held 123.00 forever**. Nobody called ReleaseHold.
- **Timeout (IBAN `TT…`, webhook slower than our 3 s timeout):** FAILED / **SETTLED** / balance 1000.00, held 0.
  - The bank paid 123 PLN, the customer was never charged, Ledgerly is −123.
  - The `settled` webhook got 5× HTTP 500 (CaptureHold on a released hold) and the bank gave up.
- **Fast webhook:** `settled` arrived before the response to our own POST, so the webhook captured and set COMPLETED.
  Then the timeout path tried to release a captured hold, and the client got a 500 for a successful payment.
- **`scripts/stuck-saga.ts` with `CRASH_AFTER_BANK_CALL`:** the process dies after the bank accepted the transfer. The
  bank gives up on the webhooks. After a restart the payment is FUNDS_HELD forever while the bank says SETTLED.

**Root cause:** a saga spans three systems with no shared transaction, so every step can be left half-done.

- The naive code made money decisions without knowing the outcome: `catch (any error) → ReleaseHold`.
- It forgot to undo step 1 when step 2 failed.
- Webhook and request handlers ignored the current saga state, so they overwrote each other.
- Nothing ever revisited a saga whose signal was lost.

**Fix:**

- **Durable saga state:** the `payments` row records each step.
- **Deterministic idempotency keys:** `payment:<id>:<step>` for every ledger call, and the payment id as the bank
  `reference`. After a crash the same key is recomputed, so retries and compensation are safe.
- **Timeouts:** a timeout, network error or 5xx goes to **BANK_UNKNOWN**. Only a definite 4xx compensates immediately.
- **One decision table**, `decide(our status, bank status)` → CAPTURE / COMPENSATE / RESEND / WAIT / IGNORE / ALERT,
  designed by me (5 cells fixed in review). It is used by both webhooks and the sweeper, so they can't disagree.
- **Webhooks are notifications** (my idea): on a webhook we `GET /transfers/:reference` and act on the current state.
  Duplicate and reordered webhooks become harmless.
- **Compensation** saves COMPENSATING _before_ ReleaseHold, so a crash is finished later with the same key.
- **Compare-and-set** for every status change (`WHERE status = <read status>`): the loser of a race skips.
- **Sweeper (`POST /sweep`):** non-final sagas untouched for N seconds are reconciled with the bank.

**After:**

| Scenario | Result                        |
| -------- | ----------------------------- |
| happy    | COMPLETED / SETTLED / 877.00  |
| rejected | FAILED / REJECTED / held 0.00 |
| timeout  | COMPLETED / SETTLED / 877.00  |

- The same holds with every webhook duplicated and reordered. Log: `ours COMPLETED, bank SETTLED -> IGNORE` and
  `ours FUNDS_HELD, bank SETTLED -> CAPTURE`.
- Stuck saga: FUNDS_HELD / SETTLED / held 123 → `/sweep` → COMPLETED / 877.00.

**Trade-offs:**

- **Orchestration vs choreography.** A central orchestrator with durable state is easy to reason about, debug and
  compensate. Choreography (services reacting to each other's events) has no single point of control, but the flow is
  spread across services and is hard to see, change and compensate. I'd use choreography for simple, loosely coupled
  reactions (send a notification when an invoice is issued), and orchestration for money flows with compensation.
- **Fetch-on-notify** costs an extra call per webhook and depends on the bank's status API.
- **SENT_TO_BANK + NOT_FOUND → ALERT, not RESEND:** when the bank contradicts its own confirmation, an automatic resend
  could pay twice. Some cells mean "a human must look".
- **Ledger calls happen outside a DB transaction;** consistency comes from idempotency + compare-and-set + reconciliation,
  not from locks held across network calls.
- **Not done (theory):**
  - The gateway → gRPC StartPayment path.
  - `payment.*` events through the outbox to invoice-service (PAYMENT_PENDING → PAID / back to ISSUED).
  - Sweeping STARTED sagas.
  - A partial index for the sweeper query.
  - Alerting.

**Incidents on the way:** undici `fetch` to a refused port crashed the whole bank process (`setTypeOfService EINVAL`,
thrown from a socket handler, so try/catch can't catch it). Webhook delivery was moved to `node:http`. The in-memory
bank forgot a transfer; the sweeper later fixed it with `FUNDS_HELD + NOT_FOUND → RESEND`.

**Interview version (EN, 3–4 sentences):**
"Paying an invoice is an orchestrated saga: place a hold in the ledger, send a transfer to the bank, then capture or
release the hold, with the saga state persisted after every step and a deterministic idempotency key per step. The
naive version treated a bank timeout as a failure and released the hold — the bank paid anyway, so we lost the money —
and it forgot to release the hold when the bank rejected the transfer. I fixed it by moving timeouts to an UNKNOWN
state and making one decision table, keyed by our status and the bank's status, the only place that acts; webhooks
just trigger a status query, and a sweeper reconciles sagas that got stuck after a crash."

## Stage 7 — web panel + payment events (eventual consistency)

**What I built:**

- **The full "pay an invoice" path:** the web panel → gateway (`POST /invoices/:id/pay`, Idempotency-Key) →
  payment-service `StartPayment` over gRPC.
  - payment-service reads the invoice itself (amount, payer, payee). The client only says _which_ invoice.
  - The saga runs, then `payment.started / completed / failed` go through payment-service's outbox to Pub/Sub, and
    invoice-service moves the invoice `ISSUED → PAYMENT_PENDING → PAID` (or back to `ISSUED`).
  - Events are published with the invoice id as **ordering key** on an ordered subscription.
  - invoice-service has its own inbox.
- **The panel:** React + TanStack Query.
  - `useQuery` + `refetchInterval` for live statuses.
  - The payment status component stops polling at a final state.
  - Mutations are never auto-retried; idempotency keys are created once per intent: per opened form, per "Pay" click.

**Problems met:**

- **Paying the same invoice twice.** An idempotency key only covers a retry of the _same_ click. Two tabs = two keys =
  two payments. Fix: a partial unique index `payments (invoice_id) WHERE status <> 'FAILED'`. Two parallel pays with
  different keys → one 202, one 409, 1 payment row. A FAILED payment doesn't block paying again.
- **Eventual consistency in the UI.** The payment is COMPLETED a moment before the invoice shows PAID, because the
  invoice status arrives by event. The UI shows intermediate statuses and polls until a final one instead of pretending
  the update is synchronous.
- **Pub/Sub ordering gotcha.** With message ordering on, a failed publish _pauses_ that ordering key in the client
  until `resumePublishing(key)` is called. Without it, one network error would block an invoice's events forever.
- **Schema evolution.** A new NOT NULL rule (`payments.invoice_id`) on a table with old rows: added as
  `CHECK … NOT VALID`, enforced for new rows, old rows left as they are (same technique as in Stage 1).

**Interview version (EN):**
"The web panel only talks to the gateway. Paying an invoice starts the saga in payment-service, and the invoice
learns the outcome through events, so for a moment the payment is completed but the invoice still says pending — the
UI shows intermediate states and polls instead of pretending it's synchronous. Idempotency keys stop a double click,
but not two tabs, so the real guarantee is a partial unique index: one active payment per invoice."

**Found by clicking through the panel (after the refactor):**

- **The bug.** I paid an invoice whose payer account doesn't exist in the ledger (a test invoice; with a database per
  service, invoice-service can't check it with a foreign key). The payment was created (STARTED + `payment.started`,
  so the invoice became PAYMENT_PENDING), then `PlaceHold` answered NOT_FOUND. Step 1 only handled
  FAILED_PRECONDITION (insufficient funds), so the error just propagated. **The saga stayed STARTED forever**: nothing
  marked it FAILED, and the sweeper ignored STARTED. The invoice hung in PAYMENT_PENDING and couldn't be paid again
  (the unique index still saw an active payment).
- **Fix.** Ledger errors are classified:
  - permanent (FAILED_PRECONDITION, NOT_FOUND, INVALID_ARGUMENT) → FAILED with the reason, no compensation (no hold
    was placed), and `payment.failed` takes the invoice back to ISSUED;
  - transient (UNAVAILABLE, timeout) → stays STARTED, and the sweeper now also resumes STARTED sagas by retrying
    PlaceHold with the same deterministic key.
- **My own regression found on the way.** I had moved the sweeper's status list into a query parameter
  (`status = ANY($1)`). Postgres can use a partial index only if it can prove at planning time that the query matches
  the index's WHERE clause, which it can't do for a parameter. Fix: the list is part of the SQL text again, and a
  migration recreates the partial index including STARTED.
- **Lesson:** every saga state needs an owner for "what if we crash/fail here?". The one state nobody thought about
  is where payments get stuck.
- **The second bug, revealed by the first fix.** Now that a payment can fail immediately, `payment.started` and
  `payment.failed` were published in the same batch. Pub/Sub delivered them in order (ordering key = invoice id),
  but the Node client emits the next message without waiting for the async handler. Both were processed in the same
  millisecond:
  - `failed` read the invoice still ISSUED and skipped itself as "stale";
  - `started` then moved the invoice to PAYMENT_PENDING;
  - the invoice stayed there for good, since the inbox already marked `failed` as processed.

  **Ordering keys guarantee the order of delivery, not of processing.** Fix: the consumer chains messages with the
  same ordering key (different keys still run in parallel), and once one is nacked, the later ones with that key are
  nacked too, so a redelivery can't be overtaken. Checked by paying the same invoice 8 times: ISSUED after every
  attempt, and `started` / `failed` now processed a few milliseconds apart, in order.
