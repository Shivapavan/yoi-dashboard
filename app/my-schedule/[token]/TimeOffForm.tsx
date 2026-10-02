'use client'

import { useState } from 'react'

interface Props {
  token: string
  employeeName: string
}

export default function TimeOffForm({ token, employeeName }: Props) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Min date = today
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/public/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, date, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      setStatus('success')
      setDate('')
      setReason('')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  function handleClose() {
    setOpen(false)
    if (status !== 'loading') {
      setStatus('idle')
      setDate('')
      setReason('')
      setErrorMsg('')
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-10">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-xl px-5 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
          style={{
            background: '#FFF7ED',
            border: '1px solid #FED7AA',
            borderLeft: '4px solid #F97316',
            color: '#9A3412',
          }}
        >
          <span style={{ fontSize: '1.1em' }}>📅</span>
          Request Time Off
        </button>
      ) : (
        <div
          className="rounded-xl px-5 py-5"
          style={{ background: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.08)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base" style={{ color: '#1E1B4B' }}>
              Request Time Off
            </h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {status === 'success' ? (
            <div
              className="rounded-lg px-4 py-4 text-center"
              style={{ background: '#F0FDF4', border: '1px solid #86EFAC', color: '#166534' }}
            >
              <div className="text-2xl mb-2">✓</div>
              <p className="font-semibold text-sm">Request submitted!</p>
              <p className="text-xs mt-1 text-green-700">
                {employeeName.split(' ')[0]}, your request was sent to the manager.
              </p>
              <button
                onClick={() => { setStatus('idle'); setOpen(false) }}
                className="mt-3 text-xs underline text-green-700"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>
                  Date you need off <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  min={today}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="w-full rounded-lg px-3 py-2 text-sm border outline-none transition-colors"
                  style={{
                    border: '1px solid #C7D2FE',
                    color: '#1E1B4B',
                    background: '#FAFAFE',
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: '#64748B' }}>
                  Reason <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Doctor appointment, family event…"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-lg px-3 py-2 text-sm border outline-none resize-none transition-colors"
                  style={{
                    border: '1px solid #C7D2FE',
                    color: '#1E1B4B',
                    background: '#FAFAFE',
                  }}
                />
              </div>

              {status === 'error' && (
                <p className="text-xs rounded px-3 py-2" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                  {errorMsg}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-medium"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={status === 'loading' || !date}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: '#0D9488', color: '#FFFFFF' }}
                >
                  {status === 'loading' ? 'Sending…' : 'Submit Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
