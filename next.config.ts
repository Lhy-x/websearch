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
  outputFileTracingIncludes: { '/*': ['./vendor/premium-3d-glass/**/*'] },
  distDir: process.env.NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['playwright', 'postgres', 'imapflow', 'nodemailer', 'mailparser', 'archiver', 'exceljs', 'hyparquet', 'hyparquet-compressors','basic-ftp'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }, { source: '/purchase/:path*', headers: [{key:'Referrer-Policy',value:'no-referrer'},{key:'Cache-Control',value:'private, no-store'},{key:'X-Robots-Tag',value:'noindex, nofollow'}] }]
  },
}
export default config
