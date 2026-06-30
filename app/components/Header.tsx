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
    <header style={{ backgroundColor: '#0D1117', borderBottom: '1px solid #21262D' }} className="px-6 py-4 flex flex-col items-center justify-center relative">
      <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-3">
        {username && (
          <span className="text-xs font-medium hidden sm:inline px-2.5 py-1 rounded-full" style={{ backgroundColor: '#21262D', color: '#8B949E' }}>
            {username}
          </span>
        )}
        {isAdmin && (
          <a href="/admin" className="text-xs font-semibold transition-colors px-3 py-1.5 rounded-full" style={{ backgroundColor: '#161B22', color: '#0D9488', border: '1px solid #21262D' }}>
            Admin
          </a>
        )}
        <button
          onClick={handleLogout}
          className="text-xs font-semibold transition-colors px-3 py-1.5 rounded-full"
          style={{ backgroundColor: '#161B22', color: '#8B949E', border: '1px solid #21262D' }}
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
