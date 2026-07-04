'use client'

import { useEffect, useState, useCallback } from 'react'
import type { ScraperConfig, ScrapeRun } from '@/lib/scraper/types'

interface EnrichedScraper extends ScraperConfig {
  lastRun: ScrapeRun | null
  hasResult: boolean
}

const TYPE_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  http: '#0D9488',
}

const STATUS_COLORS: Record<string, string> = {
  idle: '#94a3b8',
  running: '#D97706',
  done: '#10b981',
  failed: '#ef4444',
}

function elapsed(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

function NewScraperForm({ onSave }: { onSave: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<'instagram' | 'http'>('instagram')
  const [targetsRaw, setTargetsRaw] = useState('')
  const [schedule, setSchedule] = useState<'manual' | 'daily' | 'weekly'>('manual')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    const targets = targetsRaw.split('\n').map(t => t.trim()).filter(Boolean)
    if (!name.trim() || targets.length === 0) { setError('Name and targets required'); return }
    setSaving(true); setError('')
    try {
      await fetch('/api/scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), type, targets, schedule }),
      })
      setName(''); setTargetsRaw(''); onSave()
    } catch { setError('Save failed') }
    setSaving(false)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 20 }}>
      <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>➕ New Scraper</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Name</label>
          <input
            value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Instagram Competitors"
            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Type</label>
          <select value={type} onChange={e => setType(e.target.value as 'instagram' | 'http')}
            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem' }}>
            <option value="instagram">Instagram</option>
            <option value="http">HTTP / Website</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>
          {type === 'instagram' ? 'Usernames (one per line, no @)' : 'URLs (one per line)'}
        </label>
        <textarea
          value={targetsRaw} onChange={e => setTargetsRaw(e.target.value)} rows={4}
          placeholder={type === 'instagram' ? 'golconda_xpress_food_truck\nyumofindia_mckinney\n...' : 'https://example.com\nhttps://site2.com'}
          style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem', fontFamily: 'monospace', resize: 'vertical' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Schedule</label>
          <select value={schedule} onChange={e => setSchedule(e.target.value as typeof schedule)}
            style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem' }}>
            <option value="manual">Manual only</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>
        <button
          onClick={submit} disabled={saving}
          style={{ marginTop: 18, background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Scraper'}
        </button>
        {error && <span style={{ color: '#ef4444', fontSize: '0.78rem', marginTop: 18 }}>{error}</span>}
      </div>
    </div>
  )
}

function ScraperCard({ scraper, onRefresh }: { scraper: EnrichedScraper; onRefresh: () => void }) {
  const [running, setRunning] = useState(scraper.lastRun?.status === 'running')
  const [pollCount, setPollCount] = useState(0)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(scraper.name)
  const [editTargets, setEditTargets] = useState(scraper.targets.join('\n'))
  const [editSchedule, setEditSchedule] = useState(scraper.schedule)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!running) return
    const id = setInterval(async () => {
      const res = await fetch(`/api/scraper/run?id=${scraper.id}`)
      const json = await res.json()
      if (json.status === 'done' || json.status === 'failed') {
        setRunning(false)
        onRefresh()
      }
      setPollCount(c => c + 1)
    }, 15_000)
    return () => clearInterval(id)
  }, [running, scraper.id, onRefresh])

  const runScraper = async () => {
    setRunning(true)
    await fetch('/api/scraper/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scraperId: scraper.id }),
    })
  }

  const deleteScraper = async () => {
    if (!confirm(`Delete "${scraper.name}"?`)) return
    await fetch(`/api/scraper?id=${scraper.id}`, { method: 'DELETE' })
    onRefresh()
  }

  const saveEdit = async () => {
    const targets = editTargets.split('\n').map(t => t.trim()).filter(Boolean)
    if (!editName.trim() || targets.length === 0) return
    setSaving(true)
    await fetch('/api/scraper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: scraper.id, name: editName.trim(), type: scraper.type, targets, schedule: editSchedule }),
    })
    setSaving(false)
    setEditing(false)
    onRefresh()
  }

  const status = running ? 'running' : (scraper.lastRun?.status ?? 'idle')
  const statusColor = STATUS_COLORS[status] ?? '#94a3b8'
  const isInstagram = scraper.type === 'instagram'

  if (editing) {
    return (
      <div style={{ background: '#fff', border: '2px solid #0D9488', borderRadius: 12, padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>✏️ Edit Scraper</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>Schedule</label>
            <select value={editSchedule} onChange={e => setEditSchedule(e.target.value as typeof editSchedule)}
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem' }}>
              <option value="manual">Manual only</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>
            {isInstagram ? 'Usernames (one per line, no @)' : 'URLs (one per line)'}
          </label>
          <textarea value={editTargets} onChange={e => setEditTargets(e.target.value)} rows={8}
            style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem', fontFamily: 'monospace', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={saveEdit} disabled={saving}
            style={{ background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : '💾 Save'}
          </button>
          <button onClick={() => { setEditing(false); setEditName(scraper.name); setEditTargets(scraper.targets.join('\n')); setEditSchedule(scraper.schedule) }}
            style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', margin: 0 }}>{scraper.name}</h3>
            <span style={{ background: TYPE_COLORS[scraper.type] + '20', color: TYPE_COLORS[scraper.type], fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
              {scraper.type.toUpperCase()}
            </span>
            <span style={{ background: statusColor + '20', color: statusColor, fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>
              {running ? '⏳ RUNNING' : status.toUpperCase()}
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>
            {scraper.targets.length} targets · {scraper.schedule} ·{' '}
            {scraper.lastRun ? `last run ${elapsed(scraper.lastRun.startedAt)}` : 'never run'}
            {scraper.lastRun?.itemsCount ? ` · ${scraper.lastRun.itemsCount} items` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setEditing(true)}
            style={{ background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
            ✏️ Edit
          </button>
          {isInstagram ? (
            <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '6px 12px', fontSize: '0.72rem', color: '#92400e', maxWidth: 200 }}>
              💻 Run locally: <code style={{ fontSize: '0.68rem' }}>node scripts/scrape-instagram-local.mjs</code>
            </div>
          ) : (
            <button onClick={runScraper} disabled={running}
              style={{ background: running ? '#f1f5f9' : '#0D9488', color: running ? '#94a3b8' : '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 600, fontSize: '0.78rem', cursor: running ? 'not-allowed' : 'pointer' }}>
              {running ? `Running… (${pollCount * 15}s)` : '▶ Run Now'}
            </button>
          )}
          <button onClick={deleteScraper}
            style={{ background: '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>
            🗑
          </button>
        </div>
      </div>

      <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
        <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 4 }}>TARGETS</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {scraper.targets.slice(0, 8).map(t => (
            <span key={t} style={{ background: '#e2e8f0', color: '#475569', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 999 }}>
              {isInstagram ? `@${t}` : t.replace('https://', '').slice(0, 30)}
            </span>
          ))}
          {scraper.targets.length > 8 && (
            <span style={{ color: '#94a3b8', fontSize: '0.72rem', padding: '2px 4px' }}>+{scraper.targets.length - 8} more</span>
          )}
        </div>
      </div>

      {scraper.hasResult && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓ Results available</span>
          <a href={`/api/scraper/run?id=${scraper.id}`} target="_blank" rel="noopener"
            style={{ fontSize: '0.72rem', color: '#0D9488', textDecoration: 'underline' }}>
            View JSON
          </a>
        </div>
      )}
    </div>
  )
}

export default function Scraper() {
  const [scrapers, setScrapers] = useState<EnrichedScraper[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const loadScrapers = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper')
      const json = await res.json()
      setScrapers(json.scrapers ?? [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadScrapers() }, [loadScrapers])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b', margin: 0 }}>🕷 Scraper Hub</h2>
          <p style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 3 }}>
            {scrapers.length} scrapers · Self-hosted, no Apify required
          </p>
        </div>
        <button
          onClick={() => setShowNew(v => !v)}
          style={{ background: '#0D9488', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          {showNew ? '✕ Cancel' : '+ New Scraper'}
        </button>
      </div>

      {showNew && <NewScraperForm onSave={() => { setShowNew(false); loadScrapers() }} />}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading scrapers…</div>
      ) : scrapers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🕷</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No scrapers yet</div>
          <div style={{ fontSize: '0.85rem' }}>Create one above to start collecting data</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scrapers.map(s => (
            <ScraperCard key={s.id} scraper={s} onRefresh={loadScrapers} />
          ))}
        </div>
      )}

      {/* How it works */}
      <div style={{ marginTop: 24, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
        <h3 style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>How it works</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { icon: '📸', title: 'Instagram', desc: 'Scrapes posts, views, likes, and hashtags from public profiles. Needs IG_SESSION_ID env var.' },
            { icon: '🌐', title: 'HTTP / Website', desc: 'Fetches any public webpage and extracts fields by CSS selector. Great for menus, pricing, hours.' },
            { icon: '💾', title: 'Storage', desc: 'Results stored in Vercel Blob. Download as JSON anytime from the "View JSON" link.' },
            { icon: '⏱', title: 'Scheduling', desc: 'Manual, daily, or weekly. All runs are logged with timestamps and item counts.' },
          ].map(item => (
            <div key={item.title}>
              <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>{item.icon}</div>
              <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1e293b', marginBottom: 3 }}>{item.title}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.4 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
