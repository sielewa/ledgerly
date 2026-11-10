import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSource } from './database/data-source';
import { MessagingModule } from './messaging/messaging.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [TypeOrmModule.forRoot(dataSource.options), MessagingModule, PaymentsModule],
})
export class AppModule {}
