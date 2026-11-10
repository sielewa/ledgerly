import { Global, Module } from '@nestjs/common';
import { PubSub } from '@google-cloud/pubsub';
import { config } from '../config';

/** Pub/Sub client. Global: any module can inject PubSub. (This service only consumes: no outbox relay.) */
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
  ],
  exports: [PubSub],
})
export class MessagingModule {}
