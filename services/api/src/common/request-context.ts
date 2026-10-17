import { AsyncLocalStorage } from 'node:async_hooks';

/** Per-request data that deep layers (e.g. the provider call log) need without threading params. */
export interface RequestContext {
  /** Pseudonymous id of the user the work is for (never the uid). */
  readonly uidHash: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}
