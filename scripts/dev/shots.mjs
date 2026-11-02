import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
const out = process.argv[2]
const B = 'http://localhost:3300'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const p = await ctx.newPage()
await p.goto(B + '/login')
await p.getByLabel('Email').fill('admin@example.com')
await p.getByLabel('Mot de passe').fill('prospectforge-dev')
await p.getByRole('button', { name: 'Se connecter' }).click()
await p.waitForURL(B + '/')
for (const [n, u] of [['dashboard', '/'], ['prospects', '/prospects?websiteFilter=no_website'], ['qualification', '/qualification'], ['settings', '/settings']]) {
  await p.goto(B + u); await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/${n}.png` })
}
const id = execSync(`sudo -u postgres psql -d prospectforge -tAc "select id from businesses order by score desc limit 1"`).toString().trim()
await p.goto(B + '/prospects/' + id); await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/prospect.png`, fullPage: false })
await p.emulateMedia({ colorScheme: 'dark' })
await p.goto(B + '/'); await p.evaluate(() => { document.documentElement.classList.add('dark') }); await p.waitForTimeout(800); await p.screenshot({ path: `${out}/dashboard-dark.png` })
await b.close()
