import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../common/errors.js';
import {
  TokenRejectedError,
  VerifierUnavailableError,
  type TokenVerifier,
  type VerifiedIdentity,
} from './verifier.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth hook on every /v1 route. Read it with `requireAuth(request)`. */
    auth: VerifiedIdentity | null;
  }
}

export interface AuthHookOptions {
  verifier: TokenVerifier;
  appCheckEnforced: boolean;
}

/** One generic answer for every auth failure, so clients learn nothing about why. */
function unauthenticated(): AppError {
  return new AppError('UNAUTHENTICATED', 401, 'Authentication required');
}

/** Extracts the token from `Authorization: Bearer <token>`. */
function bearerToken(
  header: string | undefined,
): { token: string } | { failure: 'missing_authorization' | 'bad_scheme' } {
  if (!header) return { failure: 'missing_authorization' };
  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
  return match?.[1] ? { token: match[1] } : { failure: 'bad_scheme' };
}

export function decorateAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
}

/**
 * Adds authentication to every route registered in `scope` (the /v1 prefix).
 * The uid comes only from the verified ID token, never from headers, path, query or body.
 */
export function addAuthHook(scope: FastifyInstance, options: AuthHookOptions): void {
  scope.addHook('onRequest', async (request) => {
    const bearer = bearerToken(request.headers.authorization);
    if ('failure' in bearer) {
      request.log.warn({ authFailure: bearer.failure }, 'authentication failed');
      throw unauthenticated();
    }

    try {
      if (options.appCheckEnforced) {
        const appCheck = request.headers['x-firebase-appcheck'];
        if (typeof appCheck !== 'string' || appCheck.length === 0) {
          request.log.warn({ authFailure: 'app_check_missing' }, 'authentication failed');
          throw unauthenticated();
        }
        await options.verifier.verifyAppCheckToken(appCheck);
      }
      request.auth = await options.verifier.verifyIdToken(bearer.token);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof TokenRejectedError) {
        request.log.warn({ authFailure: error.reason }, 'authentication failed');
        throw unauthenticated();
      }
      if (error instanceof VerifierUnavailableError) {
        request.log.error({ err: error }, 'token verification unavailable');
        throw new AppError('SERVICE_UNAVAILABLE', 503, 'Service temporarily unavailable', {
          retryable: true,
        });
      }
      throw error;
    }
  });
}

/** Returns the verified identity. Only valid inside the authenticated /v1 scope. */
export function requireAuth(request: FastifyRequest): VerifiedIdentity {
  if (!request.auth) {
    // Programming error: a route outside the /v1 scope asked for the user.
    throw new Error('requireAuth called on an unauthenticated route');
  }
  return request.auth;
}
