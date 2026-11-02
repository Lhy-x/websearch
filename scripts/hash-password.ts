import { hashPassword } from '../src/server/core/crypto'

const pw = process.argv[2]
if (!pw || pw.length < 10) {
  console.error('Usage: npm run hash-password -- "mot-de-passe-de-10-caracteres-minimum"')
  process.exit(1)
}
hashPassword(pw).then((h) => console.log(`ADMIN_PASSWORD_HASH='${h}'`))
