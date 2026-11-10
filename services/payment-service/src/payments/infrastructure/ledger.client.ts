import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ledgerV1 } from '@ledgerly/proto';
import { LEDGER_GRPC } from './grpc-clients.constants';

/** ledger-service over gRPC, as promises. Every call takes the caller's idempotency key. */
@Injectable()
export class LedgerClient implements OnModuleInit {
  private ledger!: ledgerV1.LedgerServiceClient;

  constructor(@Inject(LEDGER_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.ledger = this.client.getService<ledgerV1.LedgerServiceClient>(
      ledgerV1.LEDGER_SERVICE_NAME,
    );
  }

  async placeHold(
    idempotencyKey: string,
    accountId: string,
    amountMinor: string,
    currency: string,
  ): Promise<string> {
    const res = await firstValueFrom(
      this.ledger.placeHold({ idempotencyKey, accountId, amount: { amountMinor, currency } }),
    );
    return res.holdId;
  }

  async captureHold(idempotencyKey: string, holdId: string): Promise<void> {
    await firstValueFrom(this.ledger.captureHold({ idempotencyKey, holdId }));
  }

  async releaseHold(idempotencyKey: string, holdId: string): Promise<void> {
    await firstValueFrom(this.ledger.releaseHold({ idempotencyKey, holdId }));
  }
}
