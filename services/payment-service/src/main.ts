import 'reflect-metadata';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PROTO_DIR, paymentV1 } from '@ledgerly/proto';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap(): Promise<void> {
  // rawBody: keep the exact request bytes next to the parsed JSON; webhook signatures are computed over them.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  // Hybrid app: gRPC for our own services (gateway), HTTP for the outside world (bank webhooks, scheduler).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: paymentV1.LEDGERLY_PAYMENT_V1_PACKAGE_NAME,
      protoPath: join(PROTO_DIR, paymentV1.protobufFileName),
      url: `0.0.0.0:${config.grpcPort}`,
      loader: { includeDirs: [PROTO_DIR], longs: String, enums: String, defaults: true },
    },
  });
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(config.httpPort);
  new Logger('Bootstrap').log(
    `payment-service gRPC on :${config.grpcPort}, HTTP on :${config.httpPort}`,
  );
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
