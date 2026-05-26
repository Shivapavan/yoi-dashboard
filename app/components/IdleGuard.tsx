'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const IDLE_MS    = 20 * 60 * 1000   // 20 minutes
const WARN_MS    = 2  * 60 * 1000   // warn 2 minutes before logout
const EVENTS     = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

export default function IdleGuard({ children }: { children: React.ReactNode }) {
  const router  = useRouter()
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showWarn, setShowWarn]   = useState(false)
  const [countdown, setCountdown] = useState(WARN_MS / 1000)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login?reason=idle')
  }, [router])

  const resetTimer = useCallback(() => {
    setShowWarn(false)
    if (timer.current)   clearTimeout(timer.current)
    if (warnRef.current) clearTimeout(warnRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)

    // Set warning timer (fires at IDLE_MS - WARN_MS)
    warnRef.current = setTimeout(() => {
      setShowWarn(true)
      setCountdown(WARN_MS / 1000)
      countdownRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(countdownRef.current!) ; return 0 }
          return c - 1
        })
      }, 1000)
    }, IDLE_MS - WARN_MS)

    // Set logout timer
    timer.current = setTimeout(() => {
      logout()
    }, IDLE_MS)
  }, [logout])

  useEffect(() => {
    resetTimer()
    EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    return () => {
      if (timer.current)   clearTimeout(timer.current)
      if (warnRef.current) clearTimeout(warnRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      EVENTS.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [resetTimer])

  const mins = Math.floor(countdown / 60)
  const secs = countdown % 60

  return (
    <>
      {children}

      {showWarn && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full text-center">
            <div className="text-4xl mb-3">⏱</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Still there?</h2>
            <p className="text-gray-500 text-sm mb-4">
              You'll be signed out due to inactivity in
            </p>
            <div className="text-4xl font-mono font-bold text-red-600 mb-6">
              {mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`}
            </div>
            <button
              onClick={resetTimer}
              className="w-full bg-purple-700 hover:bg-purple-800 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
            >
              Keep me signed in
            </button>
          </div>
        </div>
      )}
    </>
  )
}
