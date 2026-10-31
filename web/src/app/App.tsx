import { lazy, Suspense, type ReactNode } from 'react'
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
import { useMe } from '../lib/hooks'
import { Layout } from './Layout'

const TastePage = lazy(() => import('../features/taste/TastePage'))

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

export function App() {
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
        <Route path="taste" element={<Private><Suspense fallback={null}><TastePage /></Suspense></Private>} />
        <Route path="settings" element={<Private><SettingsPage /></Private>} />
        <Route path="anime/:id" element={<AnimePage />} />
        <Route path="u/:username" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
