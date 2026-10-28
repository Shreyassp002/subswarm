import type { ProviderId } from '@subswarm/shared'

export const WORLD_WIDTH = 1376
export const WORLD_HEIGHT = 768

export interface VillageBuilding {
  id: ProviderId
  number: string
  name: string
  color: number
  entrance: { x: number; y: number }
  sign: { x: number; y: number }
}

export const BUILDINGS: VillageBuilding[] = [
  { id: 'saygm', number: '01', name: 'SayGM', color: 0x79d9ef, entrance: { x: 181, y: 219 }, sign: { x: 180, y: 238 } },
  { id: 'desearch', number: '02', name: 'Desearch', color: 0xabe4a1, entrance: { x: 334, y: 220 }, sign: { x: 334, y: 240 } },
  { id: '404gen', number: '03', name: '404-GEN', color: 0xf2bd7f, entrance: { x: 473, y: 218 }, sign: { x: 473, y: 240 } },
  { id: 'chutes', number: '04', name: 'Chutes', color: 0xc99df0, entrance: { x: 614, y: 220 }, sign: { x: 614, y: 241 } },
  { id: 'everyframe', number: '05', name: 'EveryFrame', color: 0x95dfd2, entrance: { x: 1038, y: 294 }, sign: { x: 1111, y: 300 } },
  { id: 'hippius', number: '06', name: 'Hippius', color: 0xead49b, entrance: { x: 146, y: 447 }, sign: { x: 150, y: 470 } },
  { id: 'ridges', number: '07', name: 'Ridges', color: 0xead49b, entrance: { x: 331, y: 448 }, sign: { x: 329, y: 472 } },
  { id: 'attelier', number: '08', name: 'Attelier', color: 0xcfa3e9, entrance: { x: 515, y: 447 }, sign: { x: 527, y: 471 } },
  { id: 'chronoseek', number: '09', name: 'ChronoSeek', color: 0xcda5f1, entrance: { x: 1194, y: 671 }, sign: { x: 1128, y: 728 } },
  { id: 'network', number: '10', name: 'Network', color: 0x9de6d6, entrance: { x: 706, y: 704 }, sign: { x: 706, y: 730 } },
]

export interface WorldRect { x: number; y: number; width: number; height: number }

export const COLLISIONS: WorldRect[] = [
  { x: 109, y: 49, width: 145, height: 157 },
  { x: 267, y: 33, width: 137, height: 177 },
  { x: 414, y: 39, width: 116, height: 169 },
  { x: 542, y: 69, width: 144, height: 139 },
  { x: 969, y: 67, width: 248, height: 213 },
  { x: 109, y: 240, width: 101, height: 194 },
  { x: 247, y: 252, width: 167, height: 182 },
  { x: 471, y: 273, width: 127, height: 162 },
  { x: 648, y: 555, width: 115, height: 126 },
  { x: 227, y: 506, width: 223, height: 212 },
  { x: 51, y: 603, width: 151, height: 139 },
  { x: 1234, y: 539, width: 56, height: 150 },
  { x: 0, y: 0, width: 80, height: 369 },
  { x: 0, y: 500, width: 44, height: 268 },
  { x: 1314, y: 0, width: 62, height: 369 },
  { x: 1316, y: 440, width: 60, height: 328 },
  { x: 0, y: 0, width: 720, height: 28 },
  { x: 873, y: 0, width: 503, height: 30 },
  { x: 1, y: 749, width: 683, height: 19 },
  { x: 779, y: 751, width: 597, height: 17 },
  { x: 546, y: 499, width: 45, height: 71 },
  { x: 808, y: 493, width: 48, height: 77 },
  { x: 550, y: 657, width: 43, height: 65 },
  { x: 809, y: 650, width: 42, height: 66 },
  { x: 964, y: 418, width: 42, height: 63 },
  { x: 1250, y: 437, width: 43, height: 62 },
  { x: 898, y: 278, width: 40, height: 66 },
  { x: 615, y: 397, width: 49, height: 23 },
  { x: 678, y: 388, width: 23, height: 40 },
]
