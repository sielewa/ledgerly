import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { GrpcToHttpFilter } from './shared/grpc-to-http.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new GrpcToHttpFilter());
  app.enableShutdownHooks();
  await app.listen(config.httpPort);
  new Logger('Bootstrap').log(`gateway HTTP listening on :${config.httpPort}`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
