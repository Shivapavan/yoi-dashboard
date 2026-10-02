'use client'

import { useState, useEffect, useRef } from 'react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

type ShiftValue = string | string[] | null

interface StaffRow {
  name: string
  token: string
  schedule: Record<string, ShiftValue>
}

function ShiftCell({ value }: { value: ShiftValue }) {
  if (value === null) return <span className="text-xs text-gray-300 italic">—</span>
  if (value === 'Off') return <span className="text-xs text-gray-400">Off</span>
  if (Array.isArray(value)) {
    return (
      <span className="text-xs leading-relaxed">
        {value[0]}<br />{value[1]}
      </span>
    )
  }
  return <span className="text-xs">{value}</span>
}

function CopyButton({ token, name }: { token: string; name: string }) {
  const [copied, setCopied] = useState(false)
  const url = `https://yoi-dashboard.vercel.app/my-schedule/${token}`

  function handleCopy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy link for ${name}`}
      className="ml-2 px-2 py-0.5 text-xs rounded transition-colors"
      style={
        copied
          ? { background: '#D1FAE5', color: '#065F46', border: '1px solid #6EE7B7' }
          : { background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE' }
      }
    >
      {copied ? '✓ Copied' : 'Copy link'}
    </button>
  )
}

type UploadState = 'idle' | 'parsing' | 'preview' | 'saving' | 'saved' | 'error'

export default function Schedule() {
  const [staff, setStaff]           = useState<StaffRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [parsed, setParsed]         = useState<StaffRow[] | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [errorMsg, setErrorMsg]     = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/admin/schedule')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.staff)) setStaff(d.staff) })
      .catch(() => {/* fallback: staff stays empty, display nothing */})
      .finally(() => setLoading(false))
  }, [])

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setUploadState('parsing')
    setErrorMsg('')
    setParsed(null)

    try {
      const form = new FormData()
      form.append('image', file)
      const res = await fetch('/api/admin/parse-schedule', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Parse failed')
      setParsed(data.staff)
      setUploadState('preview')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to parse image')
      setUploadState('error')
    }
  }

  async function handleApply() {
    if (!parsed) return
    setUploadState('saving')
    try {
      const res = await fetch('/api/admin/schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff: parsed }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setStaff(parsed)
      setParsed(null)
      setUploadState('saved')
      setTimeout(() => setUploadState('idle'), 3000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save')
      setUploadState('error')
    }
  }

  function handleCancel() {
    setParsed(null)
    setUploadState('idle')
    setErrorMsg('')
  }

  const displayStaff = uploadState === 'preview' && parsed ? parsed : staff

  return (
    <div className="mt-4 space-y-4">
      {/* Main schedule card */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#E4E7F3' }}>
          <div>
            <h2 className="font-semibold text-base" style={{ color: '#1E1B4B' }}>Weekly Staff Schedule</h2>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
              Use "Copy link" to send each person their personal schedule page.
            </p>
          </div>

          {/* Upload control */}
          <div className="flex items-center gap-2 shrink-0">
            {uploadState === 'saved' && (
              <span className="text-xs font-medium px-2 py-1 rounded" style={{ background: '#D1FAE5', color: '#065F46' }}>
                ✓ Schedule updated
              </span>
            )}
            {uploadState === 'error' && (
              <span className="text-xs font-medium px-2 py-1 rounded max-w-xs truncate" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                {errorMsg}
              </span>
            )}
            {(uploadState === 'idle' || uploadState === 'saved' || uploadState === 'error') && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                  style={{ background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE' }}
                >
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 16v1a1 1 0 001 1h12a1 1 0 001-1v-1M13 7l-3-3m0 0L7 7m3-3v11" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Upload Schedule Image
                </button>
              </>
            )}
            {uploadState === 'parsing' && (
              <span className="text-xs text-indigo-600 flex items-center gap-1.5">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                Parsing schedule…
              </span>
            )}
            {uploadState === 'preview' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium px-2 py-1 rounded" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                  Preview — new schedule
                </span>
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#F1F5F9', color: '#64748B' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: '#0D9488', color: '#FFFFFF' }}
                >
                  Apply New Schedule
                </button>
              </div>
            )}
            {uploadState === 'saving' && (
              <span className="text-xs text-teal-600 flex items-center gap-1.5">
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                </svg>
                Saving…
              </span>
            )}
          </div>
        </div>

        {/* Preview banner */}
        {uploadState === 'preview' && (
          <div className="px-5 py-2 text-xs" style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A', color: '#92400E' }}>
            Review the parsed schedule below. Click <strong>Apply New Schedule</strong> to save, or <strong>Cancel</strong> to discard.
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">Loading schedule…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse" style={{ minWidth: '700px' }}>
              <thead>
                <tr style={{ background: '#F8F9FF' }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B', minWidth: '160px' }}>
                    Staff
                  </th>
                  {DAYS.map(d => (
                    <th key={d} className="px-3 py-3 text-xs font-semibold uppercase tracking-wider text-center" style={{ color: '#64748B' }}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayStaff.map((person, i) => (
                  <tr
                    key={person.name}
                    style={{
                      borderTop: i > 0 ? '1px solid #E4E7F3' : undefined,
                      background: uploadState === 'preview'
                        ? (i % 2 === 0 ? '#FFFDE7' : '#FFFBEB')
                        : (i % 2 === 0 ? '#FFFFFF' : '#FAFAFE'),
                    }}
                  >
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center flex-wrap gap-y-1">
                        <span className="font-medium" style={{ color: '#1E1B4B' }}>{person.name}</span>
                        {uploadState !== 'preview' && (
                          <CopyButton token={person.token} name={person.name} />
                        )}
                      </div>
                    </td>
                    {DAYS.map(day => (
                      <td key={day} className="px-3 py-3 text-center align-top" style={{ color: '#374151' }}>
                        <ShiftCell value={person.schedule[day] ?? null} />
                      </td>
                    ))}
                  </tr>
                ))}
                {displayStaff.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">
                      No schedule data. Upload a schedule image to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
