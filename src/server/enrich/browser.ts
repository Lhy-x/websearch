import type { Browser } from 'playwright'

const g = globalThis as unknown as { __pfBrowser?: Promise<Browser> }

/** Shared headless Chromium (one per process). */
export async function getBrowser(): Promise<Browser> {
  if (!g.__pfBrowser) {
    g.__pfBrowser = (async () => {
      const { chromium } = await import('playwright')
      const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      return chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] })
    })()
    g.__pfBrowser.catch(() => (g.__pfBrowser = undefined))
  }
  return g.__pfBrowser
}

export async function closeBrowser() {
  if (g.__pfBrowser) {
    const b = await g.__pfBrowser.catch(() => null)
    g.__pfBrowser = undefined
    await b?.close()
  }
}
