import { Box, Cloud, Code2, Film, MessageSquare, Network, Palette, Search, Sparkles, Video } from "lucide-react";
import type { ProviderId } from "@subswarm/shared";

export const districts = {
  saygm: { number: "01", district: "The Storyteller", color: "#d9a260", icon: MessageSquare },
  desearch: { number: "02", district: "The Observatory", color: "#8bb2ad", icon: Search },
  "404gen": { number: "03", district: "The Maker's Forge", color: "#e59577", icon: Box },
  chutes: { number: "04", district: "The Engine Room", color: "#b6a0cd", icon: Sparkles },
  everyframe: { number: "05", district: "The Picture House", color: "#b9c490", icon: Film },
  hippius: { number: "06", district: "The Cloud Keep", color: "#a6c7d3", icon: Cloud },
  ridges: { number: "07", district: "The Workshop", color: "#d3b88d", icon: Code2 },
  attelier: { number: "08", district: "The Artist's Loft", color: "#d1a4ad", icon: Palette },
  chronoseek: { number: "09", district: "The Timekeeper", color: "#b7bfe0", icon: Video },
  network: { number: "10", district: "The Town Hall", color: "#c4cd7c", icon: Network },
} satisfies Record<ProviderId, { number: string; district: string; color: string; icon: typeof Network }>;

export const providerOrder: ProviderId[] = ["saygm", "desearch", "404gen", "chutes", "everyframe", "hippius", "ridges", "attelier", "chronoseek", "network"];

export const statusLabel = {
  ready: "Ready for a quest",
  needs_key: "Connection needed",
  unavailable: "Unavailable",
  external: "Visit provider",
};

export const questRewards: Record<ProviderId, string> = {
  saygm: 'A written answer, saved in your journal.',
  desearch: 'Web results with excerpts and source links.',
  '404gen': 'A downloadable 3D splat or mesh.',
  chutes: 'A text response from a Chutes model.',
  everyframe: 'Video and image tools at the provider studio.',
  hippius: 'File storage through the provider service.',
  ridges: 'A proposed code change to review.',
  attelier: 'Media creation tools at the provider.',
  chronoseek: 'Matching video moments with timestamps.',
  network: 'A snapshot of registered miners and validators.',
};
