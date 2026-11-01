import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from './api'
import type { AnimeBrief, Entry, Me, Season, Status } from './types'
import { dropFromProfiles, listChanged, moveInProfiles } from './sync'
import { useToast } from '../components/Toast'

/** A small view choice (sort, filter) remembered in this browser, so it is still set after you open a title and
 *  come back. Falls back to plain state when storage is blocked. */
export function useStored<T extends string>(key: string, initial: T, allowed?: readonly T[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const got = localStorage.getItem(key) as T | null
      return got != null && (!allowed || allowed.includes(got)) ? got : initial
    } catch { return initial }
  })
  const set = (next: T) => {
    setV(next)
    try { localStorage.setItem(key, next) } catch { /* storage blocked: fine */ }
  }
  return [v, set]
}

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Me>('/api/me')
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: 60_000,
  })
}

export function useList(enabled = true) {
  const { data: me } = useMe()
  return useQuery<Entry[]>({
    queryKey: ['list'],
    queryFn: async () => (await api<{ entries: Entry[] }>('/api/list')).entries,
    enabled: enabled && !!me,
    staleTime: 30_000,
  })
}

/** Map anime_id -> entry, for quick "is it on my list?" checks. */
export function useListIndex() {
  const { data } = useList()
  return new Map((data ?? []).map((e) => [e.anime_id, e]))
}

/**
 * Chart writes share one queue: they reach the server in the order you tapped, so "mark, then unmark" can never
 * end up marked. Views refresh once the queue is empty, so a quick run of taps never blinks.
 */
const LIST_WRITE = { mutationKey: ['list-write'], scope: { id: 'list-write' } }
function settledListWrite(qc: QueryClient) {
  if (qc.isMutating({ mutationKey: LIST_WRITE.mutationKey }) <= 1) listChanged(qc)
}

export function useSetStatus() {
  const qc = useQueryClient()
  return useMutation({
    ...LIST_WRITE,
    mutationFn: ({ anime, status }: { anime: AnimeBrief; status: Status }) =>
      api<Omit<Entry, 'anime'>>(`/api/list/${anime.id}`, { method: 'PUT', json: { status } }),
    onMutate: async ({ anime, status }) => {
      await qc.cancelQueries({ queryKey: ['list'] })
      const prev = qc.getQueryData<Entry[]>(['list'])
      const existing = prev?.find((e) => e.anime_id === anime.id)
      const next: Entry = existing
        ? { ...existing, status }
        : { anime_id: anime.id, status, episodes_watched: null, tier: null, score: null, predicted: null,
            facets: {}, source: 'konomi', updated_at: new Date().toISOString(), anime }
      qc.setQueryData<Entry[]>(['list'], [next, ...(prev ?? []).filter((e) => e.anime_id !== anime.id)])
      moveInProfiles(qc, anime, status)
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['list'], ctx.prev),
    onSettled: () => settledListWrite(qc),
  })
}

export function useRemove() {
  const qc = useQueryClient()
  return useMutation({
    ...LIST_WRITE,
    mutationFn: (animeId: number) => api(`/api/list/${animeId}`, { method: 'DELETE' }),
    onMutate: async (animeId) => {
      await qc.cancelQueries({ queryKey: ['list'] })
      const prev = qc.getQueryData<Entry[]>(['list'])
      qc.setQueryData<Entry[]>(['list'], (prev ?? []).filter((e) => e.anime_id !== animeId))
      dropFromProfiles(qc, animeId)
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['list'], ctx.prev),
    onSettled: () => settledListWrite(qc),
  })
}

export function currentSeason(d = new Date()): { season: Season; year: number } {
  const m = d.getMonth()
  const season: Season = m < 3 ? 'WINTER' : m < 6 ? 'SPRING' : m < 9 ? 'SUMMER' : 'FALL'
  return { season, year: d.getFullYear() }
}

export const SEASON_ORDER: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
export const SEASON_LABEL: Record<Season, string> = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' }
export const SEASON_KANJI: Record<Season, string> = { WINTER: '冬', SPRING: '春', SUMMER: '夏', FALL: '秋' }

export const TIERS = [
  { tier: 5, label: 'One of my favourites', band: '9.0 to 10' },
  { tier: 4, label: 'Loved it', band: '8.0 to 8.9' },
  { tier: 3, label: 'Liked it', band: '6.5 to 7.9' },
  { tier: 2, label: 'It was okay', band: '5.0 to 6.4' },
  { tier: 1, label: "Didn't like it", band: '1.0 to 4.9' },
] as const

export const STATUS_LABEL: Record<Status, string> = {
  completed: 'Watched', watching: 'Watching', dropped: 'Dropped', planned: 'Want to watch',
}

/**
 * Remove with a way back: the toast's Undo restores the status and, for a rated title, the feeling too.
 * (The comparisons are never deleted, so with the feeling back the score comes back as it was.)
 */
export function useRemoveWithUndo() {
  const remove = useRemove()
  const bulk = useBulk()
  const toast = useToast()
  return (e: Entry) => {
    remove.mutate(e.anime_id)
    toast({
      title: e.anime.title_en ?? e.anime.title,
      text: e.tier != null ? 'Removed, with its feeling' : 'Removed from your chart',
      action: { label: 'Undo', run: () => bulk.mutate({ action: 'restore', entries: [restoreOf(e)] }) },
    })
  }
}

/** Everything Undo needs to put a removed title back exactly as it was. */
export const restoreOf = (e: Entry) => ({ anime_id: e.anime_id, status: e.status, tier: e.tier, between: !!e.between, predicted: e.predicted })

type BulkBody =
  | { action: 'status'; ids: number[]; status: Status }
  | { action: 'remove'; ids: number[] }
  | { action: 'restore'; entries: { anime_id: number; status: Status; tier: number | null; between: boolean; predicted: number | null }[] }

/** Many titles in one request, in the same queue as single changes; the chart updates before the server answers. */
export function useBulk() {
  const qc = useQueryClient()
  return useMutation({
    ...LIST_WRITE,
    mutationFn: (body: BulkBody) => api<{ changed: number }>('/api/list/bulk', { method: 'POST', json: body }),
    onMutate: async (body) => {
      qc.cancelQueries({ queryKey: ['list'] })
      const prev = qc.getQueryData<Entry[]>(['list'])
      if (body.action === 'status') {
        const ids = new Set(body.ids)
        qc.setQueryData<Entry[]>(['list'], (prev ?? []).map((e) => (ids.has(e.anime_id) ? { ...e, status: body.status } : e)))
      } else if (body.action === 'remove') {
        const ids = new Set(body.ids)
        qc.setQueryData<Entry[]>(['list'], (prev ?? []).filter((e) => !ids.has(e.anime_id)))
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['list'], ctx.prev),
    onSettled: () => settledListWrite(qc),
  })
}

const KIND: Record<string, string> = { TV: 'TV series', MOVIE: 'Film', ONA: 'Web series', OVA: 'OVA', SPECIAL: 'Special' }

/** Which entry this is, so seasons and films of one series can be told apart: "TV series · Spring 2013 · 25 episodes". */
export function entryLine(a: AnimeBrief): string {
  const when = a.season && a.year ? `${SEASON_LABEL[a.season]} ${a.year}` : a.year ? String(a.year) : null
  const eps = a.episodes && a.episodes > 1 ? `${a.episodes} episodes` : null
  return [KIND[a.type ?? ''] ?? a.type, when, eps].filter(Boolean).join(' · ')
}
