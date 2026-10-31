import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { ApiError } from '../../lib/api'

interface Result { added: number; skipped: number; unmatched: number }

const ERR: Record<string, string> = {
  not_mal_xml: 'That file doesn’t look like a MyAnimeList export. On MAL: Profile → Export → Anime list.',
  too_large: 'That file is over 10 MB.',
  anilist_user_not_found: 'No public AniList list with that username.',
  rate_limited: 'AniList is busy. Try again in a minute.',
  anilist_unreachable: 'Can’t reach AniList right now.',
}

/** Bring a MAL export or a public AniList list over. Scores there only pick the feeling; duels do the rest. */
export function ImportPanel() {
  const qc = useQueryClient()
  const file = useRef<HTMLInputElement>(null)
  const [al, setAl] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function run(fn: () => Promise<Response>) {
    setBusy(true)
    setErr(null)
    setRes(null)
    try {
      const r = await fn()
      const body = await r.json()
      if (!r.ok) throw new ApiError(r.status, body?.detail?.code ?? `http_${r.status}`, body?.detail)
      setRes(body)
      qc.invalidateQueries()
    } catch (e) {
      setErr(e instanceof ApiError ? (ERR[e.code] ?? 'Import failed. Try again.') : 'Import failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  function uploadMal(f: File) {
    const fd = new FormData()
    fd.append('file', f)
    run(() => fetch('/api/import/mal', { method: 'POST', body: fd, credentials: 'include' }))
  }

  return (
    <div className="import">
      <div className="import-row">
        <input ref={file} type="file" accept=".xml,.gz,application/xml,text/xml" hidden
          onChange={(e) => e.target.files?.[0] && uploadMal(e.target.files[0])} />
        <button className="btn" disabled={busy} onClick={() => file.current?.click()}>Upload MyAnimeList export</button>
      </div>
      <form className="import-row" onSubmit={(e) => {
        e.preventDefault()
        if (al.trim()) run(() => fetch('/api/import/anilist', { method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: al.trim() }) }))
      }}>
        <input className="field import-al" placeholder="AniList username" value={al} onChange={(e) => setAl(e.target.value)} />
        <button className="btn" disabled={busy || !al.trim()}>Import from AniList</button>
      </form>
      {busy && <p className="muted">Importing…</p>}
      {res && (
        <p className="import-ok">
          Added <strong>{res.added}</strong>{res.skipped ? `, ${res.skipped} already on your chart` : ''}
          {res.unmatched ? `, ${res.unmatched} not in the catalogue` : ''}. Their old scores only picked a feeling —
          a few duels in <a href="/rate">Rate</a> will sharpen them.
        </p>
      )}
      {err && <p className="auth-err" role="alert">{err}</p>}
    </div>
  )
}
