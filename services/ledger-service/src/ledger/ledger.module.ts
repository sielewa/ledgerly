import { Module } from '@nestjs/common';
import { LedgerGrpcController } from './api/ledger.grpc-controller';
import { LedgerService } from './application/ledger.service';
import { LedgerRepository } from './infrastructure/ledger.repository';

@Module({
  controllers: [LedgerGrpcController],
  providers: [LedgerService, LedgerRepository],
})
export class LedgerModule {}
