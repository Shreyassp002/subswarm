import type { NetworkSnapshot, ProviderId } from '@subswarm/shared'
import type { VillageBuildingId } from './village'

export interface WorldState {
  selectedProvider: VillageBuildingId | null
  busyProvider: ProviderId | null
  residents: Partial<Record<ProviderId, NetworkSnapshot>>
}

export interface WorldBridge {
  getState: () => WorldState
  selectProvider: (id: VillageBuildingId) => void
  selectResident: (id: ProviderId, uid: number) => void
  nearby: (name: string | null) => void
  ready: () => void
}

export interface WorldController {
  zoom: (direction: number) => void
  recenter: () => void
}
