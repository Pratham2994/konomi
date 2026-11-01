import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { MotionConfig } from 'motion/react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './app/App'
import { ToastProvider } from './components/Toast'
import { RaterProvider } from './features/rate/RaterContext'
import { warmSearch } from './search/useSearch'
import { ApiError } from './lib/api'
import './styles/base.css'

// One retry for network or server trouble; a 4xx answer (signed out, not found) won't change on a second try.
const retry = (n: number, e: unknown) => n < 1 && !(e instanceof ApiError && e.status < 500)
const qc = new QueryClient({ defaultOptions: { queries: { retry, refetchOnWindowFocus: false } } })
warmSearch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ToastProvider>
          <RaterProvider>
            <MotionConfig reducedMotion="user">
              <App />
            </MotionConfig>
          </RaterProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
