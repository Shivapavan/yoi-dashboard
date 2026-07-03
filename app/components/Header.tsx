'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import TubesBackground from './TubesBackground'

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
    <header className="relative">
      <TubesBackground className="w-full">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/yum_logo_transparent.png"
            alt="Yum of India"
            className="h-32 sm:h-40 w-auto block"
            style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}
          />
          <h1
            className="text-xl sm:text-2xl font-extrabold tracking-wide text-center text-white"
            style={{ textShadow: '0 0 24px rgba(0,0,0,0.9), 0 2px 4px rgba(0,0,0,0.8)' }}
          >
            Yum Of India Daily Dashboard
          </h1>
        </div>
      </TubesBackground>

      {/* Buttons sit on the outer relative <header>, above the canvas — always visible */}
      <div className="absolute right-5 bottom-5 flex items-center gap-3 z-30">
        {username && (
          <span
            className="text-xs font-medium hidden sm:inline px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: 'rgba(255,255,255,0.15)',
              color: '#E0E7FF',
              border: '1px solid rgba(255,255,255,0.25)',
              backdropFilter: 'blur(8px)',
            }}
          >
            {username}
          </span>
        )}
{isAdmin && (
          <a
            href="/admin"
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              backgroundColor: 'rgba(79,70,229,0.35)',
              color: '#C7D2FE',
              border: '1px solid rgba(167,139,250,0.45)',
              backdropFilter: 'blur(8px)',
            }}
          >
            Admin
          </a>
        )}
        <button
          onClick={handleLogout}
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            backgroundColor: 'rgba(255,255,255,0.15)',
            color: '#E0E7FF',
            border: '1px solid rgba(255,255,255,0.25)',
            backdropFilter: 'blur(8px)',
          }}
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
