'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  )
}

function PwField({ label, value, onChange, autoComplete }: {
  label: string; value: string; onChange: (v: string) => void; autoComplete?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          required
          autoComplete={autoComplete}
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <button type="button" onClick={() => setShow(v => !v)} tabIndex={-1}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  )
}

function ChangePasswordForm() {
  const router  = useRouter()
  const params  = useSearchParams()
  const reason  = params.get('reason')

  const [current, setCurrent]   = useState('')
  const [newPw, setNewPw]       = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const needsCurrent = reason !== 'forgot'

  const requirements = [
    { label: 'At least 8 characters',     ok: newPw.length >= 8 },
    { label: 'One uppercase letter (A–Z)', ok: /[A-Z]/.test(newPw) },
    { label: 'One number (0–9)',           ok: /[0-9]/.test(newPw) },
    { label: 'One special character',      ok: /[^A-Za-z0-9]/.test(newPw) },
    { label: 'Passwords match',            ok: newPw.length > 0 && newPw === confirm },
  ]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirm) { setError('Passwords do not match.'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current || undefined, newPassword: newPw }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push(data.redirect)
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  const headings: Record<string, string> = {
    temp: 'Set Your Password', expired: 'Password Expired', forgot: 'Reset Your Password',
  }
  const subtexts: Record<string, string> = {
    temp:    'Your account was created with a temporary password. Please set a new one.',
    expired: 'Your password is over 6 months old. Please set a new one.',
    forgot:  'Create a new password for your account.',
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-20 w-auto mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-gray-900">{headings[reason ?? 'temp'] ?? 'Change Password'}</h1>
          <p className="text-sm text-gray-500 mt-1">{subtexts[reason ?? 'temp'] ?? ''}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {needsCurrent && (
              <PwField label="Current Password" value={current} onChange={setCurrent} autoComplete="current-password" />
            )}
            <PwField label="New Password" value={newPw} onChange={setNewPw} autoComplete="new-password" />
            <PwField label="Confirm New Password" value={confirm} onChange={setConfirm} autoComplete="new-password" />

            {newPw.length > 0 && (
              <ul className="space-y-1 text-xs">
                {requirements.map(r => (
                  <li key={r.label} className={`flex items-center gap-1.5 ${r.ok ? 'text-green-600' : 'text-gray-400'}`}>
                    <span>{r.ok ? '✓' : '○'}</span>{r.label}
                  </li>
                ))}
              </ul>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading || !requirements.every(r => r.ok)}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Saving…' : 'Set New Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function ChangePasswordPage() {
  return <Suspense><ChangePasswordForm /></Suspense>
}
