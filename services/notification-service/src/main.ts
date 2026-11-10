import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// A pure consumer: no HTTP or gRPC server, just a Nest application context that pulls from Pub/Sub.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  new Logger('Bootstrap').log('notification-service started');
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
