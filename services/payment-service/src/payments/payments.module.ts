import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PROTO_DIR, invoiceV1, ledgerV1 } from '@ledgerly/proto';
import { config } from '../config';
import { BankWebhookController } from './api/bank-webhook.controller';
import { OperationsController } from './api/operations.controller';
import { PaymentGrpcController } from './api/payment.grpc-controller';
import { PaymentSaga } from './application/payment-saga';
import { BankClient } from './infrastructure/bank.client';
import {
  GRPC_LOADER_OPTIONS,
  INVOICES_GRPC,
  LEDGER_GRPC,
} from './infrastructure/grpc-clients.constants';
import { InvoicesClient } from './infrastructure/invoices.client';
import { LedgerClient } from './infrastructure/ledger.client';
import { PaymentsRepository } from './infrastructure/payments.repository';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: LEDGER_GRPC,
        transport: Transport.GRPC,
        options: {
          package: ledgerV1.LEDGERLY_LEDGER_V1_PACKAGE_NAME,
          protoPath: join(PROTO_DIR, ledgerV1.protobufFileName),
          url: config.ledgerAddr,
          loader: GRPC_LOADER_OPTIONS,
        },
      },
      {
        name: INVOICES_GRPC,
        transport: Transport.GRPC,
        options: {
          package: invoiceV1.LEDGERLY_INVOICE_V1_PACKAGE_NAME,
          protoPath: join(PROTO_DIR, invoiceV1.protobufFileName),
          url: config.invoiceAddr,
          loader: GRPC_LOADER_OPTIONS,
        },
      },
    ]),
  ],
  controllers: [PaymentGrpcController, BankWebhookController, OperationsController],
  providers: [PaymentSaga, PaymentsRepository, LedgerClient, InvoicesClient, BankClient],
})
export class PaymentsModule {}
