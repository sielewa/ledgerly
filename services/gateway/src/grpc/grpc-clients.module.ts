import { Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { invoiceV1, ledgerV1, paymentV1 } from '@ledgerly/proto';
import { config } from '../config';
import { grpcClient } from './grpc-client.factory';
import { INVOICE_GRPC, LEDGER_GRPC, PAYMENT_GRPC } from './grpc-clients.constants';

/** One gRPC client (one HTTP/2 connection) per downstream service, shared by every feature module. */
@Global()
@Module({
  imports: [
    ClientsModule.register([
      grpcClient(
        INVOICE_GRPC,
        invoiceV1.LEDGERLY_INVOICE_V1_PACKAGE_NAME,
        invoiceV1.protobufFileName,
        config.invoiceServiceAddr,
      ),
      grpcClient(
        PAYMENT_GRPC,
        paymentV1.LEDGERLY_PAYMENT_V1_PACKAGE_NAME,
        paymentV1.protobufFileName,
        config.paymentServiceAddr,
      ),
      grpcClient(
        LEDGER_GRPC,
        ledgerV1.LEDGERLY_LEDGER_V1_PACKAGE_NAME,
        ledgerV1.protobufFileName,
        config.ledgerServiceAddr,
      ),
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientsModule {}
