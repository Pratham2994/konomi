import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { useToast } from '../../components/Toast'
import { STATUS_LABEL, useListIndex, useRemove, useSetStatus } from '../../lib/hooks'
import type { AnimeBrief, Hit, Status } from '../../lib/types'
import { useSearch } from '../../search/useSearch'
import { useRater } from '../rate/RaterContext'
import './quickadd.css'

function hitToBrief(h: Hit): AnimeBrief {
  return { id: h.id, title: h.title, title_en: h.title_en, type: h.type, year: h.year, season: null,
    episodes: h.episodes, thumbnail: h.thumbnail, picture: null, color: h.color, popularity: h.popularity }
}

const TYPE_LABEL: Record<string, string> = { TV: 'TV', MOVIE: 'Movie', ONA: 'ONA', OVA: 'OVA', SPECIAL: 'Special' }

export function QuickAdd({ variant = 'bar', autoFocus }: { variant?: 'bar' | 'hero'; autoFocus?: boolean }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [open, setOpen] = useState(false)
  const { hits, ready } = useSearch(q, 8)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const onList = useListIndex()
  const setStatus = useSetStatus()
  const remove = useRemove()
  const toast = useToast()
  const rater = useRater()

  useEffect(() => setSel(0), [q])

  useEffect(() => {
    if (variant !== 'bar') return
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  function add(h: Hit, status: Status) {
    const anime = hitToBrief(h)
    const existing = onList.get(h.id)
    if (existing && existing.status === status) {
      if (status === 'completed') rater.prompt(anime)
      setQ('')
      return
    }
    setStatus.mutate({ anime, status })
    toast({
      text: `${h.title_en ?? h.title} — ${STATUS_LABEL[status].toLowerCase()}`,
      action: existing ? undefined : { label: 'Undo', run: () => remove.mutate(h.id) },
    })
    if (status === 'completed') rater.prompt(anime)
    setQ('')
    inputRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && hits[sel]) {
      e.preventDefault()
      add(hits[sel], e.altKey ? 'planned' : e.shiftKey ? 'watching' : 'completed')
    } else if (e.key === 'Escape') {
      setQ('')
      inputRef.current?.blur()
    }
  }

  const showList = open && q.trim().length > 0
  return (
    <div className={`qa qa-${variant}`} onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
    }}>
      <label className="qa-field">
        <Icon name="search" size={variant === 'hero' ? 24 : 18} />
        <span className="sr-only">Add an anime</span>
        <input ref={inputRef} value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)} onKeyDown={onKeyDown} placeholder="Add an anime you've watched…"
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && hits[sel] ? `${listId}-${hits[sel].id}` : undefined}
          autoComplete="off" spellCheck={false} enterKeyHint="done" />
        {variant === 'bar' && !q && <kbd className="qa-kbd">/</kbd>}
        {q && (
          <button className="qa-clear" type="button" onClick={() => { setQ(''); inputRef.current?.focus() }}
            aria-label="Clear">
            <Icon name="close" size={16} />
          </button>
        )}
      </label>
      {showList && (
        <div className="qa-pop">
          {!ready && <p className="qa-empty">Loading the catalogue…</p>}
          {ready && hits.length === 0 && <p className="qa-empty">Nothing matches “{q}”. Try the Japanese or English title.</p>}
          <ul id={listId} role="listbox" className="qa-list">
            {hits.map((h, i) => {
              const entry = onList.get(h.id)
              return (
                <li key={h.id} id={`${listId}-${h.id}`} role="option" aria-selected={i === sel}
                  className={`qa-row${i === sel ? ' is-sel' : ''}`} onMouseEnter={() => setSel(i)}>
                  <button type="button" className="qa-main" onClick={() => add(h, 'completed')} tabIndex={-1}>
                    <Cover id={h.id} title={h.title} src={h.thumbnail} color={h.color} size="xs" status={entry?.status} />
                    <span className="qa-text">
                      <span className="qa-title">{h.title_en ?? h.title}</span>
                      <span className="qa-meta">
                        {h.title_en && h.title_en !== h.title && <span className="qa-alt">{h.title}</span>}
                        <span>{[h.year, TYPE_LABEL[h.type] ?? h.type, h.episodes && h.episodes > 1 ? `${h.episodes} eps` : null].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    {entry && <span className="qa-on">{STATUS_LABEL[entry.status]}</span>}
                  </button>
                  <span className="qa-alts">
                    <button type="button" tabIndex={-1} onClick={() => add(h, 'watching')}>Watching</button>
                    <button type="button" tabIndex={-1} onClick={() => add(h, 'planned')}>Want</button>
                  </span>
                </li>
              )
            })}
          </ul>
          {hits.length > 0 && (
            <p className="qa-help">
              <span><kbd>Enter</kbd> watched</span>
              <span><kbd>Shift</kbd>+<kbd>Enter</kbd> watching</span>
              <span><kbd>Alt</kbd>+<kbd>Enter</kbd> want to watch</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
