import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { MAX_BODY_BYTES, toValidationDetails, type ApiError } from '@astro/shared';
import type { Config } from './common/config.js';
import { AppError } from './common/errors.js';
import { loggerOptions } from './common/logger.js';
import { addAuthHook, decorateAuth } from './modules/auth/hook.js';
import type { TokenVerifier } from './modules/auth/verifier.js';

/** External services the app depends on. Real implementations in server.ts; fakes in tests. */
export interface AppDeps {
  verifier: TokenVerifier;
}

/** Registers routes inside the authenticated /v1 scope. One per feature module. */
export type V1Module = (scope: FastifyInstance) => void | Promise<void>;

export interface BuildAppOptions {
  deps: AppDeps;
  /** Feature route modules, mounted under /v1 behind authentication. */
  modules?: readonly V1Module[];
  /** Test hook: capture log output instead of writing to stdout. */
  logStream?: { write(line: string): void };
}

const SECURITY_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

/**
 * Local development only: lets the app's web build (served by Expo on this computer, a different
 * port) call the API from a browser. Never enabled in test, staging or prod; the native app does
 * not need CORS.
 */
function isLocalDevOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function addLocalDevCors(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (!isLocalDevOrigin(origin)) return;
    void reply.headers({ 'access-control-allow-origin': origin, vary: 'Origin' });
    if (request.method === 'OPTIONS') {
      // Preflight: answer before authentication, which would otherwise reject it.
      await reply
        .headers({
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE',
          'access-control-allow-headers': 'authorization, content-type, x-firebase-appcheck',
          'access-control-max-age': '600',
        })
        .status(204)
        .send();
    }
  });
}

function errorBody(error: AppError): ApiError {
  return {
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.options.details ? { details: error.options.details } : {}),
    },
  };
}

/** Maps any thrown value to the API's stable error shape. Never exposes stacks or internals. */
function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return AppError.validation(toValidationDetails(error));

  const fastifyError = error as Partial<FastifyError>;
  const status = fastifyError.statusCode;
  if (status === 413 || fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new AppError('PAYLOAD_TOO_LARGE', 413, 'Request body too large');
  }
  if (status === 415 || fastifyError.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return new AppError('VALIDATION_FAILED', 415, 'Unsupported content type');
  }
  if (status !== undefined && status >= 400 && status < 500) {
    // Malformed JSON, empty JSON body, bad content-length and other client errors from Fastify.
    return new AppError('VALIDATION_FAILED', status, 'Malformed request');
  }
  return null; // unexpected: becomes 500
}

export function buildApp(config: Config, options: BuildAppOptions): FastifyInstance {
  const logger = loggerOptions(config.logLevel);
  const app = Fastify({
    logger: options.logStream ? { ...logger, stream: options.logStream } : logger,
    bodyLimit: MAX_BODY_BYTES,
    // Cloud Run terminates TLS at its proxy; trust it only when deployed there.
    trustProxy: config.env === 'staging' || config.env === 'prod',
    // Never trust client-supplied request ids; they end up in logs.
    requestIdHeader: false,
    genReqId: () => randomUUID(),
  });

  app.addHook('onSend', async (request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    reply.header('x-request-id', request.id);
    return payload;
  });

  if (config.env === 'local') addLocalDevCors(app);

  app.setErrorHandler((error, request, reply) => {
    const appError = toAppError(error);
    if (appError) {
      if (appError.status >= 500) request.log.error({ err: error }, 'request failed');
      if (appError.options.headers) void reply.headers(appError.options.headers);
      return reply.status(appError.status).send(errorBody(appError));
    }
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(errorBody(new AppError('INTERNAL', 500, 'Internal error', { retryable: true })));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorBody(AppError.notFound()));
  });

  /** Liveness probe for Cloud Run and uptime checks. Public, reveals nothing about the build. */
  app.get('/healthz', () => ({ status: 'ok' }));

  // Everything under /v1 requires a verified Firebase ID token (and App Check when enforced).
  decorateAuth(app);
  void app.register(
    async (v1) => {
      addAuthHook(v1, {
        verifier: options.deps.verifier,
        appCheckEnforced: config.appCheckEnforced,
      });
      for (const registerModule of options.modules ?? []) await registerModule(v1);
    },
    { prefix: '/v1' },
  );

  return app;
}
