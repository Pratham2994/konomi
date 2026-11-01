import { useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthPage } from '../features/auth/AuthPage'
import { AnimePage } from '../features/anime/AnimePage'
import { ChartPage } from '../features/list/ChartPage'
import { HomePage } from '../features/home/HomePage'
import { Landing } from '../features/home/Landing'
import { ProfilePage } from '../features/profile/ProfilePage'
import { SettingsPage } from '../features/profile/SettingsPage'
import { RatePage } from '../features/rate/RatePage'
import { SweepPage } from '../features/add/SweepPage'
import TastePage from '../features/taste/TastePage'
import { useMe } from '../lib/hooks'
import { listenForChanges } from '../lib/sync'
import { Layout } from './Layout'


function Private({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe()
  if (isLoading) return null
  return me ? <>{children}</> : <Navigate to="/login" replace />
}

function Root() {
  const { data: me, isLoading } = useMe()
  if (isLoading) return null
  return me ? <HomePage /> : <Landing />
}

/** Fade the HTML splash out once we know who the visitor is (and the mark has had time to draw). */
function useSplash(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    const el = document.getElementById('splash')
    if (!el) return
    const wait = Math.max(0, 900 - performance.now())
    const t = setTimeout(() => {
      el.classList.add('out')
      setTimeout(() => el.remove(), 500)
    }, wait)
    return () => clearTimeout(t)
  }, [ready])
}

export function App() {
  const qc = useQueryClient()
  useEffect(() => listenForChanges(qc), [qc])
  const { isLoading } = useMe()
  useSplash(!isLoading)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Root />} />
        <Route path="login" element={<AuthPage mode="login" />} />
        <Route path="signup" element={<AuthPage mode="signup" />} />
        <Route path="verify" element={<AuthPage mode="verify" />} />
        <Route path="reset" element={<AuthPage mode="reset" />} />
        <Route path="chart" element={<Private><ChartPage /></Private>} />
        <Route path="sweep" element={<Private><SweepPage /></Private>} />
        <Route path="rate" element={<Private><RatePage /></Private>} />
        <Route path="taste" element={<Private><TastePage /></Private>} />
        <Route path="settings" element={<Private><SettingsPage /></Private>} />
        <Route path="anime/:id" element={<AnimePage />} />
        <Route path="u/:username" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
