import { z } from 'zod'

const schema = z.object({
  STRIPE_SECRET_KEY:z.string().default(''),
  STRIPE_WEBHOOK_SECRET:z.string().default(''),
  STRIPE_TEST_SECRET_KEY:z.string().default(''),
  STRIPE_TEST_WEBHOOK_SECRET:z.string().default(''),
  DATABASE_URL: z.string().min(1).default('postgres://pf:pf@localhost:5432/prospectforge'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_EMAIL: z.string().default(''),
  ADMIN_PASSWORD_HASH: z.string().default(''),
  SESSION_SECRET: z.string().default(''),
  APP_ENCRYPTION_KEY: z.string().default(''),
  STORAGE_DIR: z.string().default('./storage'),
  ANTHROPIC_API_KEY: z.string().default(''),
  OPENAI_API_KEY: z.string().default(''),
  OPENROUTER_API_KEY: z.string().default(''),
  OVERTURE_RELEASE: z.string().default(''),
  INSEE_SIRENE_API_KEY: z.string().default(''),
  GOOGLE_PLACES_API_KEY: z.string().default(''),
  OVERPASS_URL: z.string().default('https://overpass-api.de/api/interpreter'),
  CRAWLER_CONTACT: z.string().default(''),
  EMAIL_PROVIDER: z.enum(['sandbox', 'resend', 'smtp']).default('sandbox'),
  RESEND_API_KEY: z.string().default(''),
  RESEND_WEBHOOK_SECRET: z.string().default(''),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  IMAP_HOST: z.string().default(''),
  IMAP_PORT: z.coerce.number().default(993),
  IMAP_SECURE: z.enum(['true', 'false']).default('true'),
  IMAP_USER: z.string().default(''),
  IMAP_PASSWORD: z.string().default(''),
  INBOUND_WEBHOOK_SECRET: z.string().default(''),
  O2SWITCH_FTP_PASSWORD:z.string().default(''),
  O2SWITCH_CPANEL_TOKEN:z.string().default(''),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  NODE_ENV: z.string().default('development'),
})

export type Env = z.infer<typeof schema>
let cached: Env | null = null

/** Validated environment. Empty strings are treated as "not configured". */
export function env(): Env {
  if (cached) return cached
  const raw: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(process.env)) raw[k] = v === '' ? undefined : v
  cached = schema.parse(raw)
  return cached
}

/** For tests only. */
export function resetEnvCache() {
  cached = null
}
