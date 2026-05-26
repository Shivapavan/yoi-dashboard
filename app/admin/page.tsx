'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const router = useRouter()

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user?.isAdmin) router.replace('/')
    })
  }, [])

  const [name, setName]       = useState('')
  const [email, setEmail]     = useState('')
  const [phone, setPhone]     = useState('')
  const [tempPw, setTempPw]   = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setSuccess('')
    setLoading(true)
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, tempPassword: tempPw, isAdmin }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setSuccess(`User "${data.user.email}" created. They'll be prompted to change their password on first login.`)
      setName(''); setEmail(''); setPhone(''); setTempPw(''); setIsAdmin(false)
    } catch {
      setError('Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-lg mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-sm text-gray-500 mt-1">Create dashboard users</p>
          </div>
          <a href="/" className="text-sm text-purple-600 hover:text-purple-800">← Dashboard</a>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <h2 className="font-semibold text-gray-800 mb-5">Create New User</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="e.g. Sindhu Ranga" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="user@example.com" />
              <p className="text-xs text-gray-400 mt-1">This will be their login ID.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="+1 (555) 000-0000" />
              <p className="text-xs text-gray-400 mt-1">Used for MFA codes and password reset.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
              <input type="text" value={tempPw} onChange={e => setTempPw(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Min 8 chars, 1 uppercase, 1 number, 1 special" />
              <p className="text-xs text-gray-400 mt-1">User must change this on first login.</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isAdmin" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} className="rounded" />
              <label htmlFor="isAdmin" className="text-sm text-gray-700">Grant admin access (can create users)</label>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
            {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-sm">{success}</div>}

            <button type="submit" disabled={loading}
              className="w-full bg-purple-700 hover:bg-purple-800 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
              {loading ? 'Creating…' : 'Create User'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
