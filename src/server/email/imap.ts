import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { sql } from '../core/db'
import { env } from '../core/env'
import { NotConfiguredError } from '../core/errors'
import { getSecret } from '../core/settings'
import { processInbound } from './inbound'

/** Poll the IMAP inbox for new messages since the last processed UID. */
export async function syncImap(log: (m: string) => Promise<void> | void = () => {}): Promise<{ fetched: number; processed: number }> {
  const e = env()
  const password = await getSecret('IMAP_PASSWORD')
  if (!e.IMAP_HOST || !e.IMAP_USER || !password) throw new NotConfiguredError('IMAP', 'IMAP_HOST / IMAP_USER / IMAP_PASSWORD requis')
  const db = sql()
  const [cursor] = await db<{ value: { uid: number; uidValidity: string } }[]>`select value from kv_store where key = 'imap:inbox'`
  const client = new ImapFlow({ host: e.IMAP_HOST, port: e.IMAP_PORT, secure: e.IMAP_PORT === 993, auth: { user: e.IMAP_USER, pass: password }, logger: false })
  await client.connect()
  let fetched = 0
  let processed = 0
  try {
    const lock = await client.getMailboxLock('INBOX')
    try {
      const mb = client.mailbox
      const validity = mb && typeof mb === 'object' ? String(mb.uidValidity) : ''
      const from = cursor && cursor.value.uidValidity === validity ? cursor.value.uid + 1 : 1
      let maxUid = cursor?.value.uid ?? 0
      for await (const msg of client.fetch(`${from}:*`, { uid: true, source: true, internalDate: true }, { uid: true })) {
        if (msg.uid < from) continue
        fetched++
        maxUid = Math.max(maxUid, msg.uid)
        if (!msg.source) continue
        const parsed = await simpleParser(msg.source)
        const headers: Record<string, string> = {}
        for (const [k, v] of parsed.headers) headers[k] = typeof v === 'string' ? v : JSON.stringify(v)
        const r = await processInbound({
          from: parsed.from?.value[0]?.address ?? '',
          to: Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text,
          subject: parsed.subject ?? '',
          text: parsed.text ?? '',
          messageId: parsed.messageId ?? null,
          inReplyTo: typeof parsed.inReplyTo === 'string' ? parsed.inReplyTo : null,
          references: Array.isArray(parsed.references) ? parsed.references.join(' ') : (parsed.references ?? null),
          headers,
          receivedAt: msg.internalDate instanceof Date ? msg.internalDate : new Date(),
          attachments: (parsed.attachments ?? []).map((a) => ({ filename: a.filename ?? 'pièce jointe', contentType: a.contentType, size: a.size })),
          source: 'imap',
        })
        if (!r.duplicate) processed++
      }
      await db`insert into kv_store (key, value) values ('imap:inbox', ${db.json({ uid: maxUid, uidValidity: validity })})
               on conflict (key) do update set value = excluded.value, updated_at = now()`
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => undefined)
  }
  await log(`IMAP : ${fetched} message(s) lus, ${processed} nouveau(x)`)
  return { fetched, processed }
}
