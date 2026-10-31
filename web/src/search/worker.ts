/// <reference lib="webworker" />
import { get, set } from 'idb-keyval'
import type { IndexRow } from '../lib/types'
import { buildIndex, search } from './rank'

type In = { type: 'query'; id: number; q: string; limit?: number } | { type: 'lookup'; id: number; ids: number[] }

let idx: ReturnType<typeof buildIndex> | null = null
let ready: Promise<void>

async function load(): Promise<void> {
  let cached: { version: string; items: IndexRow[] } | undefined
  try {
    cached = await get('konomi-catalog')
  } catch {
    cached = undefined
  }
  if (cached) idx = buildIndex(cached.items)
  const refresh = fetch('/api/catalog/index', { credentials: 'include' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { version: string; items: IndexRow[] } | null) => {
      if (!data || data.version === cached?.version) return
      idx = buildIndex(data.items)
      set('konomi-catalog', data).catch(() => undefined)
      postMessage({ type: 'ready', count: data.items.length })
    })
    .catch(() => { if (!cached) postMessage({ type: 'error' }) })
  if (!cached) await refresh
  else postMessage({ type: 'ready', count: cached.items.length })
}

ready = load()

onmessage = async (e: MessageEvent<In>) => {
  await ready
  const msg = e.data
  if (!idx) return
  if (msg.type === 'query') {
    postMessage({ type: 'result', id: msg.id, hits: search(idx, msg.q, msg.limit ?? 8) })
  } else {
    const rows = msg.ids.map((i) => idx!.byId.get(i)).filter(Boolean)
    postMessage({ type: 'rows', id: msg.id, rows })
  }
}
