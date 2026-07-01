'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Header() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [username, setUsername] = useState('')

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.user) {
          setIsAdmin(d.user.isAdmin)
          setUsername(d.user.username)
        } else {
          router.push('/login')
        }
      })
      .catch(() => {})
  }, [router])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header
      style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E4E7F3', boxShadow: '0 1px 3px rgba(79,70,229,0.06)' }}
      className="px-6 py-4 flex flex-col items-center justify-center relative"
    >
      <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
        {username && (
          <span className="text-xs font-medium hidden sm:inline px-2.5 py-1 rounded-full" style={{ backgroundColor: '#F0F2FA', color: '#64748B', border: '1px solid #E4E7F3' }}>
            {username}
          </span>
        )}
        {isAdmin && (
          <a href="/admin" className="text-xs font-semibold transition-colors px-3 py-1.5 rounded-full" style={{ backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }}>
            Admin
          </a>
        )}
        <button
          onClick={handleLogout}
          className="text-xs font-semibold transition-colors px-3 py-1.5 rounded-full"
          style={{ backgroundColor: '#F0F2FA', color: '#64748B', border: '1px solid #E4E7F3' }}
        >
          Sign out
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/yum_logo.png" alt="Yum of India" className="h-24 sm:h-28 w-auto" />
        <h1 className="text-xl sm:text-2xl font-extrabold tracking-wide text-center bg-gradient-to-r from-yoi-primary via-yoi-accent to-yoi-primary bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
          Yum Of India Daily Dashboard
        </h1>
      </div>
    </header>
  )
}
