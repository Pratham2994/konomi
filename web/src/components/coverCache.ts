/** Images that have loaded once. They show at once next time, so the cover-to-title morph never catches a fade. */
export const loaded = new Set<string>()

/**
 * Load covers before they show, so a card slides in with its art already there instead of a blank tile that
 * fades later. Resolves when they are all in, or after `wait` ms so a slow image never holds the page.
 */
export function preloadCovers(srcs: (string | null | undefined)[], wait = 500): Promise<void> {
  const all = srcs.filter((s): s is string => !!s && !loaded.has(s)).map((src) => new Promise<void>((done) => {
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    img.onload = () => { loaded.add(src); done() }
    img.onerror = () => done()
    img.src = src
  }))
  if (!all.length) return Promise.resolve()
  return Promise.race([Promise.all(all).then(() => undefined), new Promise<void>((r) => setTimeout(r, wait))])
}
