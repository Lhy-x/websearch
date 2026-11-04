#!/usr/bin/env node
// Offline Stripe CLI stand-in: never contacts Stripe or creates a payment.
// Dynamic import also works when this executable is copied without its .cjs extension.
import('node:fs').then(fs => {
const mode = process.env.PF_STRIPE_FIXTURE_MODE || 'ready'
if (!process.env.STRIPE_DEVICE_NAME) { console.error('Device name not configured'); process.exit(1) }
if (process.env.PF_STRIPE_FIXTURE_CAPTURE) fs.appendFileSync(process.env.PF_STRIPE_FIXTURE_CAPTURE, JSON.stringify({pid:process.pid,args:process.argv.slice(2),keyPresent:!!process.env.STRIPE_API_KEY,deviceName:process.env.STRIPE_DEVICE_NAME})+'\n')
if (mode === 'reject') { console.error('Invalid API Key provided: '+process.env.STRIPE_API_KEY); process.exit(1) }
process.on('SIGTERM', () => process.exit(0))
setInterval(() => {}, 1000)
if (mode !== 'hang') {
  const secret = 'whsec_0123456789abcdefghijklmnopqrstuvwxyzTESTONLY'
  process.stderr.write('\u001b[32mReady! Your webhook signing secret is '+secret.slice(0,25))
  setTimeout(() => process.stderr.write(secret.slice(25)+' (^C to quit)\u001b[0m\n'), 40)
  if (mode === 'exit') setTimeout(() => process.exit(1), 350)
}
})
