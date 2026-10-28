"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { NetworkSnapshot, Provider, ProviderId } from '@subswarm/shared';
import { api } from '@/lib/api';

export interface ResidentState {
  snapshot?: NetworkSnapshot;
  loading: boolean;
  error?: string;
}

export function useResidents(providers: Provider[], enabled: boolean) {
  const [residents, setResidents] = useState<Partial<Record<ProviderId, ResidentState>>>({});
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(new Map<ProviderId, Promise<void>>());

  const load = useCallback((provider: Provider, signal: AbortSignal): Promise<void> => {
    const existing = pending.current.get(provider.id);
    if (existing) return existing;
    setResidents(previous => ({ ...previous, [provider.id]: { ...previous[provider.id], loading: true, error: undefined } }));
    const request = api<NetworkSnapshot>(`/v1/providers/${provider.id}/residents`, { signal }, 55_000)
      .then(snapshot => {
        if (snapshot.network !== provider.network || snapshot.netuid !== provider.netuid) throw new Error('The registry returned a different subnet.');
        if (!signal.aborted) setResidents(previous => ({ ...previous, [provider.id]: { snapshot, loading: false } }));
      }).catch(error => {
        if (!signal.aborted) setResidents(previous => ({ ...previous, [provider.id]: { ...previous[provider.id], loading: false, error: error instanceof Error ? error.message : 'Residents could not be loaded.' } }));
      }).finally(() => { if (pending.current.get(provider.id) === request) pending.current.delete(provider.id); });
    pending.current.set(provider.id, request);
    return request;
  }, []);

  useEffect(() => {
    if (!enabled || !providers.length) return;
    const controller = new AbortController();
    lifetime.current = controller;
    const requests = pending.current;
    const queue = providers.filter(provider => provider.id !== 'network' && provider.network && provider.netuid !== null);
    async function worker() {
      while (!controller.signal.aborted) {
        const provider = queue.shift();
        if (!provider) return;
        await load(provider, controller.signal);
      }
    }
    void Promise.all([worker(), worker()]);
    return () => { controller.abort(); requests.clear(); lifetime.current = null; };
  }, [providers, enabled, load]);

  const refresh = useCallback((id: ProviderId) => {
    const provider = providers.find(item => item.id === id);
    if (provider && lifetime.current) void load(provider, lifetime.current.signal);
  }, [providers, load]);

  return { residents, refresh };
}
