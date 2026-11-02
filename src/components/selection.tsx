'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

interface SelectionCtx {
  ids: Set<string>
  toggle: (id: string) => void
  setMany: (ids: string[], selected: boolean) => void
  clear: () => void
  has: (id: string) => boolean
}

const Ctx = createContext<SelectionCtx | null>(null)
const KEY = 'pf-selection'

/** Prospect selection persisted in localStorage so it survives navigation between modules. */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) setIds(new Set(JSON.parse(raw) as string[]))
    } catch {
      /* storage unavailable */
    }
  }, [])
  const persist = useCallback((s: Set<string>) => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...s].slice(0, 5000)))
    } catch {
      /* ignore */
    }
    return s
  }, [])
  const value = useMemo<SelectionCtx>(
    () => ({
      ids,
      has: (id) => ids.has(id),
      toggle: (id) =>
        setIds((prev) => {
          const n = new Set(prev)
          if (n.has(id)) n.delete(id)
          else n.add(id)
          return persist(n)
        }),
      setMany: (list, selected) =>
        setIds((prev) => {
          const n = new Set(prev)
          for (const id of list) {
            if (selected) n.add(id)
            else n.delete(id)
          }
          return persist(n)
        }),
      clear: () => setIds(persist(new Set())),
    }),
    [ids, persist],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSelection(): SelectionCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('SelectionProvider manquant')
  return c
}
