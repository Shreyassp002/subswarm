import * as Phaser from 'phaser'
import type { NetworkSnapshot, ProviderId } from '@subswarm/shared'
import { findPath, type Point } from './navigation'
import type { WorldBridge, WorldController } from './types'
import { BUILDINGS, COLLISIONS, PLAYER_START, PLAYER_FOOTPRINT, WORLD_HEIGHT, WORLD_WIDTH, WORLD_SCALE, worldPoint, type VillageBuilding, type VillageBuildingId } from './village'

const CHARACTERS = ['traveler', 'courier', 'resident'] as const
const DIRECTIONS = { down: 0, up: 1, left: 2, right: 3 } as const
type Direction = keyof typeof DIRECTIONS
const SIGN_WIDTH = 136
const STROLLS = [
  [worldPoint(100, 339), worldPoint(271, 339)],
  [worldPoint(303, 350), worldPoint(303, 565)],
  [worldPoint(109, 603), worldPoint(457, 603)],
  [worldPoint(1148, 340), worldPoint(1322, 340)],
  [worldPoint(855, 665), worldPoint(855, 769)],
  [worldPoint(1356, 403), worldPoint(1356, 526)],
]


interface Walker {
  sprite: Phaser.GameObjects.Sprite
  shadow: Phaser.GameObjects.Ellipse
  label?: Phaser.GameObjects.Text
  from: Point
  to: Point
  route: Point[]
  destination: number
  waitUntil: number
  direction: Direction
  speed: number
  courier?: boolean
}

interface Sign {
  building: VillageBuilding
  plate: Phaser.GameObjects.Graphics
  status: Phaser.GameObjects.Text
}

function inputBlocked(): boolean {
  const target = document.activeElement
  return Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) ||
    (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName)))
}

export class WorldScene extends Phaser.Scene implements WorldController {
  private readonly bridge: WorldBridge
  private player!: Phaser.Physics.Arcade.Sprite
  private playerShadow!: Phaser.GameObjects.Ellipse
  private playerLabel!: Phaser.GameObjects.Text
  private entranceHint!: Phaser.GameObjects.Text
  private keys!: Record<string, Phaser.Input.Keyboard.Key>
  private route: Point[] = []
  private signs: Sign[] = []
  private walkers: Walker[] = []
  private participantWalkers = new Map<ProviderId, Walker[]>()
  private couriers: Walker[] = []
  private playerDirection: Direction = 'down'
  private lastResidents: Partial<Record<ProviderId, NetworkSnapshot>> = {}
  private previousSelection: VillageBuildingId | null | undefined
  private previousBusy: ProviderId | null | undefined
  private nearest: VillageBuilding | null = null
  private selectedRing!: Phaser.GameObjects.Ellipse
  private targetRing!: Phaser.GameObjects.Ellipse
  private overview = false
  private zoomFactor = 1.15
  private fitZoom = 1

  constructor(bridge: WorldBridge) {
    super('SubswarmVillage')
    this.bridge = bridge
  }

  preload() {
    this.load.image('town-evening', '/worlds/town-evening-v3.png')
    for (const character of CHARACTERS) this.load.spritesheet(character, `/characters/ninja-adventure/${character}.png`, { frameWidth: 16, frameHeight: 16 })
  }

  create() {
    for (const character of CHARACTERS) {
      for (const [direction, column] of Object.entries(DIRECTIONS)) {
        this.anims.create({ key: `${character}-walk-${direction}`, frames: [0, 1, 2, 3].map(row => ({ key: character, frame: row * 4 + column })), frameRate: 8, repeat: -1 })
      }
    }
    this.cameras.main.setBackgroundColor(0x101b21)
    this.physics.world.setBounds(16, 20, WORLD_WIDTH - 32, WORLD_HEIGHT - 28)
    this.add.image(0, 0, 'town-evening').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(-10)
    const walls = this.physics.add.staticGroup()
    for (const rect of COLLISIONS) {
      const wall = this.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height)
      walls.add(wall)
    }

    this.playerShadow = this.add.ellipse(PLAYER_START.x, PLAYER_START.y + 2, 22 * WORLD_SCALE, 8 * WORLD_SCALE, 0x071c22, 0.55).setDepth(20)
    this.player = this.physics.add.sprite(PLAYER_START.x, PLAYER_START.y, 'traveler').setScale(3 * WORLD_SCALE).setOrigin(0.5, 1)
    this.player.setCollideWorldBounds(true)
    const footWidth = PLAYER_FOOTPRINT.width / this.player.scaleX
    const footHeight = PLAYER_FOOTPRINT.height / this.player.scaleY
    this.player.body!.setSize(footWidth, footHeight)
    this.player.body!.setOffset((this.player.width - footWidth) / 2, this.player.height - footHeight / 2)
    this.physics.add.collider(this.player, walls)
    this.playerLabel = this.add.text(PLAYER_START.x, PLAYER_START.y - 51, 'YOU', {
      fontFamily: 'monospace', fontSize: '18px', color: '#fff3d5', backgroundColor: '#263a3a', padding: { x: 5, y: 3 },
    }).setOrigin(0.5, 1).setDepth(3000)

    this.selectedRing = this.add.ellipse(0, 0, 43 * WORLD_SCALE, 17 * WORLD_SCALE, 0xe9cd91, 0.13).setStrokeStyle(1.5, 0xe9cd91, 0.9).setDepth(9).setVisible(false)
    this.tweens.add({ targets: this.selectedRing, alpha: 0.48, duration: 1000, yoyo: true, repeat: -1 })
    this.targetRing = this.add.ellipse(0, 0, 17 * WORLD_SCALE, 8 * WORLD_SCALE).setStrokeStyle(1.3, 0xf6deac, 0.8).setDepth(8).setVisible(false)
    this.entranceHint = this.add.text(0, 0, 'E  ENTER', { fontFamily: 'monospace', fontSize: '20px', color: '#f7e7bc', backgroundColor: '#283931', padding: { x: 7, y: 5 } }).setOrigin(0.5, 1).setDepth(3500).setVisible(false)

    for (const building of BUILDINGS) {
      this.createSign(building)
      const { x, y, width, height } = building.bounds
      this.add.zone(x + width / 2, y + height / 2, width, height).setInteractive({ useHandCursor: true })
        .on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
          event.stopPropagation()
          if (!inputBlocked()) this.bridge.selectProvider(building.id)
        })
    }
    this.createVillagers()
    this.installInput()
    this.resize()
    this.scale.on('resize', this.resize, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.resize, this)
      this.input.removeAllListeners()
      this.input.keyboard?.removeAllListeners()
      this.bridge.nearby(null)
    })
    this.bridge.ready()
  }

  private createSign(building: VillageBuilding) {
    const plate = this.add.graphics()
    const name = this.add.text(0, -8, building.name, { fontFamily: 'monospace', fontSize: '14px', fontStyle: 'bold', color: '#fff0c7', stroke: '#35261c', strokeThickness: 2 }).setOrigin(0.5)
    const ability = this.add.text(0, 11, building.comingSoon ? 'COMING SOON' : building.ability, { fontFamily: 'monospace', fontSize: '10px', color: '#e6c79a' }).setOrigin(0.5)
    const status = this.add.text(0, -37, 'COURIERS AT WORK', { fontFamily: 'monospace', fontSize: '9px', color: '#fff0c7', backgroundColor: '#34473d', padding: { x: 6, y: 4 } }).setOrigin(0.5).setVisible(false)
    const container = this.add.container(building.sign.x, building.sign.y, [plate, name, ability, status]).setDepth(2500).setScale(WORLD_SCALE)
    container.setSize(SIGN_WIDTH, 46).setInteractive({ useHandCursor: true })
    container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      if (!inputBlocked()) this.bridge.selectProvider(building.id)
    })
    container.on('pointerover', () => name.setColor('#ffffff'))
    container.on('pointerout', () => name.setColor('#fff0c7'))
    this.signs.push({ building, plate, status })
    this.paintSign(this.signs[this.signs.length - 1], false, false)
  }

  private paintSign(sign: Sign, selected: boolean, busy: boolean) {
    const left = -SIGN_WIDTH / 2
    const plate = sign.plate.clear()
    plate.fillStyle(0x30251e).fillRect(-3, 24, 6, 10)
    plate.fillStyle(0x87603b).fillRect(-1, 24, 2, 9)
    plate.fillStyle(0x201d19, 0.45).fillRect(left + 3, -19, SIGN_WIDTH, 47)
    plate.fillStyle(selected ? 0xc3a16b : 0x9c794c).fillRect(left, -24, SIGN_WIDTH, 48)
    plate.fillStyle(selected ? 0x745238 : 0x57432e).fillRect(left + 3, -21, SIGN_WIDTH - 6, 42)
    plate.fillStyle(0x37291f).fillRect(left + 3, 2, SIGN_WIDTH - 6, 2)
    plate.fillStyle(0xa17b4a, 0.6).fillRect(left + 7, -19, SIGN_WIDTH - 14, 1).fillRect(left + 7, 5, SIGN_WIDTH - 14, 1)
    plate.fillStyle(0xc5a476)
    for (const x of [left + 7, -left - 9]) for (const y of [-17, 15]) plate.fillRect(x, y, 2, 2)
    plate.fillStyle(sign.building.color).fillRect(-13, 22, 26, 3)
    sign.status.setVisible(busy)
  }

  private createWalker(index: number, label = 'TOWN RESIDENT', stroll = STROLLS[index % STROLLS.length], character: typeof CHARACTERS[number] = index % 2 ? 'courier' : 'resident'): Walker {
    const from = { ...stroll[0] }
    const to = { ...stroll[1] }
    const shadow = this.add.ellipse(from.x, from.y + 2, 23 * WORLD_SCALE, 7 * WORLD_SCALE, 0x102427, 0.4)
    const sprite = this.add.sprite(from.x, from.y, character).setScale(2.65 * WORLD_SCALE).setOrigin(0.5, 1)
    const text = this.add.text(from.x, from.y - 48 * WORLD_SCALE, label, { fontFamily: 'monospace', fontSize: '19px', color: '#f5e8ca', backgroundColor: '#253632', padding: { x: 6, y: 4 } }).setOrigin(0.5, 1).setVisible(false)
    sprite.setInteractive({ useHandCursor: true })
    sprite.on('pointerover', () => text.setVisible(true))
    sprite.on('pointerout', () => text.setVisible(false))
    sprite.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => event.stopPropagation())
    return { sprite, shadow, label: text, from, to, route: [], destination: 1, waitUntil: this.time.now + index * 420, direction: 'down', speed: (29 + index % 3 * 6) * WORLD_SCALE }
  }

  private createVillagers() {
    for (let index = 0; index < 6; index++) this.walkers.push(this.createWalker(index))
  }

  private syncParticipants(residents: Partial<Record<ProviderId, NetworkSnapshot>>) {
    for (const building of BUILDINGS) {
      if (building.id === 'network' || building.id === 'kova' || building.comingSoon) continue
      const providerId = building.id
      const snapshot = residents[providerId]
      if (snapshot === this.lastResidents[building.id]) continue
      for (const walker of this.participantWalkers.get(building.id) ?? []) { walker.sprite.destroy(); walker.shadow.destroy(); walker.label?.destroy() }
      const walkers: Walker[] = []
      for (const [index, participant] of (snapshot?.participants.slice(0, 3) ?? []).entries()) {
        const from = { x: building.entrance.x + (index - 1) * 58 * WORLD_SCALE, y: building.entrance.y + (65 + index * 14) * WORLD_SCALE }
        const to = { x: from.x + 30 * WORLD_SCALE, y: from.y + 25 * WORLD_SCALE }
        const path = findPath(from, to)
        if (!path.length) continue
        const identity = `${snapshot!.network.toUpperCase()} SN${snapshot!.netuid} / UID ${participant.uid} / ${participant.role.toUpperCase()}`
        const walker = this.createWalker(index, identity, [path[0], path[path.length - 1]], participant.role === 'validator' ? 'traveler' : 'resident')
        walker.label?.setText(identity).setColor('#c0f3de').setVisible(false)
        walker.sprite.removeAllListeners('pointerover').removeAllListeners('pointerout')
        walker.sprite.on('pointerover', () => walker.label?.setVisible(true))
        walker.sprite.on('pointerout', () => walker.label?.setVisible(false))
        walker.sprite.on('pointerdown', () => { if (!inputBlocked()) this.bridge.selectResident(providerId, participant.uid) })
        walkers.push(walker)
      }
      this.participantWalkers.set(building.id, walkers)
    }
    this.lastResidents = residents
  }

  private syncCouriers(provider: ProviderId | null) {
    for (const walker of this.couriers) { walker.sprite.destroy(); walker.shadow.destroy(); walker.label?.destroy() }
    this.couriers = []
    const building = BUILDINGS.find(item => item.id === provider)
    if (!building) return
    for (let index = 0; index < 3; index++) {
      const start = { x: building.entrance.x + (index - 1) * 94 * WORLD_SCALE, y: building.entrance.y + (index === 1 ? 170 : 135) * WORLD_SCALE }
      const end = { x: building.entrance.x + (index - 1) * 46 * WORLD_SCALE, y: building.entrance.y + 110 * WORLD_SCALE }
      const path = findPath(start, end)
      if (!path.length) continue
      const walker = this.createWalker(index, 'TOWN COURIER / DECORATION', [path[0], end], 'courier')
      walker.route = path.slice(1)
      walker.speed = (52 + index * 5) * WORLD_SCALE
      walker.courier = true
      this.couriers.push(walker)
    }
  }

  private face(sprite: Phaser.GameObjects.Sprite, dx: number, dy: number, previous: Direction, moving: boolean): Direction {
    const direction = moving ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down')) : previous
    if (moving) sprite.play(`${sprite.texture.key}-walk-${direction}`, true)
    else { sprite.anims.stop(); sprite.setFrame(DIRECTIONS[direction]) }
    return direction
  }

  private updateWalker(walker: Walker, time: number, delta: number) {
    if (!walker.route.length && time >= walker.waitUntil && !walker.courier) {
      walker.route = findPath(walker.sprite, walker.destination ? walker.to : walker.from)
      walker.destination = 1 - walker.destination
      walker.waitUntil = time + 1500
    }
    const next = walker.route[0]
    let dx = 0
    let dy = 0
    if (next) {
      dx = next.x - walker.sprite.x
      dy = next.y - walker.sprite.y
      const distance = Math.hypot(dx, dy)
      const step = Math.min(distance, walker.speed * Math.min(delta, 50) / 1000)
      if (distance) walker.sprite.setPosition(walker.sprite.x + dx / distance * step, walker.sprite.y + dy / distance * step)
      if (distance <= step) {
        walker.route.shift()
        if (!walker.route.length) walker.waitUntil = time + 1600 + walker.speed * 13
      }
    }
    walker.direction = this.face(walker.sprite, dx, dy, walker.direction, Boolean(next))
    if (walker.courier && !next) this.face(walker.sprite, 0, 0, Math.floor(time / 2400 + walker.speed) % 3 ? 'up' : 'left', false)
    const { x, y } = walker.sprite
    walker.sprite.setDepth(y + 20)
    walker.shadow.setPosition(x, y + 1).setDepth(y + 19)
    walker.label?.setPosition(x, y - 47 * WORLD_SCALE).setDepth(3001)
  }

  private installInput() {
    if (!this.input.keyboard) return
    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as Record<string, Phaser.Input.Keyboard.Key>
    this.input.keyboard.removeCapture(['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'E'])
    this.input.keyboard.on('keydown-E', () => {
      if (!inputBlocked() && this.nearest) this.bridge.selectProvider(this.nearest.id)
    })
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.leftButtonDown() || inputBlocked()) return
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
      this.route = findPath({ x: this.player.x, y: this.player.y }, point)
      const target = this.route.at(-1)
      this.targetRing.setVisible(Boolean(target))
      if (target) this.targetRing.setPosition(target.x, target.y)
    })
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      if (!inputBlocked()) this.zoom(dy > 0 ? -1 : 1)
    })
  }

  private resize() {
    this.fitZoom = (this.overview ? Math.min : Math.max)(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT)
    this.applyCamera()
  }

  private applyCamera() {
    const camera = this.cameras.main
    const zoom = this.fitZoom * this.zoomFactor
    camera.setZoom(zoom)
    const width = Math.max(WORLD_WIDTH, camera.width / zoom)
    const height = Math.max(WORLD_HEIGHT, camera.height / zoom)
    camera.setBounds((WORLD_WIDTH - width) / 2, (WORLD_HEIGHT - height) / 2, width, height)
    if (this.zoomFactor > 1.03 || (!this.overview && this.scale.width < 768)) this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
    else {
      this.cameras.main.stopFollow()
      this.cameras.main.centerOn(WORLD_WIDTH / 2, WORLD_HEIGHT / 2)
    }
  }

  zoom(direction: number) {
    this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor + direction * 0.25, 1, 2.5)
    this.applyCamera()
  }

  recenter() {
    this.overview = !this.overview
    this.zoomFactor = 1
    this.resize()
  }

  update(time: number, delta: number) {
    if (!this.player || !this.keys) return
    const state = this.bridge.getState()
    if (state.residents !== this.lastResidents) this.syncParticipants(state.residents)
    if (state.selectedProvider !== this.previousSelection || state.busyProvider !== this.previousBusy) {
      for (const sign of this.signs) this.paintSign(sign, sign.building.id === state.selectedProvider, sign.building.id === state.busyProvider)
      const selected = BUILDINGS.find(building => building.id === state.selectedProvider)
      this.selectedRing.setVisible(Boolean(selected))
      if (selected) this.selectedRing.setPosition(selected.entrance.x, selected.entrance.y)
      if (state.selectedProvider !== this.previousSelection) {
        if (selected) {
          this.cameras.main.stopFollow()
          this.cameras.main.pan(selected.entrance.x, selected.entrance.y - 90 * WORLD_SCALE, 350, 'Sine.easeInOut')
        } else this.applyCamera()
      }
      if (state.busyProvider !== this.previousBusy) this.syncCouriers(state.busyProvider)
      this.previousSelection = state.selectedProvider
      this.previousBusy = state.busyProvider
    }

    let dx = 0
    let dy = 0
    let speed = 132 * WORLD_SCALE
    if (inputBlocked()) {
      this.route = []
      this.targetRing.setVisible(false)
    } else {
      dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)
      dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown)
      if (dx || dy) { this.route = []; this.targetRing.setVisible(false) }
      else if (this.route.length) {
        const next = this.route[0]
        const distance = Math.hypot(next.x - this.player.x, next.y - this.player.y)
        if (distance < 1.5 * WORLD_SCALE) this.route.shift()
        else {
          dx = next.x - this.player.x
          dy = next.y - this.player.y
          speed = Math.min(speed, distance * 1000 / Math.max(delta, 1000 / 60))
        }
        if (!this.route.length) this.targetRing.setVisible(false)
      }
    }
    const length = Math.hypot(dx, dy)
    this.player.setVelocity(length ? dx / length * speed : 0, length ? dy / length * speed : 0)
    const body = this.player.body as Phaser.Physics.Arcade.Body
    // Render frames between fixed physics steps must not restart the walk cycle.
    if (!length || this.physics.world.stepsLastFrame > 0) {
      const movedX = body.position.x - body.prev.x
      const movedY = body.position.y - body.prev.y
      const moving = length > 0 && Math.hypot(movedX, movedY) > 0.05
      this.playerDirection = this.face(this.player, movedX, movedY, this.playerDirection, moving)
    }
    this.player.setDepth(this.player.y + 20)
    this.playerShadow.setPosition(this.player.x, this.player.y + 1).setDepth(this.player.y + 19)
    this.playerLabel.setPosition(this.player.x, this.player.y - 51 * WORLD_SCALE)

    const nearby = BUILDINGS.reduce<{ building: VillageBuilding | null; distance: number }>((best, building) => {
      const distance = Math.hypot(this.player.x - building.entrance.x, this.player.y - building.entrance.y)
      return distance < best.distance ? { building, distance } : best
    }, { building: null, distance: 65 * WORLD_SCALE }).building
    if (nearby?.id !== this.nearest?.id) {
      this.nearest = nearby
      this.bridge.nearby(nearby?.name ?? null)
      this.entranceHint.setVisible(Boolean(nearby))
      if (nearby) this.entranceHint.setPosition(nearby.entrance.x, nearby.entrance.y - 37 * WORLD_SCALE)
    }

    for (const walker of [...this.walkers, ...Array.from(this.participantWalkers.values()).flat(), ...this.couriers]) this.updateWalker(walker, time, delta)
  }
}
