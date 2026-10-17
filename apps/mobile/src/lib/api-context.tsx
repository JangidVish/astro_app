import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApiClient, type ApiClient } from './api-client';
import { API_BASE_URL } from './config';

const ApiContext = createContext<ApiClient | null>(null);

export interface ApiProviderProps {
  children: ReactNode;
  /** Returns the signed-in user's Firebase ID token (T8.2), or null. */
  getIdToken: () => Promise<string | null>;
  getAppCheckToken?: () => Promise<string | null>;
  /** Tests can pass a prepared client. */
  client?: ApiClient;
}

export function ApiProvider({ children, getIdToken, getAppCheckToken, client }: ApiProviderProps) {
  const value = useMemo(
    () =>
      client ??
      createApiClient({
        baseUrl: API_BASE_URL,
        getIdToken,
        ...(getAppCheckToken ? { getAppCheckToken } : {}),
      }),
    [client, getIdToken, getAppCheckToken],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside ApiProvider');
  return api;
}
