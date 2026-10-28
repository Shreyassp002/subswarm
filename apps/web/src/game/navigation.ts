import { COLLISIONS, WORLD_HEIGHT, WORLD_WIDTH } from './village'

export interface Point { x: number; y: number }

const CELL = 16
const COLS = WORLD_WIDTH / CELL
const ROWS = WORLD_HEIGHT / CELL
const key = (x: number, y: number) => y * COLS + x
const point = (index: number): Point => ({ x: (index % COLS) * CELL + CELL / 2, y: Math.floor(index / COLS) * CELL + CELL / 2 })
const blocked = new Set<number>()

for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const p = point(key(x, y))
    if (COLLISIONS.some(r => p.x > r.x - 8 && p.x < r.x + r.width + 8 && p.y > r.y - 8 && p.y < r.y + r.height + 8)) blocked.add(key(x, y))
  }
}

function closestCell(p: Point): number {
  const cx = Math.max(0, Math.min(COLS - 1, Math.floor(p.x / CELL)))
  const cy = Math.max(0, Math.min(ROWS - 1, Math.floor(p.y / CELL)))
  if (!blocked.has(key(cx, cy))) return key(cx, cy)
  for (let radius = 1; radius < 12; radius++) {
    const candidates: number[] = []
    for (let y = Math.max(0, cy - radius); y <= Math.min(ROWS - 1, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x <= Math.min(COLS - 1, cx + radius); x++) {
        if (!blocked.has(key(x, y))) candidates.push(key(x, y))
      }
    }
    if (candidates.length) return candidates.sort((a, b) => Math.hypot(point(a).x - p.x, point(a).y - p.y) - Math.hypot(point(b).x - p.x, point(b).y - p.y))[0]
  }
  return key(cx, cy)
}

export function findPath(from: Point, to: Point): Point[] {
  const start = closestCell(from)
  const goal = closestCell(to)
  const open = new Set([start])
  const parent = new Map<number, number>()
  const cost = new Map([[start, 0]])
  const goalPoint = point(goal)
  const heuristic = (index: number) => Math.abs(point(index).x - goalPoint.x) + Math.abs(point(index).y - goalPoint.y)
  const rank = new Map([[start, heuristic(start)]])

  while (open.size) {
    let current = -1
    let best = Infinity
    for (const index of open) {
      if ((rank.get(index) ?? Infinity) < best) { best = rank.get(index)!; current = index }
    }
    if (current === goal) {
      const path = [goal]
      while (parent.has(path[0])) path.unshift(parent.get(path[0])!)
      return path.slice(1).map(point)
    }
    open.delete(current)
    const x = current % COLS
    const y = Math.floor(current / COLS)
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue
      const next = key(nx, ny)
      if (blocked.has(next)) continue
      const nextCost = cost.get(current)! + CELL
      if (nextCost >= (cost.get(next) ?? Infinity)) continue
      parent.set(next, current)
      cost.set(next, nextCost)
      rank.set(next, nextCost + heuristic(next))
      open.add(next)
    }
  }
  return []
}
