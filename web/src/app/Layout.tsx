import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { QuickAdd } from '../features/add/QuickAdd'
import { api } from '../lib/api'
import { currentSeason, useMe } from '../lib/hooks'
import './layout.css'

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Konomi home">
      <span className="brand-kanji display">好み</span>
      <span className="brand-word">Konomi</span>
    </Link>
  )
}

function useUnrated(enabled: boolean) {
  return useQuery({
    queryKey: ['rate-next'],
    queryFn: () => api<{ unrated: number }>('/api/rate/session/next'),
    enabled,
    staleTime: 15_000,
  }).data?.unrated ?? 0
}

function Avatar({ name }: { name: string }) {
  return <span className="avatar display" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
}

export function Layout() {
  const { data: me } = useMe()
  const unrated = useUnrated(!!me)
  const [menu, setMenu] = useState(false)
  const qc = useQueryClient()
  const nav = useNavigate()
  const { season } = currentSeason()

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' })
    qc.clear()
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
              <NavLink to="/sweep">Season walk</NavLink>
              <NavLink to="/rate" className="has-badge">
                Rate{unrated > 0 && <span className="badge">{unrated > 99 ? '99+' : unrated}</span>}
              </NavLink>
              <NavLink to="/taste">Taste</NavLink>
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
      {me && <div className="mobile-add"><QuickAdd /></div>}

      <main className="main">
        <Outlet />
      </main>

      {me && (
        <nav className="bottombar" aria-label="Main">
          <NavLink to="/" end><Icon name="taste" size={22} /><span>Home</span></NavLink>
          <NavLink to="/chart"><Icon name="chart" size={22} /><span>Chart</span></NavLink>
          <NavLink to="/sweep" className="bb-add"><span className="bb-plus"><Icon name="plus" size={26} stroke={2.6} /></span><span>Walk</span></NavLink>
          <NavLink to="/rate" className="has-badge"><Icon name="duel" size={22} /><span>Rate</span>
            {unrated > 0 && <span className="badge">{unrated > 99 ? '99+' : unrated}</span>}</NavLink>
          <NavLink to="/taste"><Icon name="sparkle" size={22} /><span>Taste</span></NavLink>
        </nav>
      )}
    </div>
  )
}
