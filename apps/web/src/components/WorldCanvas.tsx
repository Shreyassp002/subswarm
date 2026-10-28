'use client'

import { useEffect, useRef, useState } from 'react'
import type { NetworkSnapshot, ProviderId } from '@subswarm/shared'
import type { WorldController, WorldState } from '../game/types'

interface WorldCanvasProps {
  selectedProvider: ProviderId | null
  onSelectProvider: (id: ProviderId) => void
  residents: Partial<Record<ProviderId, NetworkSnapshot>>
  onSelectResident: (id: ProviderId, uid: number) => void
  busyProvider?: ProviderId | null
}

export default function WorldCanvas({ selectedProvider, onSelectProvider, residents, onSelectResident, busyProvider = null }: WorldCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const controller = useRef<WorldController | null>(null)
  const state = useRef<WorldState>({ selectedProvider, residents, busyProvider })
  const select = useRef(onSelectProvider)
  const selectResident = useRef(onSelectResident)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [nearby, setNearby] = useState<string | null>(null)

  useEffect(() => {
    state.current = { selectedProvider, residents, busyProvider }
    select.current = onSelectProvider
    selectResident.current = onSelectResident
  }, [selectedProvider, residents, busyProvider, onSelectProvider, onSelectResident])

  useEffect(() => {
    const element = host.current
    if (!element) return
    let canceled = false
    let game: import('phaser').Game | undefined
    let observer: ResizeObserver | undefined

    async function start() {
      const [Phaser, { WorldScene }] = await Promise.all([import('phaser'), import('../game/WorldScene')])
      if (canceled) return
      const scene = new WorldScene({
        getState: () => state.current,
        selectProvider: id => select.current(id),
        selectResident: (id, uid) => selectResident.current(id, uid),
        nearby: name => { if (!canceled) setNearby(name) },
        ready: () => { if (!canceled) { controller.current = scene; setReady(true) } },
      })
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: element!,
        width: element!.clientWidth || 960,
        height: element!.clientHeight || 640,
        pixelArt: true,
        roundPixels: true,
        backgroundColor: '#101b21',
        audio: { noAudio: true },
        physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: [scene],
        input: { windowEvents: false, keyboard: true, mouse: { preventDefaultWheel: true } },
      })
      observer = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect
        if (width > 0 && height > 0) game?.scale.resize(width, height)
      })
      observer.observe(element!)
    }

    start().catch(() => { if (!canceled) setError(true) })
    return () => {
      canceled = true
      observer?.disconnect()
      controller.current = null
      game?.destroy(true)
    }
  }, [])

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#101b21]" aria-label="Interactive Subswarm village">
      <div ref={host} tabIndex={0} onPointerDownCapture={(event) => event.currentTarget.focus({ preventScroll: true })} className="absolute inset-0 outline-none" role="application" aria-label="Village map. Use WASD or arrow keys to walk. Click a sign to open a provider. Press E near an entrance." />
      {!ready && <div className="absolute inset-0 flex items-center justify-center bg-[#152429] text-sm text-[#e6dbc0]">{error ? 'The village could not load. Refresh to try again.' : 'Opening the village...'}</div>}

      <div className="absolute bottom-3 right-3 flex items-center overflow-hidden rounded-md border border-[#9ea382]/30 bg-[#172a2b]/80 text-[#e8dfc6] backdrop-blur-sm md:bottom-4 md:right-4">
        <button type="button" aria-label="Zoom out" onClick={() => controller.current?.zoom(-1)} className="h-8 w-8 cursor-pointer border-r border-[#9ea382]/20 hover:bg-[#41534a]">-</button>
        <button type="button" aria-label="Zoom in" onClick={() => controller.current?.zoom(1)} className="h-8 w-8 cursor-pointer border-r border-[#9ea382]/20 hover:bg-[#41534a]">+</button>
        <button type="button" aria-label="Toggle whole village view" onClick={() => controller.current?.recenter()} className="h-8 cursor-pointer px-2.5 text-[10px] hover:bg-[#41534a]">FIT</button>
      </div>

      <span className="sr-only" aria-live="polite">{nearby ? `Press E to enter ${nearby}` : ''}</span>
    </div>
  )
}
