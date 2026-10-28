import type { NetworkSnapshot, ProviderId } from '@subswarm/shared'

export interface WorldState {
  selectedProvider: ProviderId | null
  busyProvider: ProviderId | null
  residents: Partial<Record<ProviderId, NetworkSnapshot>>
}

export interface WorldBridge {
  getState: () => WorldState
  selectProvider: (id: ProviderId) => void
  selectResident: (id: ProviderId, uid: number) => void
  nearby: (name: string | null) => void
  ready: () => void
}

export interface WorldController {
  zoom: (direction: number) => void
  recenter: () => void
}
