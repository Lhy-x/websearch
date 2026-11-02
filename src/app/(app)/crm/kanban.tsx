'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { ScorePill } from '@/components/badges'
import { api, cn, fmtDate, fmtEur } from '@/lib/utils'

interface CardData { id: string; name: string; city: string | null; score: number | null; pipeline_status: string; amount: number | null; next_task: string | null }

/** Drag & drop between columns (native HTML5 DnD) + keyboard-accessible select on each card. */
export function Kanban({ columns, cards }: { columns: { id: string; label: string }[]; cards: CardData[] }) {
  const router = useRouter()
  const [items, setItems] = useState(cards)
  const [over, setOver] = useState<string | null>(null)
  const move = async (id: string, status: string) => {
    const prev = items
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, pipeline_status: status } : x)))
    try {
      await api(`/api/prospects/${id}`, { method: 'POST', json: { action: 'set_status', status } })
      router.refresh()
    } catch (e) {
      setItems(prev)
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {columns.map((col) => {
        const list = items.filter((c) => c.pipeline_status === col.id)
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOver(col.id) }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) void move(id, col.id) }}
            className={cn('w-64 shrink-0 rounded-xl border border-border bg-panel-2/60 p-2', over === col.id && 'border-primary')}
          >
            <p className="mb-2 flex justify-between px-1 text-xs font-medium"><span>{col.label}</span><span className="text-muted">{list.length}</span></p>
            <div className="space-y-2">
              {list.map((c) => (
                <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} className="cursor-grab rounded-lg border border-border bg-panel p-2.5 text-xs shadow-sm active:cursor-grabbing">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/prospects/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link>
                    <ScorePill score={c.score} />
                  </div>
                  <p className="mt-0.5 text-muted">{c.city}{c.amount ? ` · ${fmtEur(c.amount)}` : ''}</p>
                  {c.next_task ? <p className="mt-0.5 text-warning">Rappel {fmtDate(c.next_task)}</p> : null}
                  <select aria-label={`Déplacer ${c.name}`} value={c.pipeline_status} onChange={(e) => move(c.id, e.target.value)} className="mt-1.5 w-full rounded border border-border bg-panel px-1 py-0.5 text-[11px]">
                    {columns.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function TaskToggle({ businessId, taskId }: { businessId: string | null; taskId: string }) {
  const router = useRouter()
  return (
    <input
      type="checkbox"
      className="mt-1"
      aria-label="Marquer comme faite"
      onChange={async () => {
        if (businessId) await api(`/api/prospects/${businessId}`, { method: 'POST', json: { action: 'task_done', taskId, done: true } })
        else await api('/api/crm', { method: 'POST', json: { taskId } })
        router.refresh()
      }}
    />
  )
}
