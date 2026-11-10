// Creates Pub/Sub topics and subscriptions in the LOCAL emulator. The emulator keeps everything in memory,
// so run this after every `pnpm infra:up`. On GCP the same resources are created with gcloud/Terraform.
//
// Usage: pnpm pubsub:setup
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub({
  projectId: process.env.GCP_PROJECT_ID ?? 'ledgerly-local',
  apiEndpoint: process.env.PUBSUB_EMULATOR_HOST ?? 'localhost:8085',
  emulatorMode: true,
});

// topic -> its subscriptions (one per consuming service, so each service gets its own copy of every message)
const TOPOLOGY: Record<string, { name: string; ordered: boolean }[]> = {
  'invoice-events': [{ name: 'notification-service.invoice-events', ordered: false }],
  // Ordered: payment.started must reach invoice-service before payment.completed/failed of the same invoice.
  'payment-events': [{ name: 'invoice-service.payment-events', ordered: true }],
};

const ALREADY_EXISTS = 6; // gRPC status code

async function ignoreExisting(what: string, create: () => Promise<unknown>): Promise<void> {
  try {
    await create();
    console.log(`created  ${what}`);
  } catch (err) {
    if ((err as { code?: number }).code !== ALREADY_EXISTS) throw err;
    console.log(`exists   ${what}`);
  }
}

for (const [topic, subscriptions] of Object.entries(TOPOLOGY)) {
  await ignoreExisting(`topic ${topic}`, () => pubsub.createTopic(topic));
  for (const sub of subscriptions) {
    // ackDeadlineSeconds: if the consumer doesn't ack within this time, Pub/Sub redelivers the message.
    // enableMessageOrdering can only be set when the subscription is created.
    await ignoreExisting(`subscription ${sub.name}`, () =>
      pubsub.topic(topic).createSubscription(sub.name, {
        ackDeadlineSeconds: 10,
        enableMessageOrdering: sub.ordered,
      }),
    );
  }
}
await pubsub.close();
