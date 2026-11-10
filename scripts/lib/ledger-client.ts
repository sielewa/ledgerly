// Minimal promise-based gRPC client for ledger-service, used by reproduction scripts.
// Uses the same .proto files and loader options as the service itself.
import { join } from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { PROTO_DIR, ledgerV1 } from '@ledgerly/proto';

const definition = protoLoader.loadSync(join(PROTO_DIR, ledgerV1.protobufFileName), {
  includeDirs: [PROTO_DIR],
  longs: String,
  enums: String,
  defaults: true,
});

const serviceName = `${ledgerV1.LEDGERLY_LEDGER_V1_PACKAGE_NAME}.${ledgerV1.LEDGER_SERVICE_NAME}`;

type UnaryMethod = (
  request: unknown,
  callback: (err: grpc.ServiceError | null, response: unknown) => void,
) => void;

export function createLedgerClient(address = process.env.LEDGER_ADDR ?? 'localhost:50051') {
  const Client = grpc.makeGenericClientConstructor(
    definition[serviceName] as grpc.ServiceDefinition,
    ledgerV1.LEDGER_SERVICE_NAME,
  );
  const client = new Client(address, grpc.credentials.createInsecure());

  const unary =
    <Req, Res>(method: string) =>
    (request: Req): Promise<Res> =>
      new Promise((resolve, reject) => {
        const fn = (client as unknown as Record<string, UnaryMethod>)[method];
        if (!fn) throw new Error(`Unknown method ${method}`);
        fn.call(client, request, (err, response) => (err ? reject(err) : resolve(response as Res)));
      });

  return {
    openAccount: unary<ledgerV1.OpenAccountRequest, ledgerV1.OpenAccountResponse>('OpenAccount'),
    postDeposit: unary<ledgerV1.PostDepositRequest, ledgerV1.PostDepositResponse>('PostDeposit'),
    getBalance: unary<ledgerV1.GetBalanceRequest, ledgerV1.GetBalanceResponse>('GetBalance'),
    placeHold: unary<ledgerV1.PlaceHoldRequest, ledgerV1.PlaceHoldResponse>('PlaceHold'),
    captureHold: unary<ledgerV1.CaptureHoldRequest, ledgerV1.CaptureHoldResponse>('CaptureHold'),
    releaseHold: unary<ledgerV1.ReleaseHoldRequest, ledgerV1.ReleaseHoldResponse>('ReleaseHold'),
    close: () => client.close(),
  };
}

// gRPC status code number -> name, for readable logs (e.g. 9 -> FAILED_PRECONDITION).
export const codeName = (code: number): string => grpc.status[code] ?? String(code);
