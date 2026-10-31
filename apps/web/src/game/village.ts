import type { ProviderId } from '@subswarm/shared'

export const WORLD_SCALE = 2
export const WORLD_WIDTH = 1680 * WORLD_SCALE
export const WORLD_HEIGHT = 944 * WORLD_SCALE
export const worldPoint = (x: number, y: number) => ({ x: x * WORLD_SCALE, y: y * WORLD_SCALE })
export const PLAYER_START = worldPoint(854, 684)
export const PLAYER_FOOTPRINT = { width: 24 * WORLD_SCALE, height: 15 * WORLD_SCALE }

export interface WorldRect { x: number; y: number; width: number; height: number }
export interface VillageBuilding {
  id: ProviderId
  number: string
  name: string
  ability: string
  color: number
  entrance: { x: number; y: number }
  sign: { x: number; y: number }
  bounds: WorldRect
  comingSoon?: { netuid: number; description: string; website: string }
}

const worldRect = (x: number, y: number, width: number, height: number): WorldRect => ({ x: x * WORLD_SCALE, y: y * WORLD_SCALE, width: width * WORLD_SCALE, height: height * WORLD_SCALE })

export const BUILDINGS: VillageBuilding[] = [
  { id: 'saygm', number: '01', name: 'SayGM', ability: 'TEXT & CHAT', color: 0x79d9ef, entrance: worldPoint(148, 316), sign: worldPoint(172, 96), bounds: worldRect(63, 109, 219, 191) },
  { id: 'desearch', number: '02', name: 'Desearch', ability: 'WEB SEARCH', color: 0xabe4a1, entrance: worldPoint(445, 321), sign: worldPoint(445, 132), bounds: worldRect(346, 146, 194, 157) },
  { id: 'bitmind', number: '03', name: 'BitMind', ability: 'IMAGE CHECKS', color: 0xf2bd7f, entrance: worldPoint(141, 566), sign: worldPoint(153, 368), bounds: worldRect(54, 381, 198, 169) },
  { id: 'zeus', number: '04', name: 'Zeus', ability: 'WEATHER', color: 0xc99df0, entrance: worldPoint(449, 574), sign: worldPoint(442, 350), bounds: worldRect(340, 367, 203, 190) },
  { id: 'ditto', number: '05', name: 'Ditto', ability: 'SAVE MEMORIES', color: 0xead49b, entrance: worldPoint(1225, 322), sign: worldPoint(1246, 130), bounds: worldRect(1158, 144, 177, 161) },
  { id: 'network', number: '06', name: 'Network', ability: 'CHAIN EXPLORER', color: 0x9de6d6, entrance: worldPoint(855, 516), sign: worldPoint(855, 350), bounds: worldRect(794, 367, 128, 128) },
  { id: 'chutes', number: '07', name: 'Chutes', ability: 'AI INFERENCE', color: 0xb6a0cd, entrance: worldPoint(1503, 370), sign: worldPoint(1503, 169), bounds: worldRect(1401, 185, 204, 166), comingSoon: { netuid: 64, description: 'Run open-source AI models for writing, reasoning and chat.', website: 'https://chutes.ai' } },
  { id: '404gen', number: '08', name: '404-GEN', ability: '3D CREATION', color: 0xe59577, entrance: worldPoint(1247, 517), sign: worldPoint(1247, 341), bounds: worldRect(1156, 357, 183, 141), comingSoon: { netuid: 17, description: 'Turn text and images into 3D assets for worlds, games and creative projects.', website: 'https://www.404.xyz' } },
  { id: 'hippius', number: '09', name: 'Hippius', ability: 'CLOUD STORAGE', color: 0xa6c7d3, entrance: worldPoint(1514, 590), sign: worldPoint(1514, 385), bounds: worldRect(1412, 401, 205, 170), comingSoon: { netuid: 75, description: 'Store files with distributed cloud infrastructure.', website: 'https://hippius.com' } },
  { id: 'ridges', number: '10', name: 'Ridges', ability: 'CODING AGENTS', color: 0xd3b88d, entrance: worldPoint(1361, 707), sign: worldPoint(1361, 535), bounds: worldRect(1268, 551, 186, 137), comingSoon: { netuid: 62, description: 'Explore AI coding agents that work on software tasks.', website: 'https://ridges.ai' } },
]

export const UPCOMING_BUILDINGS = BUILDINGS.filter(building => building.comingSoon)

export const COLLISIONS: WorldRect[] = [
  ...BUILDINGS.map(building => building.bounds),
  worldRect(0, 0, 1680, 25),
  worldRect(0, 0, 28, 944),
  worldRect(1650, 0, 30, 944),
  worldRect(0, 880, 777, 64),
  worldRect(923, 884, 757, 60),
  worldRect(667, 574, 129, 79),
  worldRect(929, 574, 102, 80),
  worldRect(40, 749, 180, 82),
  worldRect(583, 269, 58, 77),
  worldRect(627, 194, 66, 81),
  worldRect(624, 343, 49, 67),
  worldRect(587, 501, 58, 78),
  worldRect(867, 89, 66, 77),
  worldRect(941, 148, 60, 74),
  worldRect(982, 185, 58, 74),
  worldRect(1050, 283, 64, 81),
  worldRect(1046, 482, 66, 80),
  worldRect(1109, 565, 64, 75),
  worldRect(1202, 573, 62, 74),
  worldRect(606, 667, 68, 82),
  worldRect(1030, 696, 73, 78),
  worldRect(700, 525, 54, 39),
  worldRect(944, 526, 59, 35),
  worldRect(739, 266, 58, 32),
  worldRect(909, 270, 51, 35),
]
