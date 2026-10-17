import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProfileCreateInput, ProfileUpdateInput } from '@astro/shared';
import { useApi } from '@/lib/api-context';

export const profileKeys = {
  all: ['profiles'] as const,
  list: () => [...profileKeys.all, 'list'] as const,
  one: (id: string) => [...profileKeys.all, id] as const,
  /** Everything derived from a profile's birth data (chart, dasha, predictions). */
  readings: (id: string) => ['readings', id] as const,
};

export function useProfiles() {
  const api = useApi();
  return useQuery({ queryKey: profileKeys.list(), queryFn: () => api.listProfiles() });
}

export function useProfile(id: string) {
  const api = useApi();
  return useQuery({ queryKey: profileKeys.one(id), queryFn: () => api.getProfile(id) });
}

/** After any profile change the list, the account (profile count) and readings may be stale. */
function useInvalidateAfterChange() {
  const queryClient = useQueryClient();
  return async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profileKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['me'] }),
      ...(id ? [queryClient.removeQueries({ queryKey: profileKeys.readings(id) })] : []),
    ]);
  };
}

export function useCreateProfile() {
  const api = useApi();
  const invalidate = useInvalidateAfterChange();
  return useMutation({
    mutationFn: (input: ProfileCreateInput) => api.createProfile(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProfile(id: string) {
  const api = useApi();
  const invalidate = useInvalidateAfterChange();
  return useMutation({
    mutationFn: (input: ProfileUpdateInput) => api.updateProfile(id, input),
    onSuccess: () => invalidate(id),
  });
}

export function useDeleteProfile() {
  const api = useApi();
  const invalidate = useInvalidateAfterChange();
  return useMutation({
    mutationFn: (id: string) => api.deleteProfile(id),
    onSuccess: (_data, id) => invalidate(id),
  });
}

/** Place search with a minimum query length; debouncing is done by the caller. */
export function usePlaceSearch(query: string) {
  const api = useApi();
  const q = query.trim();
  return useQuery({
    queryKey: ['places', q.toLowerCase()],
    queryFn: () => api.searchPlaces(q),
    enabled: [...q].length >= 3,
    staleTime: 24 * 60 * 60_000, // places do not change; the server caches for 30 days
  });
}
