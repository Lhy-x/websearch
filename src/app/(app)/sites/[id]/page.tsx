import { notFound } from 'next/navigation'
import { sql } from '@/server/core/db'
import { getSettings } from '@/server/core/settings'
import { getWebsiteVersion } from '@/server/sites/service'
import { previewUrl } from '@/server/proposals/service'
import { Editor } from './editor'

export const dynamic = 'force-dynamic'

export default async function SiteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = sql()
  const [site] = await db<{ id: string; business_id: string; business_name: string; status: string; preview_token: string; preview_enabled: boolean; preview_expires_at: Date | null; generator: string | null; model: string | null; error: string | null }[]>`
    select g.id, g.business_id, b.name business_name, g.status, g.preview_token, g.preview_enabled, g.preview_expires_at, g.generator, g.model, g.error
    from generated_websites g join businesses b on b.id = g.business_id where g.id = ${id}`
  if (!site) notFound()
  const v = await getWebsiteVersion(id)
  const versions = await db<{ version: number; created_by: string; note: string | null; created_at: Date }[]>`select version, created_by, note, created_at from website_versions where website_id = ${id} order by version desc`
  const shots = await db<{ kind: string; path: string; version: number }[]>`select kind, path, version from website_assets where website_id = ${id} and kind like 'screenshot%' order by created_at desc limit 6`
  const settings = await getSettings()
  return (
    <Editor
      site={{ ...site, preview_expires_at: site.preview_expires_at?.toISOString() ?? null, previewUrl: previewUrl(site.preview_token, settings.sites.previewBaseUrl) }}
      initial={v ? { version: v.version, config: v.config } : null}
      versions={versions.map((x) => ({ ...x, created_at: x.created_at.toISOString() }))}
      shots={shots}
    />
  )
}
