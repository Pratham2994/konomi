import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildIndex, search } from './rank'

// Uses the real catalogue index dumped from the API (data/build/index.json); skipped when absent.
const path = new URL('../../../data/build/index.json', import.meta.url)
const has = existsSync(path)

describe.skipIf(!has)('search ranking on the real catalogue', () => {
  const idx = has ? buildIndex(JSON.parse(readFileSync(path, 'utf8')).items) : null!
  const top = (q: string) => search(idx, q, 3)[0]

  it.each([
    ['frieren', /Frieren/],
    ['shingeki', /Shingeki no Kyojin$/],
    ['aot', /Shingeki no Kyojin/],
    ['kimetsu no yaiba', /Kimetsu no Yaiba$/],
    ['steins gate', /^Steins;Gate$/],
    ['steins;gate', /^Steins;Gate$/],
    ['fma brotherhood', /Fullmetal Alchemist: Brotherhood/],
    ['one piece', /^One Piece$/],
    ['naruto', /^Naruto$/],
    ['jjk', /Jujutsu Kaisen/],
    ['demon slayer', /Kimetsu no Yaiba/],
    ['your name', /Kimi no Na wa/],
    ['frieran', /Frieren/],
    ['bahamut genesis', /Bahamut: Genesis/],
    ['mushishi', /^Mushishi$/],
    ['k-on', /^K-On!$/],
    ['ping pong the animation', /Ping Pong/],
  ])('%s → main entry', (q, re) => {
    const hit = top(q)
    expect(hit, q).toBeTruthy()
    expect(hit.type === 'TV' || hit.type === 'MOVIE', `${q}: ${hit.title} (${hit.type})`).toBe(true)
    expect(re.test(hit.title) || re.test(hit.title_en ?? ""), `${q}: got ${hit.title} | ${hit.title_en}`).toBe(true)
  })
})
