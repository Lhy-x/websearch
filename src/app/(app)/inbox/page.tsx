import { Suspense } from 'react'
import { PageHeader } from '@/components/ui/primitives'
import { getRuntimeConfig, getSecret } from '@/server/core/settings'
import { InboxClient } from './client'

export const metadata = { title: 'Boîte de réception' }

export default async function InboxPage() {
  const [e,webhook]=await Promise.all([getRuntimeConfig(),getSecret('INBOUND_WEBHOOK_SECRET')])
  const channels = [e.IMAP_HOST ? `IMAP (${e.IMAP_HOST})` : null, webhook ? 'webhook entrant' : null].filter(Boolean)
  return (
    <>
      <PageHeader title="Boîte de réception" description={channels.length ? `Réponses reçues via ${channels.join(' et ')}. Classement automatique, réponses toujours validées par vous.` : 'Aucun canal entrant configuré (IMAP ou webhook) : vous pouvez saisir une réponse reçue manuellement.'} />
      <Suspense><InboxClient /></Suspense>
    </>
  )
}
