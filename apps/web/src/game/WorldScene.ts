import * as Phaser from 'phaser'
import type { Participant, ProviderId } from '@subswarm/shared'
import { findPath, type Point } from './navigation'
import type { WorldBridge, WorldController } from './types'
import { BUILDINGS, COLLISIONS, WORLD_HEIGHT, WORLD_WIDTH, type VillageBuilding } from './village'

const PEOPLE = [84, 85, 86, 87, 88, 96, 97, 98, 99, 100]
const STROLLS = [
  [{ x: 206, y: 237 }, { x: 423, y: 237 }],
  [{ x: 805, y: 160 }, { x: 802, y: 445 }],
  [{ x: 369, y: 479 }, { x: 681, y: 479 }],
  [{ x: 884, y: 403 }, { x: 1137, y: 405 }],
  [{ x: 493, y: 563 }, { x: 493, y: 706 }],
  [{ x: 1100, y: 553 }, { x: 1100, y: 694 }],
  [{ x: 591, y: 631 }, { x: 620, y: 630 }],
  [{ x: 788, y: 625 }, { x: 850, y: 625 }],
]
const RESIDENT_STROLLS = [
  [{ x: 610, y: 595 }, { x: 623, y: 612 }],
  [{ x: 789, y: 595 }, { x: 816, y: 598 }],
  [{ x: 691, y: 521 }, { x: 717, y: 527 }],
  [{ x: 688, y: 704 }, { x: 712, y: 704 }],
  [{ x: 1004, y: 600 }, { x: 1055, y: 601 }],
  [{ x: 1142, y: 651 }, { x: 1180, y: 652 }],
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
    (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
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
  private zoomFactor = 1
  private fitZoom = 1
  private lastPlayerX = 0
  private lastPlayerY = 0

  constructor(bridge: WorldBridge) {
    super('SubswarmVillage')
    this.bridge = bridge
  }

  preload() {
    for (const frame of PEOPLE) this.load.image(`person-${frame}`, `/characters/tiny-dungeon/tile_${String(frame).padStart(4, '0')}.png`)
  }

  create() {
    this.cameras.main.setBackgroundColor(0x101b21)
    this.physics.world.setBounds(16, 20, WORLD_WIDTH - 32, WORLD_HEIGHT - 28)
    const walls = this.physics.add.staticGroup()
    const outlines = this.add.graphics().setDepth(-5).lineStyle(1, 0x34494f, 0.8).fillStyle(0x192b30, 0.45)
    for (const rect of COLLISIONS) {
      const wall = this.add.zone(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height)
      walls.add(wall)
      outlines.fillRect(rect.x, rect.y, rect.width, rect.height).strokeRect(rect.x, rect.y, rect.width, rect.height)
    }

    this.playerShadow = this.add.ellipse(790, 476, 22, 8, 0x071c22, 0.55).setDepth(20)
    this.player = this.physics.add.sprite(790, 472, 'person-86').setScale(2.25).setOrigin(0.5, 1)
    this.player.setCollideWorldBounds(true)
    this.player.body!.setSize(8, 5)
    this.player.body!.setOffset(4, 11)
    this.physics.add.collider(this.player, walls)
    this.playerLabel = this.add.text(790, 435, 'YOU', {
      fontFamily: 'monospace', fontSize: '9px', color: '#fff3d5', backgroundColor: '#263a3a', padding: { x: 5, y: 3 },
    }).setOrigin(0.5, 1).setDepth(300)

    this.selectedRing = this.add.ellipse(0, 0, 43, 17, 0xe9cd91, 0.13).setStrokeStyle(1.5, 0xe9cd91, 0.9).setDepth(9).setVisible(false)
    this.tweens.add({ targets: this.selectedRing, alpha: 0.48, duration: 1000, yoyo: true, repeat: -1 })
    this.targetRing = this.add.ellipse(0, 0, 17, 8).setStrokeStyle(1.3, 0xf6deac, 0.8).setDepth(8).setVisible(false)
    this.entranceHint = this.add.text(0, 0, 'E  ENTER', { fontFamily: 'monospace', fontSize: '10px', color: '#f7e7bc', backgroundColor: '#283931', padding: { x: 7, y: 5 } }).setOrigin(0.5, 1).setDepth(350).setVisible(false)

    for (const building of BUILDINGS) this.createSign(building)
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
    const container = this.add.container(building.sign.x, building.sign.y, [post, plate, number, name, status]).setDepth(250)
    container.setSize(width, 29).setInteractive({ useHandCursor: true })
    container.on('pointerdown', (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      this.bridge.selectProvider(building.id)
    })
    container.on('pointerover', () => { name.setColor('#ffffff'); container.setScale(1.035) })
    container.on('pointerout', () => { name.setColor('#f8efd9'); container.setScale(1) })
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
    const shadow = this.add.ellipse(from.x, from.y + 2, 15, 6, 0x102427, 0.45)
    const sprite = this.add.image(from.x, from.y, `person-${PEOPLE[index % PEOPLE.length]}`).setScale(1.8).setOrigin(0.5, 1)
    const text = label ? this.add.text(from.x, from.y - 30, label, { fontFamily: 'monospace', fontSize: '10px', color: '#e9e6ce', backgroundColor: '#253632', padding: { x: 5, y: 4 } }).setOrigin(0.5, 1).setVisible(false) : undefined
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
    this.fitZoom = Math.min(this.scale.width / WORLD_WIDTH, this.scale.height / WORLD_HEIGHT)
    this.applyCamera()
  }

  private applyCamera() {
    const camera = this.cameras.main
    const zoom = this.fitZoom * this.zoomFactor
    camera.setZoom(zoom)
    const width = Math.max(WORLD_WIDTH, camera.width / zoom)
    const height = Math.max(WORLD_HEIGHT, camera.height / zoom)
    camera.setBounds((WORLD_WIDTH - width) / 2, (WORLD_HEIGHT - height) / 2, width, height)
    if (this.zoomFactor > 1.03) this.cameras.main.startFollow(this.player, true, 0.08, 0.08)
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
    this.zoomFactor = 1
    this.applyCamera()
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
        if (distance < 4) this.route.shift()
        else { dx = next.x - this.player.x; dy = next.y - (this.player.y - 3) }
        if (!this.route.length) this.targetRing.setVisible(false)
      }
    }
    const length = Math.hypot(dx, dy)
    this.player.setVelocity(length ? dx / length * 132 : 0, length ? dy / length * 132 : 0)
    if (dx) this.player.setFlipX(dx < 0)
    const moving = Math.abs(this.player.x - this.lastPlayerX) + Math.abs(this.player.y - this.lastPlayerY) > 0.05
    this.player.setScale(2.25, 2.25 + (moving ? Math.sin(time / 75) * 0.075 : 0))
    this.player.setDepth(this.player.y + 20)
    this.playerShadow.setPosition(this.player.x, this.player.y + 1).setDepth(this.player.y + 19)
    this.playerLabel.setPosition(this.player.x, this.player.y - 39)
    this.lastPlayerX = this.player.x
    this.lastPlayerY = this.player.y

    const nearby = BUILDINGS.reduce<{ building: VillageBuilding | null; distance: number }>((best, building) => {
      const distance = Math.hypot(this.player.x - building.entrance.x, this.player.y - building.entrance.y)
      return distance < best.distance ? { building, distance } : best
    }, { building: null, distance: 65 }).building
    if (nearby?.id !== this.nearest?.id) {
      this.nearest = nearby
      this.bridge.nearby(nearby?.name ?? null)
      this.entranceHint.setVisible(Boolean(nearby))
      if (nearby) this.entranceHint.setPosition(nearby.entrance.x, nearby.entrance.y - 37)
    }

    for (const walker of [...this.walkers, ...this.participantWalkers]) {
      const progress = (Math.sin(time / 9500 + walker.phase) + 1) / 2
      const x = Phaser.Math.Linear(walker.from.x, walker.to.x, progress)
      const y = Phaser.Math.Linear(walker.from.y, walker.to.y, progress)
      walker.sprite.setPosition(x, y + Math.sin(time / 140 + walker.phase) * 0.6).setDepth(y + 20).setFlipX(Math.cos(time / 9500 + walker.phase) < 0)
      walker.shadow.setPosition(x, y + 1).setDepth(y + 19)
      walker.label?.setPosition(x, y - 32).setDepth(y + 21)
    }
  }
}
