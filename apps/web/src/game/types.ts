import type { Participant, ProviderId } from '@subswarm/shared'

export interface WorldState {
  selectedProvider: ProviderId | null
  busyProvider: ProviderId | null
  participants: Participant[]
  participantSubnet?: number
}

export interface WorldBridge {
  getState: () => WorldState
  selectProvider: (id: ProviderId) => void
  nearby: (name: string | null) => void
  ready: () => void
}

export interface WorldController {
  zoom: (direction: number) => void
  recenter: () => void
}
