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
          // Session was invalidated server-side (password change, deactivation, etc.)
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
    <header className="bg-white border-b border-gray-200 px-6 py-6 flex flex-col items-center justify-center relative">
      <div className="absolute right-4 top-4 flex items-center gap-4">
        {username && (
          <span className="text-sm text-gray-600 hidden sm:inline">
            {username}
          </span>
        )}
        {isAdmin && (
          <a href="/admin" className="text-sm font-medium text-gray-600 hover:text-yoi-primary transition-colors">
            Admin
          </a>
        )}
        <button
          onClick={handleLogout}
          className="text-sm font-medium text-gray-600 hover:text-danger transition-colors"
        >
          Sign out
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/yum_logo.png" alt="Yum of India" className="h-32 sm:h-40 w-auto" />
      <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-wide text-center bg-gradient-to-r from-yoi-primary via-yoi-accent to-yoi-primary bg-clip-text text-transparent animate-shimmer bg-[length:200%_auto]">
        Yum Of India Daily Dashboard
      </h1>
    </header>
  )
}
