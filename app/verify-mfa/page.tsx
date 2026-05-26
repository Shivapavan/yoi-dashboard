'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function VerifyMfaPage() {
  const router  = useRouter()
  const [code, setCode]       = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const [resent, setResent]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      router.push(data.redirect)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    const res = await fetch('/api/auth/send-otp', { method: 'POST' })
    if (res.ok) { setResent(true); setTimeout(() => setResent(false), 5000) }
    else {
      const d = await res.json()
      setError(d.error)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-20 w-auto mx-auto mb-2" />
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Phone</h1>
          <p className="text-sm text-gray-500 mt-1">We sent a 6-digit code to your phone.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Verification Code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-center tracking-widest text-lg font-mono focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="000000"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                {error}
              </div>
            )}
            {resent && (
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">
                New code sent!
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>

          <div className="mt-4 text-center space-y-2">
            <button onClick={handleResend} className="text-sm text-purple-600 hover:text-purple-800">
              Resend code
            </button>
            <div>
              <a href="/login" className="text-sm text-gray-400 hover:text-gray-600">
                Back to login
              </a>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-4">
            This device will be remembered for 12 days.
          </p>
        </div>
      </div>
    </div>
  )
}
