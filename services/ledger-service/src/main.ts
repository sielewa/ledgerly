import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PROTO_DIR, ledgerV1 } from '@ledgerly/proto';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.GRPC,
    options: {
      package: ledgerV1.LEDGERLY_LEDGER_V1_PACKAGE_NAME,
      protoPath: join(PROTO_DIR, ledgerV1.protobufFileName),
      url: `0.0.0.0:${config.grpcPort}`,
      loader: {
        includeDirs: [PROTO_DIR],
        // Must match ts-proto options (forceLong=string, stringEnums=true) in packages/proto/buf.gen.yaml,
        // otherwise the generated TS types lie about what arrives at runtime.
        longs: String,
        enums: String,
        // Missing fields decode to defaults ("" / 0), like the generated types assume.
        defaults: true,
      },
    },
  });
  // Close DB connections etc. on SIGTERM (Cloud Run sends it before stopping an instance).
  app.enableShutdownHooks();
  await app.listen();
  new Logger('Bootstrap').log(`ledger-service gRPC listening on :${config.grpcPort}`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
