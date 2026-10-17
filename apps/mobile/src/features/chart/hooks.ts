import { useQuery } from '@tanstack/react-query';
import type { ChartType, Graha } from '@astro/shared';
import { useApi } from '@/lib/api-context';
import { profileKeys } from '@/features/profiles/hooks';

/** Chart data never changes for fixed birth inputs (the server caches it): keep it for the session. */
const FOREVER = Infinity;

export function useChart(profileId: string, type: ChartType, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...profileKeys.readings(profileId), 'chart', type],
    queryFn: () => api.getChart(profileId, type),
    enabled,
    staleTime: FOREVER,
  });
}

export function usePlanets(profileId: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...profileKeys.readings(profileId), 'planets'],
    queryFn: () => api.getPlanets(profileId),
    staleTime: FOREVER,
  });
}

export function useDasha(profileId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: [...profileKeys.readings(profileId), 'dasha'],
    queryFn: () => api.getDasha(profileId),
    enabled,
    // "current" depends on today's date; refresh hourly.
    staleTime: 60 * 60_000,
  });
}

export function useAntardashas(profileId: string, md: Graha | null) {
  const api = useApi();
  return useQuery({
    queryKey: [...profileKeys.readings(profileId), 'antardasha', md],
    queryFn: () => api.getAntardashas(profileId, md as Graha),
    enabled: md !== null,
    staleTime: FOREVER,
  });
}

export function usePrediction(profileId: string, date: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...profileKeys.readings(profileId), 'prediction', date],
    queryFn: () => api.getPrediction(profileId, date),
    staleTime: 60 * 60_000,
  });
}
