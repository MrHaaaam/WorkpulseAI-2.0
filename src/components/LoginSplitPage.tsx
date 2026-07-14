import { useState } from 'react'

// Perfectly centered Biometric Eye / Face Scan Icon
function BiometricEyeIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor" />
      <path d="M7 10c0-1.5 2-3 5-3s5 1.5 5 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M5 13c1.5 4 4.5 6 7 6s5.5-2 7-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

// Open Eye for Password
function EyeIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Closed Eye with Slash for Password
function EyeOffIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.87871 9.87866C9.1775 10.4439 8.78318 11.238 8.84752 12.0628C8.91187 12.8876 9.42621 13.6067 10.1878 13.9351C10.9493 14.2635 11.8322 14.149 12.4831 13.6364"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.7303 5.0732C11.1448 5.02487 11.5684 5 11.9999 5C18.9999 5 21.9999 12 21.9999 12C21.9999 12 20.8931 14.5772 18.6659 16.7337"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.0838 18.8488C13.4118 18.9486 12.716 19 11.9999 19C4.99991 19 1.99991 12 1.99991 12C1.99991 12 3.25055 9.11059 5.86016 6.86011"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M2 2L22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function StarIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 17.3 6.2 20.5l1.1-6.5L2.6 9.7l6.6-1 2.8-6 2.8 6 6.6 1-4.7 4.3 1.1 6.5z" />
    </svg>
  )
}

function CheckIcon(props: { className?: string }) {
  return (
    <svg className={props.className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function LoginSplitPage() {
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(false)

  // NEW: State to track password visibility
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="flex min-h-screen w-full flex-col bg-white font-sans text-slate-900 md:flex-row overflow-hidden select-none">
      {/* LEFT SIDE: Optimized transition (width + form open/close) */}
      <div
        className={`relative flex min-h-screen flex-col items-center justify-center bg-white px-6 transition-[width,opacity,transform] duration-500 ease-out md:px-12 transform-gpu backface-hidden ${
          active ? 'md:w-[70%]' : 'md:w-1/2'
        }`}
      >
        {!active && (
          <button
            type="button"
            className="absolute inset-0 z-30 flex h-full w-full cursor-pointer flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] opacity-0 transition-opacity duration-500 hover:opacity-100"
            onClick={() => setActive(true)}
            aria-label="Unlock login form"
          >
            <div className="rounded-xl bg-indigo-600 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-xl">👉 Click here to sign in</div>
          </button>
        )}

        {/* Inner container with fixed max-width to stabilize wrapping during width change */}
            <div className="z-10 w-full max-w-sm flex-shrink-0 transform-gpu transition-[opacity,transform] duration-400 ease-out">
          <div className="mb-10 flex items-center justify-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 2L6 13h6l-2 9 10-11h-6l2-10z" fill="white" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight whitespace-nowrap">
              Workpulse<span className="text-indigo-600">AI</span>
            </span>
          </div>

          <h1 className="text-center text-3xl font-bold tracking-tight md:text-4xl">Welcome Back</h1>
          <p className="mt-2 text-center text-sm text-slate-500">Enter your credentials to continue</p>

          <div className="mt-12 w-full">
            {!active && (
              <div className="flex flex-col items-center justify-center">
                <div className="rounded-2xl bg-indigo-50/70 p-8 border border-indigo-100">
                  <BiometricEyeIcon className="h-12 w-12 text-indigo-600 animate-pulse" />
                </div>
              </div>
            )}

            {/* Form container optimized to fade smoothly rather than jump-resize */}
            <div className={`transition-[max-height,opacity,transform] duration-500 ease-out ${active ? 'pointer-events-auto max-h-[36rem] translate-y-0 opacity-100 overflow-visible' : 'pointer-events-none max-h-0 translate-y-2 overflow-hidden opacity-0'}`}>
              <p className="mb-6 text-center text-xs font-medium tracking-wide uppercase text-slate-400">Secure Access Authentication</p>

              <div className="mb-5 flex w-full items-center gap-3">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setLoading(true)
                    setTimeout(() => setLoading(false), 1200)
                  }}
                  className="flex-1 flex items-center justify-center gap-3 rounded-xl bg-indigo-600 px-5 py-3.5 font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-70 cursor-pointer will-change-[transform]"
                >
                  <BiometricEyeIcon className="h-5 w-5" />
                  {loading ? 'Verifying Identity...' : 'Touch Biometrics Sensor'}
                </button>

                {/* Temporary bypass for when no database/auth is wired yet */}
                <button
                  type="button"
                  onClick={() => {
                    // Simulate manager access by opening the app overview shell
                    window.location.href = `/overview?view=overview&role=manager`;
                  }}
                  className="flex-shrink-0 rounded-xl border border-[#8642ED]/20 bg-white px-4 py-3.5 text-sm font-semibold text-[#8642ED] shadow-sm hover:bg-[#8642ED]/10 transition"
                >
                  Manager
                </button>

                <button
                  type="button"
                  onClick={() => {
                    // Open app with admin view
                    window.location.href = `/overview?view=admin&role=admin`;
                  }}
                  className="ml-2 flex-shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
                >
                  Admin
                </button>
              </div>


              <div className="space-y-3.5 w-full">
                <input
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all flex-shrink-0"
                  placeholder="Username or Corporate Email"
                  type="email"
                />

                {/* PASSWORD FIELD WITH EYE TOGGLE */}
                <div className="relative w-full">
                  <input
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3.5 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                    placeholder="Security Password"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors focus:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between text-sm w-full">
                <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer text-xs font-medium whitespace-nowrap">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                  Keep me authenticated
                </label>
                <a href="#" className="text-xs font-semibold text-indigo-600 hover:underline whitespace-nowrap">
                  Forgot Access Key?
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: Optimized transition */}
      <div
        className={`relative flex min-h-screen flex-col justify-between px-8 py-14 transition-[width,opacity,transform] duration-500 ease-out md:px-16 transform-gpu backface-hidden ${
          active ? 'md:w-[30%] bg-slate-950' : 'md:w-1/2 bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950'
        }`}
      >
        {active && (
          <button
            onClick={() => setActive(false)}
            className="absolute inset-0 z-30 flex h-full w-full cursor-pointer flex-col items-center justify-center bg-slate-950/60 backdrop-blur-[2px] opacity-0 hover:opacity-100 transition-opacity duration-500"
          >
            <span className="text-white text-xs font-bold uppercase tracking-widest bg-white/10 px-6 py-3 rounded-xl border border-white/10 whitespace-nowrap">👈 Click to close</span>
          </button>
        )}

        {/* Content wrapper with opacity fading to avoid layout-shift-lag */}
        <div className={`transition-[opacity,transform] duration-300 ease-out ${active ? 'opacity-30' : 'opacity-100'}`}>
          <div className="relative z-10 w-full max-w-xl mx-auto flex flex-col h-full justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="rounded-full bg-white/5 px-3.5 py-1.5 text-xs font-bold tracking-wider text-indigo-300 border border-white/10 uppercase whitespace-nowrap">
                  WorkPulse
                </div>
              </div>

              <div className="mt-12">
                <h2 className="text-3xl font-extrabold leading-tight text-white md:text-5xl tracking-tight">
                  Workpulse AI <span className="italic text-indigo-400 block md:inline font-light">AND BIOMETRICS.</span>
                </h2>

                <ul className="mt-10 space-y-4">
                  <li className="flex items-start gap-4 rounded-2xl bg-white/[0.03] p-4 border border-white/[0.06] backdrop-blur-md">
                    <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-indigo-300 border border-white/5">
                      <CheckIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white text-base whitespace-nowrap">Unified Staff Directory</div>
                      <div className="mt-1 text-sm text-indigo-200/60 leading-relaxed">Manage profiles, departments, and roles in one secure cloud.</div>
                    </div>
                  </li>

                  <li className="flex items-start gap-4 rounded-2xl bg-white/[0.03] p-4 border border-white/[0.06] backdrop-blur-md">
                    <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-indigo-300 border border-white/5">
                      <StarIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white text-base whitespace-nowrap">Smart Attendance</div>
                      <div className="mt-1 text-sm text-indigo-200/60 leading-relaxed">Biometric-verified clock-ins and automated work hour calculation.</div>
                    </div>
                  </li>

                  <li className="flex items-start gap-4 rounded-2xl bg-white/[0.03] p-4 border border-white/[0.06] backdrop-blur-md">
                    <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-indigo-300 border border-white/5 text-xs">🔒</div>
                    <div>
                      <div className="font-semibold text-white text-base whitespace-nowrap">Enterprise Security</div>
                      <div className="mt-1 text-sm text-indigo-200/60 leading-relaxed">Your data is protected by bank-grade encryption.</div>
                    </div>
                  </li>
                </ul>
              </div>
            </div>

            <div className={`mt-12 transition-[opacity,transform] duration-400 ease-out ${active ? 'opacity-0 translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}>
              <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon key={i} className="h-3.5 w-3.5 text-indigo-400" />
                  ))}
                </div>

                <p className="mt-4 text-sm text-indigo-100/80 leading-relaxed font-medium">
                  <span className="italic">"WorkPulse AI reduced our manual attendance processing time by 80% in the first month."</span>
                </p>

                <div className="mt-5 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-white/10 flex items-center justify-center font-bold text-xs text-indigo-300">
                    JD
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Jason Draven</div>
                    <div className="text-xs tracking-wider font-semibold text-indigo-400/80 uppercase">HR Director, TechCorp</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

