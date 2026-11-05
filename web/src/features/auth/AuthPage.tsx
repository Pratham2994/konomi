import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Cover } from '../../components/Cover'
import { Icon } from '../../components/Icon'
import { Headline, Slab } from '../../components/Wall'
import { deal } from '../../components/wallLayout'
import { api, ApiError } from '../../lib/api'
import { currentSeason, SEASON_ORDER } from '../../lib/hooks'
import { authChanged } from '../../lib/sync'
import type { AnimeBrief, Me, Season } from '../../lib/types'
import { PENDING_KEY } from '../home/Landing'
import './auth.css'

type Mode = 'login' | 'signup' | 'verify' | 'reset'

const ERR: Record<string, string> = {
  bad_credentials: 'That email and password don’t match.',
  bad_code: 'That code is wrong or expired, or the password doesn’t match the one you signed up with.',
  mail_failed: 'We couldn’t send the email just now. Try again in a minute.',
  username_taken: 'That username is taken. Try another.',
  bad_username: 'Usernames use 3 to 20 lowercase letters, numbers or underscores.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  http_422: 'Check the fields. The email looks wrong, or the password is under 8 characters.',
}

function PasswordInput({ value, onChange, autoComplete }: { value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [shown, setShown] = useState(false)
  return (
    <span className="pw">
      <input className="field" type={shown ? 'text' : 'password'} autoComplete={autoComplete} required minLength={8}
        autoCapitalize="off" autoCorrect="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="pw-eye" onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown}>
        <Icon name={shown ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </span>
  )
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')
  function set(i: number, d: string) {
    const clean = d.replace(/\D/g, '')
    if (clean.length > 1) {
      onChange(clean.slice(0, 6))
      refs.current[Math.min(clean.length, 5)]?.focus()
      return
    }
    const arr = value.padEnd(6, ' ').split('')
    arr[i] = clean || ' '
    onChange(arr.join('').trimEnd())
    if (clean && i < 5) refs.current[i + 1]?.focus()
  }
  return (
    <div className="otp" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6} value={d.trim()} aria-label={`Digit ${i + 1}`} autoFocus={i === 0}
          onChange={(e) => set(i, e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus() }} />
      ))}
    </div>
  )
}

function lastSeason(): { year: number; season: Season } {
  const now = currentSeason()
  const i = SEASON_ORDER.indexOf(now.season)
  return i > 0 ? { year: now.year, season: SEASON_ORDER[i - 1] } : { year: now.year - 1, season: 'FALL' }
}

function useSeasonCovers(year: number, season: Season) {
  return useQuery({
    queryKey: ['sweep', year, season],
    queryFn: () => api<{ items: AnimeBrief[] }>(`/api/sweep?year=${year}&season=${season}`),
    staleTime: Infinity,
  }).data?.items
}

function readPending(): AnimeBrief[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

const PER_SIDE = 5 * 6 - 1

/**
 * The form hangs between two walls of covers: this season on the left (led by its slab), last season on the
 * right. Titles marked on the landing page before signing up come first, circled, since they are about to be yours.
 */
function AuthWall({ side, items, pending, slab }: { side: 'left' | 'right'; items: AnimeBrief[] | undefined; pending: AnimeBrief[]; slab: { year: number; season: Season; label: string } }) {
  const marked = new Set(pending.map((a) => a.id))
  const list = [...pending, ...(items ?? []).filter((a) => !marked.has(a.id))].slice(0, PER_SIDE)
  return (
    <div className={`auth-wall auth-${side}`} aria-hidden="true">
      <Slab season={slab.season} year={slab.year} sub={slab.label} />
      {items ? list.map((a, k) => (
        <span key={a.id} className="auth-cell" style={deal(k + 1)}>
          <Cover id={a.id} title={a.title} src={a.picture ?? a.thumbnail} color={a.color} status={marked.has(a.id) ? 'completed' : undefined} />
        </span>
      )) : Array.from({ length: PER_SIDE }, (_, k) => <span key={k} className="auth-cell ghost-art" />)}
    </div>
  )
}

export function AuthPage({ mode }: { mode: Mode }) {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [username, setUsername] = useState('')
  const carried = (useLocation().state as { password?: string } | null)?.password ?? ''
  const [password, setPassword] = useState(carried)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(mode === 'verify')
  const [cooldown, setCooldown] = useState(mode === 'verify' ? 60 : 0)
  const nav = useNavigate()
  const qc = useQueryClient()
  const now = currentSeason()
  const prev = lastSeason()
  const nowCovers = useSeasonCovers(now.year, now.season)
  const prevCovers = useSeasonCovers(prev.year, prev.season)
  const [pending] = useState(readPending)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => { setErr(null) }, [mode])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'unverified') {
        await api('/api/auth/resend', { method: 'POST', json: { email } }).catch(() => undefined)
        nav(`/verify?email=${encodeURIComponent(email)}`, { state: { password } })
        return
      }
      setErr(e instanceof ApiError ? (ERR[e.code] ?? 'Something went wrong. Try again.') : 'Can’t reach Konomi. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  function signedIn(me: Me) {
    qc.setQueryData(['me'], me)
    qc.invalidateQueries()
    authChanged()
    nav('/')
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'login') run(async () => signedIn(await api<Me>('/api/auth/login', { method: 'POST', json: { email, password } })))
    if (mode === 'signup') run(async () => {
      await api('/api/auth/signup', { method: 'POST', json: { email, username, password } })
      nav(`/verify?email=${encodeURIComponent(email)}`, { state: { password } })
    })
    if (mode === 'verify') run(async () => signedIn(await api<Me>('/api/auth/verify', { method: 'POST', json: { email, code, password } })))
    if (mode === 'reset' && !sent) run(async () => {
      await api('/api/auth/reset/request', { method: 'POST', json: { email } })
      setSent(true)
      setCooldown(60)
    })
    if (mode === 'reset' && sent) run(async () =>
      signedIn(await api<Me>('/api/auth/reset/confirm', { method: 'POST', json: { email, code, password } })))
  }

  function resend() {
    run(async () => {
      await api(mode === 'reset' ? '/api/auth/reset/request' : '/api/auth/resend', { method: 'POST', json: { email } })
      setCooldown(60)
    })
  }

  const words = { login: ['Welcome', 'back.'], signup: ['Start', 'your', 'chart.'], verify: ['Check', 'your', 'email.'], reset: ['Reset', 'your', 'password.'] }[mode]
  const marks = pending.length > 0 && (mode === 'signup' || mode === 'verify')
    ? ` The ${pending.length} title${pending.length === 1 ? '' : 's'} you marked go${pending.length === 1 ? 'es' : ''} on it as soon as you’re in.` : ''
  const lead = {
    login: 'Log in to your Konomi.',
    signup: `One list for every anime you’ve watched. Scored by comparison, never by a slider.${marks}`,
    verify: `We sent a 6-digit code to ${email || 'your email'}. It expires in 10 minutes.`,
    reset: sent ? `Enter the code we sent to ${email} and choose a new password.` : 'We’ll email you a 6-digit code.',
  }[mode]

  return (
    <div className="auth page" data-season={now.season}>
      <AuthWall side="left" items={nowCovers} pending={pending} slab={{ ...now, label: 'airing now' }} />
      <form className="auth-card" onSubmit={submit} noValidate>
        <Headline key={mode} words={words} accent={words.length - 1} circle={mode === 'signup' ? 2 : undefined} className="auth-title" />
        <p className="auth-lead">{lead}{mode === 'verify' && marks}</p>

        {(mode !== 'verify') && (!sent || mode !== 'reset') && (
          <label className="auth-field">
            <span>Email</span>
            <input className="field" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
        )}
        {mode === 'signup' && (
          <label className="auth-field">
            <span>Username <em className="faint">(your link: /u/{username || 'name'})</em></span>
            <input className="field" autoComplete="username" required value={username} pattern="[a-z0-9_]{3,20}"
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} maxLength={20} />
          </label>
        )}
        {(mode === 'verify' || (mode === 'reset' && sent)) && <OtpInput value={code} onChange={setCode} />}
        {mode === 'verify' && !carried && (
          <label className="auth-field">
            <span>The password you signed up with</span>
            <PasswordInput autoComplete="current-password" value={password} onChange={setPassword} />
          </label>
        )}
        {(mode === 'login' || mode === 'signup' || (mode === 'reset' && sent)) && (
          <label className="auth-field">
            <span>{mode === 'reset' ? 'New password' : 'Password'} {mode !== 'login' && <em className="faint">(8+ characters)</em>}</span>
            <PasswordInput autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={setPassword} />
          </label>
        )}

        {err && (
          <p className="auth-err" role="alert">
            {err}
            {mode === 'login' && err === ERR.bad_credentials && (
              <> <Link to={`/reset?email=${encodeURIComponent(email)}`}>Reset your password</Link></>
            )}
          </p>
        )}

        <button className="btn btn-primary auth-submit" disabled={busy}>
          {busy ? 'One moment…' : {
            login: 'Log in', signup: 'Create account', verify: 'Verify email',
            reset: sent ? 'Set new password' : 'Send code',
          }[mode]}
        </button>

        {(mode === 'verify' || (mode === 'reset' && sent)) && (
          <button type="button" className="btn btn-ghost" disabled={cooldown > 0 || busy} onClick={resend}>
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </button>
        )}

        <p className="auth-alt">
          {mode === 'login' && <>New here? <Link to="/signup">Create an account</Link> · <Link to="/reset">Forgot password</Link></>}
          {mode === 'signup' && <>Already have one? <Link to="/login">Log in</Link></>}
          {mode === 'verify' && <>Wrong email? <Link to="/signup">Start again</Link></>}
          {mode === 'reset' && <>Remembered it? <Link to="/login">Log in</Link></>}
        </p>
      </form>
      <AuthWall side="right" items={prevCovers} pending={[]} slab={{ ...prev, label: 'last season' }} />
    </div>
  )
}
