import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { AnimeBrief, Entry, Me, Season, Status } from './types'
import { dropFromProfiles, listChanged, moveInProfiles } from './sync'

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
