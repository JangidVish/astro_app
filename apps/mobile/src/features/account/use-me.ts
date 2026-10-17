import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/auth-context';
import { useApi } from '@/lib/api-context';

export const meQueryKey = (uid: string) => ['me', uid] as const;

/** The signed-in user's account (consent, profile count). Disabled while signed out. */
export function useMe() {
  const api = useApi();
  const { state } = useAuth();
  const uid = state.status === 'signedIn' ? state.user.uid : '';
  return useQuery({
    queryKey: meQueryKey(uid),
    queryFn: () => api.getMe(),
    enabled: state.status === 'signedIn',
  });
}
