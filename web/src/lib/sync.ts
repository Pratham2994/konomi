import type { QueryClient } from '@tanstack/react-query'
import type { AnimeBrief, Me, Status } from './types'

/**
 * One place that keeps every view honest after a change.
 * Each query below is computed from your list or your profile, so a change to either refreshes all of them,
 * here and in every other Konomi tab or frame (the Customise preview is one) through a BroadcastChannel.
 */
const FROM_LIST = new Set(['list', 'profile', 'settings', 'rate-next', 'taste-me', 'dna', 'network', 'track', 'recs', 'predict', 'match'])
const FROM_PROFILE = new Set(['profile', 'settings', 'me'])

type Signal = 'list' | 'profile' | 'auth'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('konomi-sync') : null

function refresh(qc: QueryClient, keys: Set<string>) {
  return qc.invalidateQueries({ predicate: (q) => keys.has(String(q.queryKey[0])) })
}

export function listChanged(qc: QueryClient) {
  channel?.postMessage('list' satisfies Signal)
  return refresh(qc, FROM_LIST)
}

export function profileChanged(qc: QueryClient) {
  channel?.postMessage('profile' satisfies Signal)
  return refresh(qc, FROM_PROFILE)
}

/** Signed in or out: other tabs start over too. */
export function authChanged() {
  channel?.postMessage('auth' satisfies Signal)
}

/** Apply changes announced by other tabs and frames. Returns the unsubscribe. */
export function listenForChanges(qc: QueryClient) {
  if (!channel) return () => undefined
  const on = (e: MessageEvent<Signal>) => {
    if (e.data === 'list') refresh(qc, FROM_LIST)
    else if (e.data === 'profile') refresh(qc, FROM_PROFILE)
    else if (e.data === 'auth') { qc.clear(); qc.invalidateQueries() }
  }
  channel.addEventListener('message', on)
  return () => channel.removeEventListener('message', on)
}

// Profiles hold their own copy of the list. These edit that copy at once, so a profile on screen changes
// in the same frame as the chart; the refresh that follows brings the server's version.
interface ProfileCache {
  entries: { anime: AnimeBrief; status: Status; score: number | null }[]
  favourites: { id: number }[]
  watching: { id: number }[]
  drops: { id: number }[]
  hot_takes: { anime: AnimeBrief }[]
  hill: { anime: AnimeBrief } | null
}

/** Only your own profile: someone else's cached profile must never pick up your changes. */
const ownProfile = (qc: QueryClient) => ['profile', qc.getQueryData<Me>(['me'])?.username ?? '']

export function dropFromProfiles(qc: QueryClient, animeId: number) {
  qc.setQueryData<ProfileCache>(ownProfile(qc), (p) => p && {
    ...p,
    entries: p.entries.filter((e) => e.anime.id !== animeId),
    favourites: p.favourites.filter((f) => f.id !== animeId),
    watching: p.watching.filter((a) => a.id !== animeId),
    drops: p.drops.filter((a) => a.id !== animeId),
    hot_takes: p.hot_takes.filter((h) => h.anime.id !== animeId),
    hill: p.hill?.anime.id === animeId ? null : p.hill,
  })
}

export function moveInProfiles(qc: QueryClient, anime: AnimeBrief, status: Status) {
  qc.setQueryData<ProfileCache>(ownProfile(qc), (p) => {
    if (!p) return p
    const known = p.entries.some((e) => e.anime.id === anime.id)
    return {
      ...p,
      entries: known
        ? p.entries.map((e) => (e.anime.id === anime.id ? { ...e, status } : e))
        : [{ anime, status, score: null }, ...p.entries],
      watching: status === 'watching' ? [{ ...anime, progress: null }, ...p.watching.filter((a) => a.id !== anime.id)] : p.watching.filter((a) => a.id !== anime.id),
      drops: status === 'dropped' ? [{ ...anime, progress: null }, ...p.drops.filter((a) => a.id !== anime.id)] : p.drops.filter((a) => a.id !== anime.id),
    }
  })
}
