import type { FastifyError, FastifyServerOptions } from 'fastify';
import { redact, redactUrl } from './redact.js';

type LoggerOptions = Exclude<NonNullable<FastifyServerOptions['logger']>, boolean>;

interface MinimalRequest {
  id: string;
  method: string;
  url: string;
}
interface MinimalReply {
  statusCode: number;
}

const SERIALIZED_KEYS = ['req', 'res', 'err'] as const;

function omit(object: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(object)) if (!keys.includes(key)) out[key] = value;
  return out;
}

/**
 * Pino options for Fastify. Every log object passes through `redact`, and request/response
 * serializers emit only method, path, id and status: never headers, bodies or query strings.
 * Output is JSON on stdout, which Cloud Logging ingests as structured logs.
 */
export function loggerOptions(level: string): LoggerOptions {
  return {
    level,
    messageKey: 'message', // Cloud Logging reads `message`
    base: null, // no pid/hostname: Cloud Logging attaches resource labels itself
    formatters: {
      level: (label: string) => ({ severity: label.toUpperCase() }), // Cloud Logging severity
      // `req`, `res` and `err` are left for their serializers below, which run after this
      // formatter and only emit safe fields. Redacting them here would strip prototype getters
      // (e.g. request.url) and break serialization.
      log: (object: Record<string, unknown>) => {
        const out = redact(omit(object, SERIALIZED_KEYS)) as Record<string, unknown>;
        for (const key of SERIALIZED_KEYS) if (key in object) out[key] = object[key];
        return out;
      },
    },
    serializers: {
      req: (req: MinimalRequest) => ({ id: req.id, method: req.method, url: redactUrl(req.url) }),
      res: (res: MinimalReply) => ({ statusCode: res.statusCode }),
      // Keep the stack: Error Reporting groups crashes by it. Stacks hold code paths, not user data.
      err: (err: FastifyError) => ({
        ...(redact(err) as Record<string, unknown>),
        type: err.name,
        message: err.message,
        stack: err.stack ?? '',
      }),
    },
  };
}
