import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
const dir = process.argv[2]
const b = await chromium.launch()
for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  for (const [w, h, suffix] of [[1280, 900, 'd'], [390, 844, 'm']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } })
    await p.goto('file://' + dir + '/' + f, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(300)
    await p.screenshot({ path: `${dir}/${f.replace('.html', '')}-${suffix}.png`, fullPage: suffix === 'd' })
    await p.close()
  }
}
await b.close()
