import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSource } from './database/data-source';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [TypeOrmModule.forRoot(dataSource.options), LedgerModule],
})
export class AppModule {}
