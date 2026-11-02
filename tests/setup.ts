// Tests run against a dedicated database; never the dev/prod one.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://pf:pf@localhost:5432/prospectforge_test'
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef-xyz'
process.env.APP_ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef'
process.env.APP_BASE_URL = 'http://localhost:3999'
process.env.ADMIN_EMAIL = 'admin@test.local'
process.env.EMAIL_PROVIDER = 'sandbox'
process.env.STORAGE_DIR = './storage-test'
