import * as Phaser from 'phaser'
import type { Participant, ProviderId } from '@subswarm/shared'
import { findPath, type Point } from './navigation'
import type { WorldBridge, WorldController } from './types'
import { BUILDINGS, COLLISIONS, PLAYER_START, WORLD_HEIGHT, WORLD_WIDTH, WORLD_SCALE, worldPoint, type VillageBuilding } from './village'

const PEOPLE = [84, 85, 86, 87, 88, 96, 97, 98, 99, 100]
const STROLLS = [
  [worldPoint(100, 339), worldPoint(271, 339)],
  [worldPoint(303, 350), worldPoint(303, 565)],
  [worldPoint(109, 603), worldPoint(457, 603)],
  [worldPoint(1148, 340), worldPoint(1322, 340)],
  [worldPoint(855, 665), worldPoint(855, 769)],
  [worldPoint(1356, 403), worldPoint(1356, 526)],
]
const RESIDENT_STROLLS = [
  [worldPoint(752, 369), worldPoint(752, 476)],
  [worldPoint(954, 370), worldPoint(954, 478)],
  [worldPoint(791, 550), worldPoint(914, 550)],
  [worldPoint(790, 332), worldPoint(913, 332)],
  [worldPoint(813, 576), worldPoint(893, 576)],
  [worldPoint(689, 417), worldPoint(689, 492)],
]

interface Walker {
  sprite: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Ellipse
  label?: Phaser.GameObjects.Text
  from: Point
  to: Point
  phase: number
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
  private participantWalkers: Walker[] = []
  private lastParticipants: Participant[] | null = null
  private lastParticipantSubnet?: number
  private previousSelection: ProviderId | null | undefined
  private previousBusy: ProviderId | null | undefined
  private nearest: VillageBuilding | null = null
  private selectedRing!: Phaser.GameObjects.Ellipse
  private targetRing!: Phaser.GameObjects.Ellipse
  private overview = false
  private zoomFactor = 1.15
  private fitZoom = 1
  private lastPlayerX = 0
  private lastPlayerY = 0

  constructor(bridge: WorldBridge) {
    super('SubswarmVillage')
    this.bridge = bridge
  }

  preload() {
    this.load.image('town-evening', '/worlds/town-evening-v3.png')
    for (const frame of PEOPLE) this.load.image(`person-${frame}`, `/characters/tiny-dungeon/tile_${String(frame).padStart(4, '0')}.png`)
  }

  create() {
    this.cameras.main.setBackgroundColor(0x101b21)
    this.physics.world.setBounds(16, 20, WORLD_WIDTH - 32, WORLD_HEIGHT - 28)
    this.add.image(0, 0, 'town-evening').setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(-10)
    const walls = this.physics.add.staticGroup()
    for (const rect of COLLISIONS) {
      const wall = this.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height)
      walls.add(wall)
    }

    this.playerShadow = this.add.ellipse(PLAYER_START.x, PLAYER_START.y + 2, 22 * WORLD_SCALE, 8 * WORLD_SCALE, 0x071c22, 0.55).setDepth(20)
    this.player = this.physics.add.sprite(PLAYER_START.x, PLAYER_START.y, 'person-86').setScale(2.25 * WORLD_SCALE).setOrigin(0.5, 1)
    this.player.setCollideWorldBounds(true)
    this.player.body!.setSize(8, 5)
    this.player.body!.setOffset(4, 11)
    this.physics.add.collider(this.player, walls)
    this.playerLabel = this.add.text(PLAYER_START.x, PLAYER_START.y - 39, 'YOU', {
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
    const width = building.name === 'EveryFrame' || building.name === 'ChronoSeek' ? 123 : 110
    const plate = this.add.graphics()
    const post = this.add.rectangle(0, 17, 4, 12, 0x6e5440)
    const number = this.add.text(-width / 2 + 8, -1, building.number, { fontFamily: 'monospace', fontSize: '10px', color: '#e6c886' }).setOrigin(0, 0.5)
    const name = this.add.text(-width / 2 + 31, -1, building.name, { fontFamily: 'monospace', fontSize: '11px', color: '#f8efd9' }).setOrigin(0, 0.5)
    const status = this.add.text(width / 2 - 9, -13, '', { fontFamily: 'monospace', fontSize: '14px', color: '#f2d296' }).setOrigin(0.5)
    const container = this.add.container(building.sign.x, building.sign.y, [post, plate, number, name, status]).setDepth(2500).setScale(WORLD_SCALE)
    container.setSize(width, 29).setInteractive({ useHandCursor: true })
    container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      if (!inputBlocked()) this.bridge.selectProvider(building.id)
    })
    container.on('pointerover', () => { name.setColor('#ffffff'); container.setScale(WORLD_SCALE * 1.035) })
    container.on('pointerout', () => { name.setColor('#f8efd9'); container.setScale(WORLD_SCALE) })
    this.signs.push({ building, plate, status })
    this.paintSign(this.signs[this.signs.length - 1], false, false)
  }

  private paintSign(sign: Sign, selected: boolean, busy: boolean) {
    const width = sign.building.name === 'EveryFrame' || sign.building.name === 'ChronoSeek' ? 123 : 110
    sign.plate.clear().fillStyle(selected ? 0x3e493c : 0x202c2c, 0.96)
      .lineStyle(selected ? 2 : 1, selected ? 0xe7cb8c : 0x8e967f, selected ? 1 : 0.8)
      .fillRoundedRect(-width / 2, -14, width, 28, 3).strokeRoundedRect(-width / 2, -14, width, 28, 3)
    sign.plate.lineStyle(1, 0x677568, 0.6).lineBetween(-width / 2 + 25, -8, -width / 2 + 25, 8)
    sign.status.setText(busy ? '*' : '')
  }

  private createWalker(index: number, label?: string, stroll = STROLLS[index % STROLLS.length]): Walker {
    const from = { ...stroll[0] }
    const to = { ...stroll[1] }
    const shadow = this.add.ellipse(from.x, from.y + 2, 15 * WORLD_SCALE, 6 * WORLD_SCALE, 0x102427, 0.45)
    const sprite = this.add.image(from.x, from.y, `person-${PEOPLE[index % PEOPLE.length]}`).setScale(1.8 * WORLD_SCALE).setOrigin(0.5, 1)
    const text = label ? this.add.text(from.x, from.y - 30, label, { fontFamily: 'monospace', fontSize: '20px', color: '#e9e6ce', backgroundColor: '#253632', padding: { x: 5, y: 4 } }).setOrigin(0.5, 1).setVisible(false) : undefined
    if (text) {
      sprite.setInteractive()
      sprite.on('pointerover', () => text.setVisible(true))
      sprite.on('pointerout', () => text.setVisible(false))
    }
    return { sprite, shadow, label: text, from, to, phase: index * 0.83 }
  }

  private createVillagers() {
    for (let index = 0; index < 6; index++) this.walkers.push(this.createWalker(index))
  }

  private syncParticipants(participants: Participant[], subnet?: number) {
    for (const walker of this.participantWalkers) { walker.sprite.destroy(); walker.shadow.destroy(); walker.label?.destroy() }
    this.participantWalkers = participants.slice(0, RESIDENT_STROLLS.length).map((participant, index) => this.createWalker(index + 2, `${subnet === undefined ? '' : `#${subnet} / `}UID ${participant.uid}`, RESIDENT_STROLLS[index]))
    this.lastParticipants = participants
    this.lastParticipantSubnet = subnet
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
      this.route = findPath({ x: this.player.x, y: this.player.y - 3 }, point)
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

  update(time: number) {
    if (!this.player || !this.keys) return
    const state = this.bridge.getState()
    if (state.participants !== this.lastParticipants || state.participantSubnet !== this.lastParticipantSubnet) this.syncParticipants(state.participants, state.participantSubnet)
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
      this.previousSelection = state.selectedProvider
      this.previousBusy = state.busyProvider
    }

    let dx = 0
    let dy = 0
    if (inputBlocked()) {
      this.route = []
      this.targetRing.setVisible(false)
    } else {
      dx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown)
      dy = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown)
      if (dx || dy) { this.route = []; this.targetRing.setVisible(false) }
      else if (this.route.length) {
        const next = this.route[0]
        const distance = Math.hypot(next.x - this.player.x, next.y - (this.player.y - 3))
        if (distance < 4 * WORLD_SCALE) this.route.shift()
        else { dx = next.x - this.player.x; dy = next.y - (this.player.y - 3) }
        if (!this.route.length) this.targetRing.setVisible(false)
      }
    }
    const length = Math.hypot(dx, dy)
    this.player.setVelocity(length ? dx / length * 132 * WORLD_SCALE : 0, length ? dy / length * 132 * WORLD_SCALE : 0)
    if (dx) this.player.setFlipX(dx < 0)
    const moving = Math.abs(this.player.x - this.lastPlayerX) + Math.abs(this.player.y - this.lastPlayerY) > 0.05
    this.player.setScale(2.25 * WORLD_SCALE, (2.25 + (moving ? Math.sin(time / 75) * 0.075 : 0)) * WORLD_SCALE)
    this.player.setDepth(this.player.y + 20)
    this.playerShadow.setPosition(this.player.x, this.player.y + 1).setDepth(this.player.y + 19)
    this.playerLabel.setPosition(this.player.x, this.player.y - 39 * WORLD_SCALE)
    this.lastPlayerX = this.player.x
    this.lastPlayerY = this.player.y

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

    for (const walker of [...this.walkers, ...this.participantWalkers]) {
      const progress = (Math.sin(time / 9500 + walker.phase) + 1) / 2
      const x = Phaser.Math.Linear(walker.from.x, walker.to.x, progress)
      const y = Phaser.Math.Linear(walker.from.y, walker.to.y, progress)
      walker.sprite.setPosition(x, y + Math.sin(time / 140 + walker.phase) * 0.6).setDepth(y + 20).setFlipX(Math.cos(time / 9500 + walker.phase) < 0)
      walker.shadow.setPosition(x, y + 1).setDepth(y + 19)
      walker.label?.setPosition(x, y - 32 * WORLD_SCALE).setDepth(y + 21)
    }
  }
}
