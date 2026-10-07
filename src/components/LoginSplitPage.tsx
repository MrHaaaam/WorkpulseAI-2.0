import { Input } from "./ui/Input";
import { LOGIN_PASSWORD_MAX, PASSWORD_MIN, PASSWORD_MAX, PASSWORD_RULES, passwordInput, countSpecialCharacters, passwordValidationError } from '../../shared/password-policy.js'
import { emailInput, validEmail } from '../../shared/input-format.js'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Fingerprint, KeyRound, LoaderCircle, Mail, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react'
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
  const [demoEnabled, setDemoEnabled] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    void apiFetch(`${API_URL}/demo-config`, { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(data => { if (data) setDemoEnabled(data.enabled === true) }).catch(() => {})
    return () => controller.abort()
  }, [])
  const [retryUntil, setRetryUntil] = useState(() => Number(sessionStorage.getItem('loginRetryUntil') || 0))
  const [retrySeconds, setRetrySeconds] = useState(() => Math.max(0, Math.ceil((Number(sessionStorage.getItem('loginRetryUntil') || 0) - Date.now()) / 1000)))
  useEffect(() => {
    const timer = window.setInterval(() => setRetrySeconds(Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000))), 250)
    return () => window.clearInterval(timer)
  }, [retryUntil])
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [captchaId, setCaptchaId] = useState('')
  const [captchaChallenge, setCaptchaChallenge] = useState('')
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [verificationId, setVerificationId] = useState('')
  const [otp, setOtp] = useState('')
  const [recoveryStep, setRecoveryStep] = useState<'login' | 'email' | 'code' | 'password'>('login')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryVerificationId, setRecoveryVerificationId] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryToken, setRecoveryToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
    if (loading || retryUntil > Date.now()) return
    if (!email.trim() || !password || !captchaAnswer.trim()) {
      toast({ title: 'Complete the required fields', description: 'Enter your email, password, and CAPTCHA answer.', variant: 'error' })
      return
    }
    if (['admin', 'employee'].includes(email.trim().toLowerCase()) && !demoEnabled) {
      toast({ title: 'Demo login is not enabled here', description: 'Use the separate demo site. For local testing, start both demo servers and open localhost:5174.', variant: 'error' })
      return
    }
    if ((!validEmail(email) && !(demoEnabled && ['admin', 'employee'].includes(email.trim().toLowerCase()))) || /\s/.test(password)) {
      toast({ title: 'Check your login details', description: 'Enter a valid email address and a password without spaces.', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, captchaId, captchaAnswer }) })
      const data = await response.json()
      if (data.retryAfterSeconds > 0) {
        const until = Date.now() + data.retryAfterSeconds * 1000
        setRetryUntil(until)
        setRetrySeconds(data.retryAfterSeconds)
        sessionStorage.setItem('loginRetryUntil', String(until))
      }
      if (!response.ok) throw new Error(data.error || 'Login failed')
      sessionStorage.removeItem('loginRetryUntil')
      setRetryUntil(0)
      setRetrySeconds(0)
      if (data.authenticated && data.demo) {
        storeSession(data)
        window.history.replaceState(null, '', '/')
        window.location.assign('/overview?view=overview')
        return
      }
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
      window.setTimeout(() => {
        // Preserve a sign-in entry behind the first authenticated page.
        window.history.replaceState(null, '', '/')
        window.location.assign(destination)
      }, 450)
    } catch (reason) {
      toast({ title: 'Verification failed', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' })
    } finally { setLoading(false) }
  }

  async function requestPasswordReset() {
    if (!validEmail(recoveryEmail)) {
      toast({ title: 'Enter your employee email', description: 'Use the email connected to your employee account.', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch(`${API_URL}/forgot-password/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recoveryEmail }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to send a reset code')
      setRecoveryVerificationId(data.verificationId || '')
      setRecoveryStep('code')
      toast({ title: 'Check your email', description: data.message || 'A 6-digit reset code was sent if the employee account exists.', variant: 'success' })
    } catch (reason) {
      toast({ title: 'Reset code not sent', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' })
    } finally { setLoading(false) }
  }

  async function verifyPasswordResetCode() {
    if (recoveryCode.length !== 6 || !recoveryVerificationId) {
      toast({ title: 'Enter the complete code', description: 'The reset code contains 6 digits.', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch(`${API_URL}/forgot-password/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationId: recoveryVerificationId, code: recoveryCode }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to verify the reset code')
      setRecoveryToken(data.resetToken)
      setRecoveryStep('password')
    } catch (reason) {
      toast({ title: 'Code not accepted', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' })
    } finally { setLoading(false) }
  }

  async function resetEmployeePassword() {
    const passwordError = passwordValidationError(newPassword)
    if (passwordError) {
      toast({ title: 'Check your new password', description: passwordError, variant: 'error' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Passwords do not match', description: 'Enter the same password in both fields.', variant: 'error' })
      return
    }
    setLoading(true)
    try {
      const response = await apiFetch(`${API_URL}/forgot-password/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verificationId: recoveryVerificationId, resetToken: recoveryToken, newPassword }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Unable to reset your password')
      setRecoveryStep('login'); setRecoveryEmail(''); setRecoveryCode(''); setRecoveryVerificationId(''); setRecoveryToken(''); setNewPassword(''); setConfirmPassword('')
      toast({ title: 'Password reset complete', description: 'You can now sign in with your new password.', variant: 'success', duration: 6000 })
    } catch (reason) {
      toast({ title: 'Password not reset', description: reason instanceof Error ? reason.message : 'Please try again.', variant: 'error' })
    } finally { setLoading(false) }
  }

  function leavePasswordRecovery() {
    setRecoveryStep('login'); setRecoveryCode(''); setRecoveryVerificationId(''); setRecoveryToken(''); setNewPassword(''); setConfirmPassword('')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    if (recoveryStep === 'email') return void requestPasswordReset()
    if (recoveryStep === 'code') return void verifyPasswordResetCode()
    if (recoveryStep === 'password') return void resetEmployeePassword()
    void (verificationId ? submitOtp() : submitLogin())
  }

  const recoveryTitle = recoveryStep === 'email' ? 'Reset employee password' : recoveryStep === 'code' ? 'Enter your reset code' : 'Create a new password'
  const recoveryDescription = recoveryStep === 'email'
    ? 'Enter the email connected to your employee account.'
    : recoveryStep === 'code' ? `Enter the 6-digit code sent to ${recoveryEmail}.` : 'Use the same password format as your employee portal.'
  const validNewPassword = !passwordValidationError(newPassword)
  const newPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  return (
    <main className="min-h-screen bg-slate-950 p-0 text-slate-900 lg:p-4">
      <a href="#sign-in-form" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-white px-4 py-3 font-semibold text-indigo-700 shadow-xl focus:not-sr-only">Skip to sign in</a>
      <div className="mx-auto grid min-h-screen max-w-[1500px] overflow-hidden bg-white shadow-2xl lg:min-h-[calc(100vh-2rem)] lg:grid-cols-[1.05fr_.95fr] lg:rounded-[2rem]">
        <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-16">
          <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute -right-20 -top-16 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
          <div className="relative flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Fingerprint className="h-5 w-5" /></div><span className="text-xl font-bold">WORKPULSE<span className="text-violet-300"> MVL</span></span></div>
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
            <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-600 text-white"><Fingerprint className="h-5 w-5" /></div><span className="text-xl font-bold">WORKPULSE<span className="text-indigo-600"> MVL</span></span></div>
            <div className="mb-8">
              <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-indigo-600">{recoveryStep !== 'login' ? 'Employee account recovery' : verificationId ? 'Step 2 of 2' : 'Secure workspace access'}</p>
              <h1 className="m-0 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{recoveryStep !== 'login' ? recoveryTitle : verificationId ? 'Check your email' : 'Sign in to WORKPULSE MVL'}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-600">{recoveryStep !== 'login' ? recoveryDescription : verificationId ? `Enter the 6-digit code sent to ${email}.` : 'Use your organization account to continue securely.'}</p>
            </div>

            <form id="sign-in-form" onSubmit={handleSubmit} className="space-y-5" aria-busy={loading}>
              {recoveryStep === 'email' ? (
                <div><label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-slate-800">Employee email</label><div className="relative"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><Input id="recovery-email" autoComplete="email" type="email" onKeyDown={event => { if (event.key === " ") event.preventDefault() }} maxLength={254} required autoFocus className="h-12 w-full rounded-xl border border-slate-400 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20" placeholder="you@company.com" value={recoveryEmail} onChange={(event) => setRecoveryEmail(emailInput(event.target.value))} /></div></div>
              ) : recoveryStep === 'code' ? (
                <div><label htmlFor="recovery-code" className="mb-2 block text-sm font-semibold text-slate-800">6-digit reset code</label><Input id="recovery-code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} required autoFocus className="h-14 w-full rounded-xl border border-slate-400 bg-white px-4 text-center text-xl font-semibold tracking-[.45em] outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20" placeholder="000000" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, ''))} /></div>
              ) : recoveryStep === 'password' ? (
                <>
                  <div><label htmlFor="recovery-new-password" className="mb-2 block text-sm font-semibold text-slate-800">New password</label><div className="relative"><KeyRound className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" /><Input id="recovery-new-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required autoFocus className="h-12 w-full rounded-xl border border-slate-400 bg-white pl-11 pr-12 text-sm outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20" placeholder="Enter 8 to 60 characters" value={newPassword} onChange={(event) => setNewPassword(passwordInput(event.target.value))} /><button type="button" onClick={() => setShowPassword((shown) => !shown)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div><p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${validNewPassword ? 'text-emerald-600' : 'text-slate-500'}`}><Check className="h-3.5 w-3.5" />{PASSWORD_RULES} ({newPassword.length}/{PASSWORD_MAX} characters; {countSpecialCharacters(newPassword)}/5 special characters)</p></div>
                  <div><label htmlFor="recovery-confirm-password" className="mb-2 block text-sm font-semibold text-slate-800">Confirm new password</label><Input id="recovery-confirm-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required className="h-12 w-full rounded-xl border border-slate-400 bg-white px-4 text-sm outline-none transition focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20" placeholder="Enter the same password again" value={confirmPassword} onChange={(event) => setConfirmPassword(passwordInput(event.target.value))} />{confirmPassword && !newPasswordsMatch && <p className="mt-2 text-xs font-medium text-red-600">The passwords do not match.</p>}</div>
                </>
              ) : verificationId ? (
                <div><label htmlFor="otp" className="mb-2 block text-sm font-semibold text-slate-700">Verification code</label><Input ref={otpRef} id="otp" autoComplete="one-time-code" inputMode="numeric" maxLength={6} className="h-14 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-center text-xl font-semibold tracking-[.45em] outline-none transition hover:border-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10" placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ''))} /></div>
              ) : (
                <>
                  <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-800">{demoEnabled ? "Email or demo username" : "Organization email"} <span className="text-red-600" aria-hidden="true">*</span></label><Input id="email" autoComplete="username" type="text" inputMode={demoEnabled ? "text" : "email"} onKeyDown={event => { if (event.key === " ") event.preventDefault() }} maxLength={254} required autoFocus aria-required="true" className="h-12 w-full rounded-xl border border-slate-400 bg-white px-4 text-sm outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20" placeholder="you@company.com" value={email} onChange={(event) => setEmail(emailInput(event.target.value))} /><p className="mt-1 text-xs text-slate-500">{demoEnabled ? "Demo login: admin or employee. Complete CAPTCHA; OTP is skipped." : "Use a valid email address. No spaces."} {email.length}/254 characters</p></div>
                  <div><div className="mb-2 flex items-center justify-between"><label htmlFor="password" className="text-sm font-semibold text-slate-800">Password <span className="text-red-600" aria-hidden="true">*</span></label><span className="text-xs text-slate-500">{password.length}/{LOGIN_PASSWORD_MAX}</span></div><div className="relative"><Input id="password" maxLength={LOGIN_PASSWORD_MAX} autoComplete="current-password" required aria-required="true" type={showPassword ? 'text' : 'password'} className="h-12 w-full rounded-xl border border-slate-400 bg-white px-4 pr-12 text-sm outline-none transition placeholder:text-slate-500 hover:border-slate-500 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-500/20" placeholder="Enter your password (no spaces)" value={password} onChange={(event) => setPassword(passwordInput(event.target.value))} /><button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-600" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div><button type="button" onClick={() => { setRecoveryEmail(email); setRecoveryStep('email') }} className="mt-2 text-sm font-semibold text-indigo-700 hover:text-indigo-900 focus:outline-none focus:underline">Forgot your employee password?</button></div>
                  <div>
                    <label htmlFor="captcha" className="mb-2 block text-sm font-semibold text-slate-800">Security check <span className="font-normal text-slate-600">— solve the math question</span></label>
                    <div className="grid grid-cols-[7rem_1fr_2.75rem] gap-2">
                      <div className="grid h-12 place-items-center rounded-xl bg-slate-950 font-mono text-base font-bold tracking-wider text-white" aria-label={`Solve ${captchaChallenge}`}>{captchaChallenge || '•••'}</div>
                      <Input id="captcha" maxLength={20} required inputMode="numeric" aria-invalid={captchaStatus === 'incorrect'} aria-describedby="captcha-feedback" className={`h-12 min-w-0 rounded-xl border px-4 text-sm font-semibold outline-none transition focus:ring-4 ${captchaInputClass}`} placeholder="Answer" value={captchaAnswer} onChange={(event) => setCaptchaAnswer(event.target.value.replace(/\D/g, ''))} />
                      <button type="button" onClick={() => void loadCaptcha()} className="grid h-12 place-items-center rounded-xl border border-slate-300 bg-slate-100 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600" aria-label="Get a new CAPTCHA"><RefreshCw className="h-4 w-4" /></button>
                    </div>
                    <p id="captcha-feedback" aria-live="polite" className={`mt-1.5 min-h-5 text-xs font-semibold ${captchaStatus === 'correct' ? 'text-emerald-600' : captchaStatus === 'incorrect' ? 'text-red-600' : 'text-transparent'}`}>
                      {captchaStatus === 'correct' ? '✓ Correct answer' : captchaStatus === 'incorrect' ? '✕ Incorrect answer' : 'Enter your answer'}
                    </p>
                  </div>
                </>
              )}

              <button type="submit" disabled={loading || (recoveryStep === 'login' && !verificationId && retrySeconds > 0) || (recoveryStep === 'login' && !verificationId && !captchaId) || (recoveryStep === 'password' && (!validNewPassword || !newPasswordsMatch))} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60">{recoveryStep === 'login' && !verificationId && retrySeconds > 0 ? `Try again in ${retrySeconds}s` : loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Please wait…</> : <>{recoveryStep === 'email' ? 'Send reset code' : recoveryStep === 'code' ? 'Verify reset code' : recoveryStep === 'password' ? 'Save new password' : verificationId ? 'Verify and continue' : 'Sign in securely'} <ArrowRight className="h-4 w-4" /></>}</button>
              {recoveryStep !== 'login' ? <button type="button" onClick={leavePasswordRecovery} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-700"><ArrowLeft className="h-4 w-4" />Back to sign in</button> : verificationId && <button type="button" onClick={() => { setVerificationId(''); setOtp(''); void loadCaptcha(false) }} className="w-full text-center text-sm font-semibold text-slate-500 hover:text-indigo-600">Back to sign in</button>}
            </form>
            <p className="mt-8 text-center text-xs leading-5 text-slate-400">By continuing, you agree to your organization’s security and acceptable-use policies.</p>
          </div>
        </section>
      </div>
    </main>
  )
}
