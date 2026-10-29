import type { Provider } from "@subswarm/shared";

export function matchesProvider(provider: Provider, query: string) {
  const text = [provider.name, provider.id, provider.category, provider.taskKind, provider.description, provider.inputDescription, provider.netuid === null ? "" : `SN ${provider.netuid}`].join(" ").toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).every(word => text.includes(word));
}
