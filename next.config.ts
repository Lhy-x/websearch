import type { NextConfig } from 'next'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['playwright', 'postgres', 'imapflow', 'nodemailer', 'mailparser', 'archiver', 'exceljs', 'hyparquet', 'hyparquet-compressors'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}
export default config
