export type Status = 'completed' | 'watching' | 'dropped' | 'planned'
export type Season = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL'

export interface AnimeBrief {
  id: number
  title: string
  title_en: string | null
  type: string
  year: number | null
  season: Season | null
  episodes: number | null
  thumbnail: string | null
  picture: string | null
  color: string | null
  popularity: number
  duration_s?: number | null
}

export interface AnimeDetail extends AnimeBrief {
  synonyms: string[]
  status: string
  duration_s: number | null
  score: number | null
  studios: string[]
  tags: string[]
  genres: string[]
  synopsis: string | null
  related: AnimeBrief[]
}

export interface Entry {
  anime_id: number
  status: Status
  episodes_watched: number | null
  tier: number | null
  between?: boolean
  score: number | null
  /** The model's exact position behind the rounded score: orders titles that show the same score. */
  strength?: number | null
  predicted: number | null
  facets: Record<string, string>
  source: string
  updated_at: string | null
  anime: AnimeBrief
}

export interface Me {
  id: string
  email: string
  username: string
  display_name: string
  is_public: boolean
  profile: Record<string, unknown>
}

/** Compact search index row from /api/catalog/index. */
export type IndexRow = [
  id: number,
  title: string,
  title_en: string | null,
  synonyms: string[],
  type: string,
  year: number | null,
  thumbnail: string | null,
  popularity: number,
  color: string | null,
  episodes: number | null,
]

export interface Hit {
  id: number
  title: string
  title_en: string | null
  type: string
  year: number | null
  thumbnail: string | null
  popularity: number
  color: string | null
  episodes: number | null
  score: number
}
