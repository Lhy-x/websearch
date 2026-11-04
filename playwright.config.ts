import { defineConfig } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'
import { mkdirSync, copyFileSync, chmodSync } from 'node:fs'
import path from 'node:path'

// The browser tests manage an offline CLI process, never a real Stripe account.
const stripeFixtureDir = path.resolve('storage-e2e/test-tools')
mkdirSync(stripeFixtureDir, { recursive: true })
copyFileSync('tests/fixtures/stripe-cli.cjs', path.join(stripeFixtureDir, 'stripe'))
chmodSync(path.join(stripeFixtureDir, 'stripe'), 0o700)

export const E2E_PASSWORD = 'e2e-password-123'
const salt = randomBytes(16)
const hash = ['scrypt', 16384, 8, 1, salt.toString('base64'), scryptSync(E2E_PASSWORD, salt, 64, { N: 16384, r: 8, p: 1 }).toString('base64')].join(':')

/**
 * E2E of the reference workflow. Uses a dedicated database (prospectforge_e2e) and the sandbox email
 * provider: no real email is ever sent. Starts the dashboard and a worker.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const env = {
  ...process.env,
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://pf:pf@localhost:5432/prospectforge_e2e',
  APP_BASE_URL: `http://localhost:${PORT}`,
  EMAIL_PROVIDER: 'sandbox',
  STORAGE_DIR: './storage-e2e',
  ADMIN_EMAIL: 'admin@e2e.local',
  ADMIN_PASSWORD_HASH: hash,
  SESSION_SECRET: 'e2e-session-secret-0123456789abcdefghij',
  APP_ENCRYPTION_KEY: 'e2e-encryption-key-0123456789abcdef',
  NEXT_DIST_DIR: '.next-e2e',
  PATH: `${stripeFixtureDir}${path.delimiter}${process.env.PATH ?? ''}`,
  PF_STRIPE_FIXTURE_MODE: 'ready',
} as Record<string, string>

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: `npx tsx scripts/migrate.ts && npx next dev -p ${PORT}`, url: `http://localhost:${PORT}/api/health`, env, timeout: 180_000, reuseExistingServer: false },
    { command: 'npx tsx src/worker/main.ts', env, wait: { stdout: /démarré/ }, timeout: 120_000, reuseExistingServer: false },
  ],
})
