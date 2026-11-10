import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSource } from './database/data-source';
import { InvoicesModule } from './invoices/invoices.module';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [TypeOrmModule.forRoot(dataSource.options), MessagingModule, InvoicesModule],
})
export class AppModule {}
