import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PROTO_DIR, invoiceV1 } from '@ledgerly/proto';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: invoiceV1.LEDGERLY_INVOICE_V1_PACKAGE_NAME,
      protoPath: join(PROTO_DIR, invoiceV1.protobufFileName),
      url: `0.0.0.0:${config.grpcPort}`,
      // Must match ts-proto options in packages/proto/buf.gen.yaml (see ledger-service/src/main.ts).
      loader: { includeDirs: [PROTO_DIR], longs: String, enums: String, defaults: true },
    },
  });
  app.enableShutdownHooks();
  await app.listen();
  new Logger('Bootstrap').log(`invoice-service gRPC listening on :${config.grpcPort}`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
