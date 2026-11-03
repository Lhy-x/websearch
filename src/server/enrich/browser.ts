import type { Browser } from 'playwright'

const g = globalThis as unknown as { __pfBrowser?: Promise<Browser>; __pfWebGLBrowser?: Promise<Browser> }

/** Shared headless Chromium (one per process). */
export async function getBrowser(opts: { softwareWebGL?: boolean } = {}): Promise<Browser> {
  const key = opts.softwareWebGL ? '__pfWebGLBrowser' : '__pfBrowser'
  if (!g[key]) {
    g[key] = (async () => {
      const { chromium } = await import('playwright')
      const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      return chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage', ...(opts.softwareWebGL ? ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] : [])] })
    })()
    g[key]!.catch(() => (g[key] = undefined))
  }
  return g[key]!
}

export async function closeBrowser() {
  await Promise.all((['__pfBrowser', '__pfWebGLBrowser'] as const).map(async key => {
    const pending = g[key]
    g[key] = undefined
    const browser = await pending?.catch(() => null)
    await browser?.close()
  }))
}
