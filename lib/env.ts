import { z } from 'zod';

/**
 * Validated environment config (contracts/api.md "Core libs").
 *
 * Design:
 * - One `env` export whose properties are lazy getters. Nothing is validated at
 *   import time, so `next build` works on a fresh checkout without `.env.local`;
 *   validation runs on first access and the result is cached.
 * - Variables are split into two groups. Reading any variable in a group
 *   validates the whole group, so a misconfigured deploy reports every
 *   offending variable at once, by name.
 *   - client: `NEXT_PUBLIC_*`, read via static `process.env.NEXT_PUBLIC_X`
 *     references so Next inlines them into the browser bundle.
 *   - server: everything else, read from `process.env` only on the server.
 * - Reading a server variable in the browser throws a clear error instead of
 *   returning `undefined`. Server values are never referenced statically, so
 *   they can't be inlined into a client bundle.
 */

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

const required = z.preprocess(emptyToUndefined, z.string({ error: 'is required' }).trim());
const requiredUrl = z.preprocess(
  emptyToUndefined,
  z.url({ error: (iss) => (iss.input === undefined ? 'is required' : 'must be a valid URL') }),
);
const optional = z.preprocess(emptyToUndefined, z.string().trim().optional());

const booleanFlag = z.preprocess(
  (v) => emptyToUndefined(v) ?? 'false',
  z
    .string()
    .trim()
    .toLowerCase()
    .refine((s) => ['true', 'false', '1', '0'].includes(s), {
      error: 'must be one of true, false, 1, 0',
    })
    .transform((s) => s === 'true' || s === '1'),
);

const csv = z.preprocess(
  (v) => v ?? '',
  z.string().transform((s) =>
    s
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  ),
);

export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: requiredUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required,
});

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: required,
  DATABASE_URL: requiredUrl,
  RESEND_API_KEY: optional,
  SENTRY_DSN: optional,
  APP_URL: requiredUrl,
  CRON_SECRET: required,
  FEATURE_SAML: booleanFlag,
  SSO_PROVIDERS: csv,
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type Env = Readonly<ClientEnv & ServerEnv>;

export class EnvError extends Error {
  readonly variables: string[];

  constructor(issues: readonly z.core.$ZodIssue[]) {
    const lines = issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    super(
      `Invalid environment variables:\n${lines.join('\n')}\n` +
        'Set them in .env.local (see .env.example) or your deployment settings.',
    );
    this.name = 'EnvError';
    this.variables = [...new Set(issues.map((issue) => String(issue.path[0] ?? '')))];
  }
}

type Source = Record<string, string | undefined>;

function parseWith<S extends z.ZodType>(schema: S, source: Source): z.output<S> {
  const result = schema.safeParse(source);
  if (!result.success) throw new EnvError(result.error.issues);
  return result.data;
}

export function parseClientEnv(source: Source): ClientEnv {
  return parseWith(clientEnvSchema, source);
}

export function parseServerEnv(source: Source): ServerEnv {
  return parseWith(serverEnvSchema, source);
}

let clientCache: ClientEnv | undefined;
let serverCache: ServerEnv | undefined;

function readClientEnv(): ClientEnv {
  // Static references only: Next replaces these with literals at build time.
  clientCache ??= parseClientEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return clientCache;
}

function readServerEnv(key: keyof ServerEnv): ServerEnv[keyof ServerEnv] {
  if (typeof window !== 'undefined') {
    throw new Error(
      `env.${key} is a server-only variable and cannot be read in the browser. ` +
        'Read it in server code and pass the value down, or use a NEXT_PUBLIC_* variable.',
    );
  }
  serverCache ??= parseServerEnv(process.env);
  return serverCache[key];
}

const envObject = {};
for (const key of clientEnvSchema.keyof().options) {
  Object.defineProperty(envObject, key, { enumerable: true, get: () => readClientEnv()[key] });
}
for (const key of serverEnvSchema.keyof().options) {
  Object.defineProperty(envObject, key, { enumerable: true, get: () => readServerEnv(key) });
}

export const env = Object.freeze(envObject) as Env;

/** Test-only: drop cached values so the next access re-reads `process.env`. */
export function resetEnvCacheForTests(): void {
  clientCache = undefined;
  serverCache = undefined;
}
