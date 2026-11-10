import { Global, Logger, Module } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { DataSource } from 'typeorm';
import { OutboxRelay } from '@ledgerly/common';
import { config } from '../config';

/**
 * Pub/Sub client + the outbox relay that publishes this service's events. Global: any module can inject PubSub.
 * The relay is a plain class from @ledgerly/common; Nest calls its onApplicationBootstrap/onApplicationShutdown.
 */
@Global()
@Module({
  providers: [
    {
      provide: PubSub,
      useFactory: () =>
        new PubSub({
          projectId: config.gcpProjectId,
          ...(config.pubsubEmulatorHost
            ? { apiEndpoint: config.pubsubEmulatorHost, emulatorMode: true }
            : {}),
        }),
    },
    {
      provide: OutboxRelay,
      inject: [DataSource, PubSub],
      useFactory: (dataSource: DataSource, pubsub: PubSub) =>
        new OutboxRelay(dataSource, pubsub, new Logger('OutboxRelay'), {
          crashAfterPublish: config.crashAfterPublish,
        }),
    },
  ],
  exports: [PubSub],
})
export class MessagingModule {}
