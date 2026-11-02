import { defineConfig } from '@playwright/test'
import { randomBytes, scryptSync } from 'node:crypto'

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
} as Record<string, string>

export default defineConfig({
  testDir: 'tests/e2e',
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
