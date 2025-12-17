import type { Container } from "@azure/cosmos";
import { PartitionKeyKind } from "@azure/cosmos";
import { database } from "./client.js";
import { containers } from "./cosmos.js";

export async function getSubscribersContainer(): Promise<Container> {
  await database.containers.createIfNotExists({
    id: containers.subscribers,
    partitionKey: { paths: ["/id"], kind: PartitionKeyKind.Hash },
  });
  return database.container(containers.subscribers);
}
