import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { morph } from '../components/VtLink'
import { galaxyQuery, loadGalaxy } from '../features/taste/preload'
import { authChanged } from '../lib/sync'
import { QuickAdd } from '../features/add/QuickAdd'
import { api } from '../lib/api'
import { currentSeason, useList, useMe } from '../lib/hooks'
import './layout.css'

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Konomi home">
      <span className="brand-kanji display">好み</span>
      <span className="brand-word">Konomi</span>
    </Link>
  )
}

/** Watched titles still waiting for a feeling, counted from the list every page already has. */
function useUnrated() {
  return (useList().data ?? []).filter((e) => e.status === 'completed' && e.tier == null).length
}

const scrollAt = new Map<string, number>()

/** New pages open at the top; Back and Forward return to where you were, once the page is tall enough again. */
function useScrollMemory() {
  const { key, hash } = useLocation()
  const type = useNavigationType()
  useLayoutEffect(() => { history.scrollRestoration = 'manual' }, [])
  useLayoutEffect(() => {
    let raf = 0
    if (type === 'POP') {
      const target = scrollAt.get(key) ?? 0
      const until = performance.now() + 2500
      const tryRestore = () => {
        const room = document.documentElement.scrollHeight - window.innerHeight
        if (room >= target || performance.now() > until) window.scrollTo(0, Math.min(target, room))
        else raf = requestAnimationFrame(tryRestore)
      }
      tryRestore()
    } else if (!hash) window.scrollTo(0, 0)
    const save = () => { scrollAt.set(key, window.scrollY) }
    window.addEventListener('scroll', save, { passive: true })
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', save) }
  }, [key, type, hash])
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar display" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
}

export function Layout() {
  const { data: me } = useMe()
  const unrated = useUnrated()
  const [menu, setMenu] = useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()
  const { season } = currentSeason()
  const { pathname, search } = useLocation()
  const main = useRef<HTMLElement>(null)
  useScrollMemory()

  // Fetch the galaxy code once the app is idle, and its stars as soon as someone heads for Taste.
  useEffect(() => {
    if (!me) return
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000))
    idle(() => { loadGalaxy().catch(() => undefined) })
  }, [me])
  const warmTaste = () => { loadGalaxy().catch(() => undefined); qc.prefetchQuery(galaxyQuery) }
  const first = useRef(true)

  // Each new page rises in softly instead of cutting. The first page has the splash; cover morphs have their own.
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (morph.active || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    main.current?.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
      { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
  }, [pathname])
  const preview = new URLSearchParams(search).has('preview')
  // Inside the Customise preview, links open in the main app: the frame always stays your profile.
  useEffect(() => {
    if (!preview) return
    const root = document.documentElement
    root.classList.add('in-preview')
    const on = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]')
      if (!a || a.origin !== window.location.origin) return
      e.preventDefault()
      e.stopPropagation()
      window.parent.postMessage({ type: 'konomi:open', to: a.pathname + a.search }, window.location.origin)
    }
    document.addEventListener('click', on, true)
    return () => { document.removeEventListener('click', on, true); root.classList.remove('in-preview') }
  }, [preview])
  // Customise shows the profile in a small frame: no app chrome there.
  if (preview) return <div className="shell shell-preview" data-season={season}><Outlet /></div>

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    qc.clear()
    authChanged()
    nav('/')
  }

  return (
    <div className="shell" data-season={season}>
      <header className="topbar">
        <Brand />
        {me && <div className="topbar-add"><QuickAdd /></div>}
        <nav className="topnav" aria-label="Main">
          {me ? (
            <>
              <NavLink to="/chart">Chart</NavLink>
              <NavLink to="/sweep">Add anime</NavLink>
              <NavLink to="/rate" className="has-badge">
                Rate titles{unrated > 0 && <span className="badge">{unrated > 99 ? '99+' : unrated}</span>}
              </NavLink>
              <NavLink to="/taste" onPointerEnter={warmTaste} onFocus={warmTaste}>Taste</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <Link to="/signup" className="btn btn-primary">Start your chart</Link>
            </>
          )}
        </nav>
        {me && (
          <div className="me">
            <button className="me-btn" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label="Account menu">
              <Avatar name={me.display_name || me.username} />
            </button>
            {menu && (
              <div className="me-menu" onMouseLeave={() => setMenu(false)}>
                <Link to={`/u/${me.username}`} onClick={() => setMenu(false)}><Icon name="user" size={18} /> Your profile</Link>
                <Link to="/settings" onClick={() => setMenu(false)}><Icon name="settings" size={18} /> Customise</Link>
                <button onClick={logout}><Icon name="logout" size={18} /> Log out</button>
              </div>
            )}
          </div>
        )}
      </header>
      {me && pathname !== '/' && <div className="mobile-add"><QuickAdd /></div>}

      <main className="main" ref={main}>
        <Outlet />
      </main>

      {/* The landing page has its own foot; every other page ends on this one. */}
      {(me || pathname !== '/') && (
        <footer className="site-foot">
          <div className="site-foot-in">
            <Link to="/" className="site-foot-mark display" aria-label="Konomi home">好み</Link>
            {me ? (
              <nav className="site-foot-links" aria-label="More">
                <Link to="/chart">Your chart</Link>
                <Link to="/sweep">Add anime</Link>
                <Link to="/rate">Rate titles</Link>
                <Link to="/taste">Taste</Link>
                <Link to={`/u/${me.username}`}>Your profile</Link>
                <Link to="/settings">Customise</Link>
              </nav>
            ) : (
              <nav className="site-foot-links" aria-label="More">
                <Link to="/">What is Konomi</Link>
                <Link to="/login">Log in</Link>
                <Link to="/signup">Start your chart</Link>
              </nav>
            )}
            <p className="site-foot-credit faint">Catalogue: anime-offline-database (ODbL), AniList. Ratings: MyAnimeList via Kaggle.</p>
          </div>
        </footer>
      )}

      {me && (
        <nav className="bottombar" aria-label="Main">
          <NavLink to="/" end><Icon name="taste" size={22} /><span>Home</span></NavLink>
          <NavLink to="/chart"><Icon name="chart" size={22} /><span>Chart</span></NavLink>
          <NavLink to="/sweep" className="bb-add"><span className="bb-plus"><Icon name="plus" size={26} stroke={2.6} /></span><span>Add</span></NavLink>
          <NavLink to="/rate" className="has-badge"><Icon name="duel" size={22} /><span>Rate</span>
            {unrated > 0 && <span className="badge">{unrated > 99 ? '99+' : unrated}</span>}</NavLink>
          <NavLink to="/taste" onTouchStart={warmTaste} onPointerEnter={warmTaste}><Icon name="sparkle" size={22} /><span>Taste</span></NavLink>
        </nav>
      )}
    </div>
  )
}
