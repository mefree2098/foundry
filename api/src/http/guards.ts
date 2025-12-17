import type { Container } from "@azure/cosmos";

export async function ensureNoNews(container: Container, platformId: string) {
  const query = {
    query: "SELECT TOP 1 c.id FROM c WHERE ARRAY_CONTAINS(c.platformIds, @platformId)",
    parameters: [{ name: "@platformId", value: platformId }],
  };
  const { resources } = await container.items.query(query).fetchAll();
  return resources.length === 0;
}
