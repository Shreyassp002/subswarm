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
}

const worldRect = (x: number, y: number, width: number, height: number): WorldRect => ({ x: x * WORLD_SCALE, y: y * WORLD_SCALE, width: width * WORLD_SCALE, height: height * WORLD_SCALE })

export const BUILDINGS: VillageBuilding[] = [
  { id: 'saygm', number: '01', name: 'SayGM', ability: 'TEXT & CHAT', color: 0x79d9ef, entrance: worldPoint(148, 316), sign: worldPoint(172, 96), bounds: worldRect(63, 109, 219, 191) },
  { id: 'desearch', number: '02', name: 'Desearch', ability: 'WEB SEARCH', color: 0xabe4a1, entrance: worldPoint(445, 321), sign: worldPoint(445, 132), bounds: worldRect(346, 146, 194, 157) },
  { id: '404gen', number: '03', name: '404-GEN', ability: '3D CREATION', color: 0xf2bd7f, entrance: worldPoint(141, 566), sign: worldPoint(153, 368), bounds: worldRect(54, 381, 198, 169) },
  { id: 'chutes', number: '04', name: 'Chutes', ability: 'AI MODELS', color: 0xc99df0, entrance: worldPoint(449, 574), sign: worldPoint(442, 350), bounds: worldRect(340, 367, 203, 190) },
  { id: 'everyframe', number: '05', name: 'EveryFrame', ability: 'MEDIA STUDIO', color: 0x95dfd2, entrance: worldPoint(1516, 369), sign: worldPoint(1503, 173), bounds: worldRect(1401, 185, 204, 166) },
  { id: 'hippius', number: '06', name: 'Hippius', ability: 'CLOUD STORAGE', color: 0xead49b, entrance: worldPoint(1225, 322), sign: worldPoint(1246, 130), bounds: worldRect(1158, 144, 177, 161) },
  { id: 'ridges', number: '07', name: 'Ridges', ability: 'CODING AGENTS', color: 0xead49b, entrance: worldPoint(1359, 704), sign: worldPoint(1361, 537), bounds: worldRect(1268, 551, 186, 137) },
  { id: 'attelier', number: '08', name: 'Attelier', ability: 'CREATIVE TOOLS', color: 0xcfa3e9, entrance: worldPoint(1238, 514), sign: worldPoint(1248, 343), bounds: worldRect(1156, 357, 183, 141) },
  { id: 'chronoseek', number: '09', name: 'ChronoSeek', ability: 'VIDEO SEARCH', color: 0xcda5f1, entrance: worldPoint(1519, 587), sign: worldPoint(1515, 387), bounds: worldRect(1412, 401, 205, 170) },
  { id: 'network', number: '10', name: 'Network', ability: 'CHAIN EXPLORER', color: 0x9de6d6, entrance: worldPoint(855, 516), sign: worldPoint(855, 350), bounds: worldRect(794, 367, 128, 128) },
]

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
