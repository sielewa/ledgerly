import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { GrpcClientsModule } from './grpc/grpc-clients.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';

// A BFF: no business logic and no database, so feature modules hold only controllers that translate the public
// REST API to internal gRPC calls (and gRPC errors back to HTTP, see shared/grpc-to-http.filter.ts).
@Module({
  imports: [GrpcClientsModule, InvoicesModule, PaymentsModule, AccountsModule],
})
export class AppModule {}
