import MiniSearch from 'minisearch'
import type { Hit, IndexRow } from '../lib/types'

const TYPE_WEIGHT: Record<string, number> = { TV: 1, MOVIE: 0.93, ONA: 0.85, OVA: 0.8, SPECIAL: 0.55, UNKNOWN: 0.5 }

export interface Doc {
  id: number
  title: string
  title_en: string
  syn: string
}

/** Strip punctuation and accents so "Steins;Gate", "steins gate" and "Steins Gate 0" tokenise the same. */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Acronym of a multi-word title: "Shingeki no Kyojin" -> "snk", "Attack on Titan" -> "aot". */
export function acronym(s: string): string {
  const words = normalize(s).split(' ').filter(Boolean)
  return words.length >= 2 ? words.map((w) => w[0]).join('') : ''
}

export function buildIndex(rows: IndexRow[]) {
  const ms = new MiniSearch<Doc>({
    fields: ['title', 'title_en', 'syn'],
    storeFields: [],
    processTerm: (t) => normalize(t) || null,
    tokenize: (s) => normalize(s).split(' '),
  })
  const docs: Doc[] = rows.map((r) => {
    const names = [r[1], r[2] ?? '', ...r[3]]
    const acr = names.map(acronym).filter((a) => a.length >= 2)
    return { id: r[0], title: r[1], title_en: r[2] ?? '', syn: [...r[3], ...acr].join(' | ') }
  })
  ms.addAll(docs)
  const byId = new Map(rows.map((r) => [r[0], r]))
  return { ms, byId }
}

export function search(idx: ReturnType<typeof buildIndex>, q: string, limit = 8): Hit[] {
  const query = normalize(q)
  if (!query) return []
  const raw = idx.ms.search(query, {
    prefix: true,
    fuzzy: (term) => (term.length > 4 ? 0.2 : 0),
    boost: { title: 2, title_en: 2, syn: 1 },
    combineWith: 'AND',
  })
  const hits: Hit[] = []
  // Popular shows carry dozens of alternate titles, which drags their BM25 down; so match quality is
  // compressed (sqrt of the share of the best match) and popularity decides between good matches.
  const best = raw[0]?.score ?? 1
  for (const r of raw.slice(0, 300)) {
    const row = idx.byId.get(r.id as number)
    if (!row) continue
    const exact =
      normalize(row[1]) === query || (row[2] && normalize(row[2]) === query) ? 1.6 : 1
    const pop = Math.log10(row[7] + 10) ** 2
    const score = Math.sqrt(r.score / best) * exact * pop * (TYPE_WEIGHT[row[4]] ?? 0.6)
    hits.push({
      id: row[0], title: row[1], title_en: row[2], type: row[4], year: row[5], thumbnail: row[6],
      popularity: row[7], color: row[8], episodes: row[9], score,
    })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
