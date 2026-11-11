import { Input } from "../components/ui/Input";
import { PASSWORD_MIN, PASSWORD_MAX, PASSWORD_SPECIAL_MAX, validPasswordCharacters, passwordInput, countSpecialCharacters, passwordValidationError } from '../../shared/password-policy.js'
import { useState, type FormEvent } from 'react'
import { Check, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useToast } from '../components/ui/Toast'

type InitialPasswordChangeViewProps = {
  onComplete: () => void
}

export function InitialPasswordChangeView({ onComplete }: InitialPasswordChangeViewProps) {
  const { toast } = useToast()
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const passwordError = passwordValidationError(newPassword)
  const validPassword = !passwordError
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  const invalidPassword = (passwordTouched || newPassword.length > 0) && !validPassword
  const validConfirmation = validPassword && passwordsMatch
  const invalidConfirmation = (confirmTouched || confirmPassword.length > 0) && !validConfirmation
  const fieldStyle = (valid: boolean, invalid: boolean) => `h-12 w-full rounded-xl border px-4 text-sm outline-none transition focus:ring-4 ${valid ? 'border-emerald-500 bg-emerald-50/50 focus:border-emerald-600 focus:ring-emerald-500/10' : invalid ? 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-300 bg-slate-50 focus:border-indigo-500 focus:bg-white focus:ring-indigo-500/10'}`
  const rules = [
    { label: `Between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`, valid: newPassword.length >= PASSWORD_MIN && newPassword.length <= PASSWORD_MAX },
    { label: 'Letters, numbers and punctuation only; no spaces or emoji', valid: validPasswordCharacters(newPassword) },
    { label: `At most ${PASSWORD_SPECIAL_MAX} special characters`, valid: newPassword.length > 0 && countSpecialCharacters(newPassword) <= PASSWORD_SPECIAL_MAX },
  ]
  const reportError = (message: string) => {
    setError(message)
    toast({ title: 'Password not saved', description: message, variant: 'error' })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    setError('')
    setPasswordTouched(true); setConfirmTouched(true)
    if (passwordError) return reportError(passwordError)
    if (!passwordsMatch) return reportError('The passwords do not match.')
    setSubmitting(true)
    try {
      const response = await apiFetch('/api/auth/change-initial-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Unable to save your password.')
      toast({ title: 'Password created', description: 'Your temporary password has been replaced. You can now continue to your account.', variant: 'success' })
      onComplete()
    } catch (reason) {
      reportError(reason instanceof Error ? reason.message : 'Unable to save your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-950 px-4 py-10">
      <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl shadow-violet-950/30">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-7 py-8 text-white sm:px-10">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20"><KeyRound className="h-6 w-6" /></div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-100">First login security</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Create your own password</h1>
          <p className="mt-2 text-sm leading-6 text-indigo-100">Replace the temporary password from your email before opening your employee overview.</p>
        </div>

        <form noValidate onSubmit={submit} className="space-y-6 px-7 py-8 sm:px-10">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-900">
            <div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" /><p>This password is private. Your administrator will not be able to see it.</p></div>
          </div>

          <div>
            <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-700">New password</label>
            <div className="relative">
              <Input id="new-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required disabled={submitting} aria-invalid={invalidPassword} aria-describedby="new-password-rules new-password-feedback" onBlur={() => setPasswordTouched(true)} value={newPassword} onChange={(event) => { setNewPassword(passwordInput(event.target.value)); setError('') }} className={`${fieldStyle(validPassword, invalidPassword)} pr-12`} placeholder="Enter 8 to 60 characters" />
              <button type="button" disabled={submitting} onClick={() => setShowPassword((shown) => !shown)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            <div id="new-password-rules" className="mt-3 space-y-1.5">
              <div className="mb-2 flex justify-between text-xs text-slate-500"><span>{newPassword.length}/{PASSWORD_MAX} characters</span><span className={countSpecialCharacters(newPassword) > PASSWORD_SPECIAL_MAX ? 'font-semibold text-red-600' : ''}>{countSpecialCharacters(newPassword)}/{PASSWORD_SPECIAL_MAX} special characters</span></div>
              {rules.map(rule => <p key={rule.label} className={`flex items-start gap-2 text-xs leading-5 ${rule.valid ? 'text-emerald-700' : invalidPassword ? 'text-red-600' : 'text-slate-500'}`}><Check aria-hidden="true" className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${rule.valid ? 'opacity-100' : 'opacity-30'}`} /><span>{rule.label}<span className="sr-only">{rule.valid ? ' - met' : ' - not met'}</span></span></p>)}
            </div>
            <p id="new-password-feedback" aria-live="polite" className={`mt-2 text-xs font-medium ${validPassword ? 'text-emerald-700' : 'text-red-600'}`}>{validPassword ? 'Password meets all requirements.' : invalidPassword ? passwordError : ''}</p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">Confirm new password</label>
            <Input id="confirm-password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} required disabled={submitting} aria-invalid={invalidConfirmation} aria-describedby="confirm-password-feedback" onBlur={() => setConfirmTouched(true)} value={confirmPassword} onChange={(event) => { setConfirmPassword(passwordInput(event.target.value)); setError('') }} className={fieldStyle(validConfirmation, invalidConfirmation)} placeholder="Enter the same password again" />
            <p id="confirm-password-feedback" aria-live="polite" className={`mt-2 text-xs font-medium ${validConfirmation ? 'text-emerald-700' : 'text-red-600'}`}>{validConfirmation ? 'Passwords match.' : invalidConfirmation ? !confirmPassword ? 'Confirm your new password.' : !passwordsMatch ? 'The passwords do not match.' : 'Fix the new password requirements above.' : ''}</p>
          </div>

          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

          <button type="submit" disabled={submitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" />Saving password...</> : 'Save password and continue'}
          </button>
        </form>
      </section>
    </main>
  )
}
