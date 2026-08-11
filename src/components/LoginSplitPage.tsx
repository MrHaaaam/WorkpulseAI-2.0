import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, Fingerprint, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { useToast } from './ui/Toast.tsx'
import { apiFetch, storeSession } from '../lib/api.ts'

const API_URL = '/api/auth'

function solveCaptcha(challenge: string) {
  const [leftText, operation, rightText] = challenge.trim().split(/\s+/)
  const left = Number(leftText)
  const right = Number(rightText)

  if (!Number.isFinite(left) || !Number.isFinite(right)) return null
  if (operation === '+') return left + right
  if (operation === '-') return left - right
  if (operation === '×' || operation === 'Ã—') return left * right
  if (operation === '÷' || operation === 'Ã·') return left / right
  return null
}

export default function LoginSplitPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaChallenge, setCaptchaChallenge] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [otp, setOtp] = useState('')
  const otpRef = useRef<HTMLInputElement>(null)
  const expectedCaptchaAnswer = solveCaptcha(captchaChallenge)
  const captchaStatus = captchaAnswer.trim() === '' || expectedCaptchaAnswer === null
    ? 'idle'
    : Number(captchaAnswer) === expectedCaptchaAnswer ? 'correct' : 'incorrect'
  const captchaInputClass = captchaStatus === 'correct'
    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 focus:border-emerald-500 focus:bg-emerald-50 focus:ring-emerald-500/15'
    : captchaStatus === 'incorrect'
      ? 'border-red-500 bg-red-50 text-red-700 focus:border-red-500 focus:bg-red-50 focus:ring-red-500/15'
      : 'border-slate-300 bg-slate-100 text-slate-900 hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-indigo-500/10'

  const loadCaptcha = useCallback(async (showError = true) => {
    try {
      const response = await apiFetch(`${API_URL}/captcha`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load security check')
      setCaptchaId(data.captchaId)
      setCaptchaChallenge(data.challenge)
      setCaptchaAnswer('')
    } catch (reason) {
      if (showError) toast({ title: 'Security check unavailable', description: reason instanceof Error ? reason.message : 'Unable to reach the login server', variant: 'error' })
    }
  }, [toast])

  useEffect(() => { const timer = window.setTimeout(() => { void loadCaptcha(false) }, 0); return () => window.clearTimeout(timer) }, [loadCaptcha])
  useEffect(() => { if (verificationId) otpRef.current?.focus() }, [verificationId])

  async function submitLogin() {
    if (!email.trim() || !password || !captchaAnswer.trim()) {
      toast({ title: 'Complete the required fields', description: 'Enter your email, password, and CAPTCHA answer.', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, captchaId, captchaAnswer }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Login failed')
      setVerificationId(data.verificationId)
      toast({ title: 'Verification code sent', description: 'Check your registered email for the 6-digit code.', variant: 'success', duration: 6000 })
    } catch (reason) {
      toast({ title: 'Sign in unsuccessful', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' })
      setCaptchaId('')
      void loadCaptcha(false)
    } finally { setLoading(false) }
  }

  async function submitOtp() {
    if (otp.length !== 6) {
      toast({ title: 'Enter the complete code', description: 'The verification code contains 6 digits.', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch(`${API_URL}/verify-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationId, otp }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'OTP verification failed')
      storeSession(data)
      toast({ title: 'Welcome back', description: 'Your identity was verified successfully.', variant: 'success', duration: 1800 })
      const destination = window.location.pathname === '/kiosk' ? '/kiosk' : '/overview?view=overview'
      window.setTimeout(() => { window.location.href = destination }, 450)
    } catch (reason) {
      toast({ title: 'Verification failed', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' })
    } finally { setLoading(false) }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!loading) void (verificationId ? submitOtp() : submitLogin())
  }

  return (
    <main className="min-h-screen bg-slate-950 p-0 text-slate-900 lg:p-4">
      <div className="mx-auto grid min-h-screen max-w-[1500px] overflow-hidden bg-white shadow-2xl lg:min-h-[calc(100vh-2rem)] lg:grid-cols-[1.05fr_.95fr] lg:rounded-[2rem]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -right-20 -top-16 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Fingerprint className="h-5 w-5" /></div><span className="text-xl font-bold">Workpulse<span className="text-violet-300">AI</span></span></div>
          <div className="relative max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-indigo-200"><Sparkles className="h-3.5 w-3.5" /> Smarter workforce operations</div>
            <h1 className="m-0 text-5xl font-bold leading-[1.05] tracking-[-0.04em] text-white xl:text-6xl">Your people.<br />One secure workspace.</h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-indigo-100/70">Manage attendance, payroll, employee records, and workforce insights with confidence.</p>
            <div className="mt-10 grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-white/10 bg-white/[.06] p-5 backdrop-blur"><Users className="h-5 w-5 text-violet-300" /><p className="mt-4 text-sm font-semibold text-white">Unified employee records</p></div>
              <div className="rounded-2xl border border-white/10 bg-white/[.06] p-5 backdrop-blur"><ShieldCheck className="h-5 w-5 text-emerald-300" /><p className="mt-4 text-sm font-semibold text-white">Protected by 2-step verification</p></div>
            </div>
          </div>
          <p className="relative text-xs text-indigo-200/50">Secure workforce management for modern teams.</p>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 sm:px-6 lg:min-h-0 lg:px-16 xl:px-24">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8 lg:border-0 lg:p-0 lg:shadow-none">
            <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white"><Fingerprint className="h-5 w-5" /></div><span className="text-xl font-bold">Workpulse<span className="text-indigo-600">AI</span></span></div>
            <div className="mb-8">
              <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-indigo-600">{verificationId ? 'Step 2 of 2' : 'Secure workspace access'}</p>
              <h2 className="m-0 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{verificationId ? 'Check your email' : 'Welcome back'}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-500">{verificationId ? `Enter the 6-digit code sent to ${email}.` : 'Sign in to continue to your Workpulse workspace.'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {verificationId ? (
                <div><label htmlFor="otp" className="mb-2 block text-sm font-semibold text-slate-700">Verification code</label><input ref={otpRef} id="otp" autoComplete="one-time-code" inputMode="numeric" maxLength={6} className="h-14 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-center text-xl font-semibold tracking-[.45em] outline-none transition hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} /></div>
              ) : (
                <>
                  <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Corporate email</label><input id="email" autoComplete="username" type="email" required autoFocus className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
                  <div><div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label><a href="#" className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">Forgot password?</a></div><div className="relative"><input id="password" autoComplete="current-password" required type={showPassword ? 'text' : 'password'} className="h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 pr-12 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
                  <div>
                    <label htmlFor="captcha" className="mb-2 block text-sm font-semibold text-slate-700">Security check</label>
                    <div className="grid grid-cols-[7rem_1fr_2.75rem] gap-2">
                      <div className="grid h-12 place-items-center rounded-xl bg-slate-950 font-mono text-base font-bold tracking-wider text-white" aria-label={`Solve ${captchaChallenge}`}>{captchaChallenge || '•••'}</div>
                      <input id="captcha" required inputMode="numeric" aria-invalid={captchaStatus === 'incorrect'} aria-describedby="captcha-feedback" className={`h-12 min-w-0 rounded-xl border px-4 text-sm font-semibold outline-none transition focus:ring-4 ${captchaInputClass}`} placeholder="Answer" value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value.replace(/\D/g, ''))} />
                      <button type="button" onClick={() => void loadCaptcha()} className="grid h-12 place-items-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600" aria-label="Get a new CAPTCHA"><RefreshCw className="h-4 w-4" /></button>
                    </div>
                    <p id="captcha-feedback" aria-live="polite" className={`mt-1.5 min-h-5 text-xs font-semibold ${captchaStatus === 'correct' ? 'text-emerald-600' : captchaStatus === 'incorrect' ? 'text-red-600' : 'text-transparent'}`}>
                      {captchaStatus === 'correct' ? '✓ Correct answer' : captchaStatus === 'incorrect' ? '✕ Incorrect answer' : 'Enter your answer'}
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-indigo-600" /> Keep me signed in on this device</label>
                </>
              )}

              <button type="submit" disabled={loading || (!verificationId && !captchaId)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Verifying…</> : <>{verificationId ? 'Verify and continue' : 'Sign in securely'} <ArrowRight className="h-4 w-4" /></>}</button>
              {verificationId && <button type="button" onClick={() => { setVerificationId(''); setOtp(''); void loadCaptcha(false) }} className="w-full text-center text-sm font-semibold text-slate-500 hover:text-indigo-600">Back to sign in</button>}
            </form>
            <p className="mt-8 text-center text-xs leading-5 text-slate-400">By continuing, you agree to your organization’s security and acceptable-use policies.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
