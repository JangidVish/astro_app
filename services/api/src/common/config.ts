import { z } from 'zod';

/**
 * "demo" is a hosted proof of concept (e.g. a free host for a client trial): deployed like
 * staging, but App Check may be off because the app does not send App Check tokens yet.
 */
const APP_ENVS = ['local', 'test', 'staging', 'prod', 'demo'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Running on a real host: listens publicly, trusts the host's proxy, never uses emulators. */
export function isDeployed(env: AppEnv): boolean {
  return env === 'staging' || env === 'prod' || env === 'demo';
}

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

/** 32+ random bytes, base64-encoded (data-model.md principle 6). */
const MIN_PEPPER_BYTES = 32;

const envSchema = z
  .object({
    APP_ENV: z.enum(APP_ENVS),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    ASTRO_PROVIDER: z.enum(['astrologyapi', 'mock']),
    ASTROLOGYAPI_USER_ID: z.string().min(1).optional(),
    ASTROLOGYAPI_API_KEY: z.string().min(1).optional(),

    UID_HASH_PEPPER: z
      .string()
      .refine(
        (v) => Buffer.from(v, 'base64').length >= MIN_PEPPER_BYTES,
        `must be at least ${String(MIN_PEPPER_BYTES)} random bytes, base64-encoded`,
      ),

    FIREBASE_PROJECT_ID: z.string().min(1),
    APP_CHECK_ENFORCED: booleanString.default(true),

    QUOTA_PROVIDER_CALLS_PER_DAY: z.coerce.number().int().min(1).max(10_000).default(30),

    // Local only: listen on all interfaces so a phone on the same Wi-Fi can reach the dev API.
    LISTEN_ON_LAN: booleanString.default(false),

    // Set only for local/test. With these set, firebase-admin trusts emulator (unsigned) tokens.
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    FIRESTORE_EMULATOR_HOST: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const deployed = isDeployed(env.APP_ENV);
    if (env.APP_ENV === 'prod' && env.ASTRO_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['ASTRO_PROVIDER'],
        message: 'mock provider is not allowed in prod',
      });
    }
    if (deployed) {
      for (const key of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'] as const) {
        if (env[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'must not be set when deployed (emulators accept unsigned tokens)',
          });
        }
      }
    }
    if ((env.APP_ENV === 'staging' || env.APP_ENV === 'prod') && !env.APP_CHECK_ENFORCED) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_CHECK_ENFORCED'],
        message: 'must be true in staging and prod',
      });
    }
    if (env.LISTEN_ON_LAN && env.APP_ENV !== 'local') {
      ctx.addIssue({
        code: 'custom',
        path: ['LISTEN_ON_LAN'],
        message: 'is for local development only',
      });
    }
    if (env.ASTRO_PROVIDER === 'astrologyapi') {
      for (const key of ['ASTROLOGYAPI_USER_ID', 'ASTROLOGYAPI_API_KEY'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'required when ASTRO_PROVIDER=astrologyapi',
          });
        }
      }
    }
  });

export interface Config {
  readonly env: AppEnv;
  readonly port: number;
  readonly logLevel: string;
  readonly provider:
    | { readonly kind: 'mock' }
    | { readonly kind: 'astrologyapi'; readonly userId: string; readonly apiKey: string };
  readonly uidHashPepper: Buffer;
  readonly firebaseProjectId: string;
  readonly appCheckEnforced: boolean;
  readonly quotaProviderCallsPerDay: number;
  readonly listenOnLan: boolean;
}

/** Thrown when environment variables are invalid. The message names variables, never values. */
export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Report variable names and the rule broken; zod messages here never contain input values.
    const problems = parsed.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)';
      const reason =
        issue.code === 'invalid_type' && issue.input === undefined ? 'is required' : issue.message;
      return `${name}: ${reason}`;
    });
    throw new ConfigError(problems);
  }
  const env = parsed.data;
  return Object.freeze({
    env: env.APP_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    provider:
      env.ASTRO_PROVIDER === 'mock'
        ? { kind: 'mock' as const }
        : {
            kind: 'astrologyapi' as const,
            userId: env.ASTROLOGYAPI_USER_ID ?? '',
            apiKey: env.ASTROLOGYAPI_API_KEY ?? '',
          },
    uidHashPepper: Buffer.from(env.UID_HASH_PEPPER, 'base64'),
    firebaseProjectId: env.FIREBASE_PROJECT_ID,
    appCheckEnforced: env.APP_CHECK_ENFORCED,
    quotaProviderCallsPerDay: env.QUOTA_PROVIDER_CALLS_PER_DAY,
    listenOnLan: env.LISTEN_ON_LAN,
  });
}
