'use client'

import { useEffect, useState } from 'react'

type Status = 'ok' | 'expiring_soon' | 'expired' | 'missing' | 'unknown' | null

export default function TokenAlert() {
  const [status, setStatus]       = useState<Status>(null)
  const [hoursLeft, setHoursLeft] = useState<number | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [token, setToken]         = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState('')
  const [saveError, setSaveError] = useState('')
  const [isAdmin, setIsAdmin]     = useState(false)

  useEffect(() => {
    // Check admin status first — non-admins never see the token banner
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (!d.user?.isAdmin) return
        setIsAdmin(true)
        return fetch('/api/admin/token-status').then(r => r.json())
      })
      .then(d => {
        if (d) { setStatus(d.status); setHoursLeft(d.hoursLeft ?? null) }
      })
      .catch(() => {})
  }, [])

  if (!isAdmin || !status || status === 'ok') return null

  const isExpired = status === 'expired' || status === 'missing'

  const handleUpdate = async () => {
    if (!token.startsWith('eyJ')) { setSaveError('Paste the full x-access-token value'); return }
    setSaving(true); setSaveError('')
    try {
      const r = await fetch('/api/admin/update-token', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await r.json()
      if (d.ok) {
        setSaved(`Token saved! Expires: ${d.expiresAt}. Live data refreshes within ~2 minutes.`)
        setShowForm(false); setToken('')
        setTimeout(() => { setStatus('ok'); setSaved('') }, 60000)
      } else {
        setSaveError(d.error || 'Failed to update')
      }
    } catch (e: any) { setSaveError(e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className={`px-4 py-2 text-sm ${isExpired ? 'bg-red-600' : 'bg-amber-500'} text-white`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="font-semibold">
          {isExpired
            ? '⚠️ Lighthouse token expired — live data unavailable'
            : `⏳ Lighthouse token expires in ${hoursLeft}h`}
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs font-semibold transition-colors"
        >
          {showForm ? 'Cancel' : 'Update Token'}
        </button>
      </div>

      {saved && (
        <p className="mt-1 text-xs bg-white/20 px-2 py-1 rounded">{saved}</p>
      )}

      {showForm && (
        <div className="mt-2 flex flex-col gap-1">
          <p className="text-xs opacity-90">
            1. Open <strong>lh.shift4.com</strong> → F12 → Network → click any request → Headers → copy <code className="bg-black/20 px-1 rounded">x-access-token</code> value
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Paste x-access-token here (starts with eyJ...)"
              className="flex-1 px-2 py-1 text-xs text-gray-800 rounded border-0 outline-none min-w-0"
            />
            <button
              onClick={handleUpdate}
              disabled={saving || !token}
              className="bg-white text-red-700 font-semibold px-3 py-1 rounded text-xs disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? 'Saving…' : 'Save & Deploy'}
            </button>
          </div>
          {saveError && <p className="text-xs text-white/80">{saveError}</p>}
        </div>
      )}
    </div>
  )
}
