import { Controller, Get, Inject, OnModuleInit, Param } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { ledgerV1 } from '@ledgerly/proto';
import { LEDGER_GRPC } from '../grpc/grpc-clients.constants';

@Controller('accounts')
export class AccountsController implements OnModuleInit {
  private ledger!: ledgerV1.LedgerServiceClient;

  constructor(@Inject(LEDGER_GRPC) private readonly client: ClientGrpc) {}

  onModuleInit(): void {
    this.ledger = this.client.getService<ledgerV1.LedgerServiceClient>(
      ledgerV1.LEDGER_SERVICE_NAME,
    );
  }

  @Get(':id/balance')
  getBalance(@Param('id') id: string) {
    return firstValueFrom(this.ledger.getBalance({ accountId: id }));
  }
}
