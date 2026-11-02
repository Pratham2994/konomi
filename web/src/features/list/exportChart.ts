import { byRank, SEASON_KANJI, SEASON_LABEL, STATUS_LABEL, TIERS } from '../../lib/hooks'
import type { Entry, Me, Season } from '../../lib/types'

/**
 * Your chart as one self-contained HTML page to keep or share: no Konomi account needed to open it, works offline
 * except for the cover images, which load from the same image hosts Konomi uses.
 */

const SEASON_COLOR: Record<Season, string> = { SPRING: '#ff7aa2', SUMMER: '#ffc23d', FALL: '#ff7340', WINTER: '#63c7ff' }
const NEUTRAL = '#c9c4d6'
const SEASON_ORDER: Season[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL']
const BANDS = [...TIERS.map((t, i) => ({ label: t.label, min: [9, 8, 6.5, 5, 0][i] }))]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const name = (e: Entry) => e.anime.title_en ?? e.anime.title
const colorOf = (e: Entry) => (e.anime.season ? SEASON_COLOR[e.anime.season] : NEUTRAL)

function tile(e: Entry, origin: string): string {
  const a = e.anime
  const img = a.picture ?? a.thumbnail
  const sub = [a.year, e.status !== 'completed' ? STATUS_LABEL[e.status] : e.score == null ? 'not rated' : null].filter(Boolean).join(' · ')
  return `<a class="t" href="${origin}/anime/${a.id}" style="--c:${colorOf(e)}" title="${esc(name(e))}">
<span class="art" style="background:${esc(a.color ?? '#1e1b27')}">${img ? `<img src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}${e.score != null ? `<b class="sc">${e.score.toFixed(1)}</b>` : ''}</span>
<span class="nm">${esc(name(e))}</span>${sub ? `<span class="sub">${esc(String(sub))}</span>` : ''}</a>`
}

function section(title: string, count: number, body: string, color?: string, kanji?: string): string {
  return `<section class="band"${color ? ` style="--c:${color}"` : ''}>
<header><h3>${kanji ? `<span class="kj" aria-hidden="true">${kanji}</span>` : ''}${esc(title)}</h3><span class="n">${count}</span></header>
<div class="grid">${body}</div></section>`
}

export function chartHtml(entries: Entry[], me: Me, origin: string): string {
  const ranked = [...entries].sort(byRank)
  const watched = entries.filter((e) => e.status === 'completed')
  const scored = ranked.filter((e) => e.score != null)
  const hours = Math.round(watched.reduce((s, e) => s + (e.anime.episodes ?? 1) * (e.anime.duration_s ?? 1440), 0) / 3600)
  const avg = scored.length ? scored.reduce((s, e) => s + e.score!, 0) / scored.length : null
  const top = scored.slice(0, 3)

  const byScore = [
    ...BANDS.map((b, i) => {
      const items = scored.filter((e) => e.score! >= b.min && (i === 0 || e.score! < BANDS[i - 1].min))
      return items.length ? section(b.label, items.length, items.map((e) => tile(e, origin)).join('')) : ''
    }),
    ...(['completed', 'watching', 'planned', 'dropped'] as const).map((st) => {
      const items = ranked.filter((e) => e.status === st && e.score == null)
      const label = st === 'completed' ? 'Watched, not rated yet' : STATUS_LABEL[st]
      return items.length ? section(label, items.length, items.map((e) => tile(e, origin)).join('')) : ''
    }),
  ].join('')

  const seasons = new Map<string, { season: Season | null; year: number | null; items: Entry[] }>()
  for (const e of ranked) {
    const k = `${e.anime.year ?? 0}-${e.anime.season ?? 'X'}`
    if (!seasons.has(k)) seasons.set(k, { season: e.anime.season, year: e.anime.year, items: [] })
    seasons.get(k)!.items.push(e)
  }
  const rank = (s: Season | null) => (s ? SEASON_ORDER.indexOf(s) : -1)
  const bySeason = [...seasons.values()]
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || rank(b.season) - rank(a.season))
    .map((g) => section(g.season && g.year ? `${SEASON_LABEL[g.season]} ${g.year}` : g.year ? String(g.year) : 'Undated',
      g.items.length, g.items.map((e) => tile(e, origin)).join(''), g.season ? SEASON_COLOR[g.season] : undefined,
      g.season ? SEASON_KANJI[g.season] : undefined))
    .join('')

  const podium = top.map((e, i) => {
    const a = e.anime
    const img = a.picture ?? a.thumbnail
    return `<a class="p p${i + 1}" href="${origin}/anime/${a.id}" style="--c:${colorOf(e)}">
<span class="art" style="background:${esc(a.color ?? '#1e1b27')}">${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : ''}<b class="rk">${i + 1}</b></span>
<span class="nm">${esc(name(e))}</span><span class="pc">${e.score!.toFixed(1)}</span></a>`
  }).join('')

  const date = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  const who = me.display_name || me.username
  const stats = [
    [watched.length.toLocaleString(), 'watched'],
    [hours.toLocaleString(), 'hours'],
    [scored.length.toLocaleString(), 'rated'],
    ...(avg != null ? [[avg.toFixed(1), 'average score']] : []),
  ].map(([n, l]) => `<div><b>${n}</b><span>${l}</span></div>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(who)}’s anime · Konomi</title>
<meta name="description" content="${esc(`${who}'s anime chart: ${watched.length} watched, ${scored.length} rated.`)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root { --ink:#0d0c12; --ink2:#15131c; --ink3:#1e1b27; --line:#2f2b3b; --paper:#f4f1ea; --paper2:#c9c4d6; --paper3:#8f89a3; --acc:#ff7340;
  --display:'Dela Gothic One','Zen Kaku Gothic New',system-ui,sans-serif; --body:'Zen Kaku Gothic New',system-ui,-apple-system,'Segoe UI',sans-serif; }
* { box-sizing:border-box; }
html { background:var(--ink); color:var(--paper); font-family:var(--body); -webkit-text-size-adjust:100%; }
body { margin:0; padding:clamp(20px,5vw,72px) clamp(16px,4vw,56px) 48px; max-width:1480px; margin-inline:auto; line-height:1.4; }
a { color:inherit; text-decoration:none; }
.mark { display:flex; align-items:center; gap:10px; color:var(--paper3); font-size:14px; letter-spacing:.02em; }
.mark b { font-family:var(--display); font-weight:400; color:var(--acc); font-size:22px; }
h1 { font-family:var(--display); font-weight:400; font-size:clamp(40px,8vw,104px); line-height:.95; letter-spacing:-.01em; margin:18px 0 0; max-width:14ch; }
h1 em { font-style:normal; color:var(--acc); }
.date { color:var(--paper3); font-size:14px; margin:14px 0 0; }
.stats { display:flex; flex-wrap:wrap; gap:clamp(20px,4vw,56px); margin:clamp(24px,4vw,40px) 0 0; padding:18px 0; border-block:1px solid var(--line); }
.stats div { display:grid; }
.stats b { font-family:var(--display); font-weight:400; font-size:clamp(26px,4vw,40px); line-height:1; }
.stats span { color:var(--paper3); font-size:13px; margin-top:6px; }
.podium { display:grid; grid-template-columns:1.25fr 1fr 1fr; gap:clamp(12px,2.4vw,32px); margin-top:clamp(28px,5vw,56px); align-items:end; }
.p { display:grid; gap:8px; min-width:0; }
.p .art { aspect-ratio:2/3; border-radius:10px; box-shadow:0 30px 60px -30px #000, 0 0 0 1px rgb(255 255 255 / .06); }
.p .rk { position:absolute; left:-.08em; bottom:-.28em; font-family:var(--display); font-weight:400; font-size:clamp(64px,11vw,150px); line-height:1; color:var(--c); text-shadow:0 6px 24px rgb(0 0 0 / .7); }
.p .nm { font-weight:700; font-size:clamp(14px,1.6vw,19px); margin-top:clamp(14px,2.4vw,30px); }
.p .pc { font-family:var(--display); color:var(--c); font-size:clamp(20px,2.4vw,30px); line-height:1; }
.label { margin:clamp(40px,7vw,80px) 0 0; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
.label h2 { font-family:var(--display); font-weight:400; font-size:clamp(26px,3.6vw,44px); margin:0; }
.seg { display:inline-flex; padding:4px; border-radius:999px; background:var(--ink2); border:1px solid var(--line); }
.seg button { font:inherit; font-weight:700; font-size:14px; color:var(--paper2); background:none; border:0; border-radius:999px; padding:8px 16px; cursor:pointer; }
.seg button[aria-pressed=true] { background:var(--paper); color:var(--ink); }
.view[hidden] { display:none; }
.band { margin-top:clamp(28px,4vw,44px); }
.band header { display:flex; align-items:baseline; gap:12px; border-bottom:1px solid var(--line); padding-bottom:10px; margin-bottom:16px; }
.band h3 { margin:0; font-size:clamp(17px,2vw,22px); display:flex; align-items:baseline; gap:10px; }
.band .kj { font-family:var(--display); font-weight:400; color:var(--c,var(--acc)); font-size:1.5em; line-height:.8; }
.band .n { color:var(--paper3); font-size:14px; }
.grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(clamp(104px,13vw,150px),1fr)); gap:clamp(14px,2vw,24px) clamp(10px,1.6vw,18px); }
.t { display:grid; gap:6px; min-width:0; align-content:start; }
.art { position:relative; display:block; aspect-ratio:2/3; border-radius:6px; overflow:hidden; }
.t .art { box-shadow:0 0 0 1px rgb(255 255 255 / .05); transition:transform .25s cubic-bezier(.16,1,.3,1); }
.t:hover .art { transform:translateY(-3px); }
.p .art { overflow:visible; }
.p .art img { border-radius:10px; }
.art img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
.sc { position:absolute; left:6px; bottom:6px; padding:2px 7px 3px; border-radius:999px; background:rgb(13 12 18 / .86); color:var(--c); font-family:var(--display); font-weight:400; font-size:14px; line-height:1.2; }
.nm { font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.sub { color:var(--paper3); font-size:12px; margin-top:-3px; }
footer { margin-top:72px; padding-top:20px; border-top:1px solid var(--line); color:var(--paper3); font-size:13px; display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px; }
footer a { color:var(--paper2); text-decoration:underline; text-underline-offset:3px; }
@media (max-width:560px) { .podium { grid-template-columns:1fr 1fr 1fr; } .p .nm { font-size:12px; } }
@media print {
  html { background:#fff; color:#111; } :root { --paper3:#666; --line:#ddd; --ink2:#f4f4f4; }
  .seg { display:none; } .view[hidden] { display:block; } .view + .view { break-before:page; }
  .t, .band header { break-inside:avoid; } .sc { background:#fff; border:1px solid #ccc; }
}
</style>
</head>
<body>
<p class="mark"><b>好み</b> Konomi</p>
<h1>${esc(who)}’s <em>anime</em></h1>
<p class="date">As of ${esc(date)}</p>
<div class="stats">${stats}</div>
${podium ? `<div class="podium">${podium}</div>` : ''}
<div class="label"><h2>The chart</h2>
<div class="seg" role="group" aria-label="Arrange"><button type="button" data-v="score" aria-pressed="true">By score</button><button type="button" data-v="season" aria-pressed="false">By season</button></div></div>
<div class="view" id="v-score">${byScore}</div>
<div class="view" id="v-season" hidden>${bySeason}</div>
<footer><span>Scores come from ${esc(who)}’s own feelings and head-to-head picks on Konomi.</span>
<a href="${origin}/u/${esc(me.username)}">${esc(origin.replace(/^https?:\/\//, ''))}/u/${esc(me.username)}</a></footer>
<script>
document.querySelectorAll('.seg button').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)) })
    document.getElementById('v-score').hidden = b.dataset.v !== 'score'
    document.getElementById('v-season').hidden = b.dataset.v !== 'season'
  })
})
</script>
</body>
</html>
`
}

/** Build the page and hand it to the browser as a download. */
export function downloadChart(entries: Entry[], me: Me) {
  const html = chartHtml(entries, me, window.location.origin)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `konomi-${me.username}-chart.html`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
