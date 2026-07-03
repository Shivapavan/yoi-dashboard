'use client'

import { useEffect, useState } from 'react'

interface TikTokAccount {
  username: string
  name: string
  nickname: string
  followers: number
  totalLikes: number
  videoCount: number
  topViews: number
  avgViews: number
  engagementRate: number
  isYoi: boolean
}

interface TikTokPost {
  id: string
  username: string
  name: string
  description: string
  hashtags: string[]
  likes: number
  comments: number
  shares: number
  views: number
  timestamp: string
  url: string
  isYoi: boolean
}

interface TikTokIntel {
  lastUpdated: string
  totalPosts: number
  accounts: TikTokAccount[]
  topPosts: TikTokPost[]
  hashtags: { tag: string; count: number }[]
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

function RankBadge({ rank }: { rank: number }) {
  const colors: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' }
  return (
    <span style={{ color: colors[rank] ?? '#64748b', fontWeight: 800, fontSize: '1rem', minWidth: 24, textAlign: 'center', display: 'inline-block' }}>
      {rank}
    </span>
  )
}

type RefreshStatus = 'idle' | 'starting' | 'running' | 'done' | 'failed'

export default function TikTok() {
  const [data, setData] = useState<TikTokIntel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('idle')
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [activeSection, setActiveSection] = useState<'leaderboard' | 'videos' | 'trends'>('leaderboard')

  const loadData = () => {
    fetch('/api/tiktok-intel')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (refreshStatus !== 'running') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/tiktok-refresh')
        const json = await res.json()
        if (json.status === 'done') { setRefreshStatus('done'); loadData() }
        else if (json.status === 'failed') { setRefreshStatus('failed') }
        else if (json.elapsedSecs) { setElapsedSecs(json.elapsedSecs) }
      } catch { /* keep polling */ }
    }, 30_000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const startRefresh = async () => {
    setRefreshStatus('starting')
    try {
      const res = await fetch('/api/tiktok-refresh', { method: 'POST' })
      const json = await res.json()
      if (json.status === 'started' || json.status === 'already_running') {
        setRefreshStatus('running'); setElapsedSecs(0)
      } else { setRefreshStatus('failed') }
    } catch { setRefreshStatus('failed') }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>Loading TikTok data…</div>
  if (!data || 'error' in (data as object)) return <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>No TikTok data available. Click Refresh to scrape.</div>

  const yoi = data.accounts.find(a => a.isYoi)
  const topViews = data.accounts[0]?.topViews ?? 1
  const updatedDate = new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0f0f1a, #1a0a2e, #2d1060)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>🎵 TikTok Competitive Intelligence</h2>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem', marginTop: 4 }}>
              {data.accounts.length} accounts · {data.totalPosts.toLocaleString()} posts · Updated {updatedDate}
            </p>
            {refreshStatus === 'running' && <p style={{ color: '#FCD34D', fontSize: '0.75rem', marginTop: 4 }}>⏳ Scraping… {elapsedSecs > 0 ? `${Math.round(elapsedSecs / 60)}m elapsed` : 'starting'} (~5–10 min total)</p>}
            {refreshStatus === 'done'    && <p style={{ color: '#6EE7B7', fontSize: '0.75rem', marginTop: 4 }}>✅ Data refreshed!</p>}
            {refreshStatus === 'failed'  && <p style={{ color: '#FCA5A5', fontSize: '0.75rem', marginTop: 4 }}>❌ Refresh failed — try again</p>}
          </div>
          <button onClick={startRefresh} disabled={refreshStatus === 'running' || refreshStatus === 'starting'}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: refreshStatus === 'running' || refreshStatus === 'starting' ? 0.6 : 1, alignSelf: 'flex-start' }}>
            {refreshStatus === 'starting' ? '⏳ Starting…' : refreshStatus === 'running' ? '⏳ Scraping…' : '🔄 Refresh Data'}
          </button>
        </div>

        {yoi && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Top Video Views', value: fmt(yoi.topViews) },
              { label: 'Avg Views', value: fmt(yoi.avgViews) },
              { label: 'Total Likes', value: fmt(yoi.totalLikes) },
              { label: 'Videos', value: yoi.videoCount },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px', flex: '1 1 80px', minWidth: 80 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{s.value}</div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.68rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section Nav */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['leaderboard', 'videos', 'trends'] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            style={{ padding: '6px 16px', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: activeSection === s ? '#7C3AED' : '#f1f5f9',
              color: activeSection === s ? '#fff' : '#64748b' }}>
            {s === 'leaderboard' ? '🏆 Leaderboard' : s === 'videos' ? '📱 Latest Videos' : '📈 Trends'}
          </button>
        ))}
      </div>

      {/* ── Leaderboard ── */}
      {activeSection === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.accounts.map((acc, i) => {
            const barPct = Math.round((acc.topViews / topViews) * 100)
            return (
              <div key={acc.username} style={{ background: acc.isYoi ? '#fffbeb' : '#fff', border: `1px solid ${acc.isYoi ? '#D97706' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 16px', boxShadow: acc.isYoi ? '0 0 0 2px #D97706' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <RankBadge rank={i + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <a href={`https://www.tiktok.com/@${acc.username}`} target="_blank" rel="noopener"
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', textDecoration: 'none' }}>{acc.name}</a>
                      {acc.isYoi && <span style={{ background: '#D97706', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>YOU</span>}
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>@{acc.username}</span>
                      {acc.followers > 0 && <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{fmt(acc.followers)} followers</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                        <div style={{ width: `${barPct}%`, height: 6, borderRadius: 4, background: acc.isYoi ? '#D97706' : 'linear-gradient(90deg, #7C3AED, #0f0f1a)' }} />
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: acc.isYoi ? '#D97706' : '#7C3AED', minWidth: 48, textAlign: 'right' }}>{fmt(acc.topViews)}</span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 3 }}>
                      avg {fmt(acc.avgViews)} views · {acc.videoCount} videos · {fmt(acc.totalLikes)} total likes
                      {acc.engagementRate > 0 && ` · ${acc.engagementRate}% engagement`}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Latest Videos ── */}
      {activeSection === 'videos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {data.topPosts.map((post, i) => {
            const GRADIENTS = [
              'linear-gradient(135deg,#0f0f1a,#7C3AED)',
              'linear-gradient(135deg,#D97706,#7C3AED)',
              'linear-gradient(135deg,#7C3AED,#0D9488)',
              'linear-gradient(135deg,#1a0a2e,#0D9488)',
              'linear-gradient(135deg,#2d1060,#D97706)',
            ]
            const grad = GRADIENTS[i % GRADIENTS.length]
            const postDate = new Date(post.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            return (
              <a key={post.url} href={post.url} target="_blank" rel="noopener"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
                <div style={{ width: '100%', height: 130, background: grad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ fontSize: '2.2rem' }}>🎵</span>
                  <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: '0.8rem' }}>{post.name}</span>
                  <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>▶ Open on TikTok</span>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{ color: '#7C3AED', fontSize: '0.75rem', fontWeight: 700 }}>{post.name}</span>
                    <span style={{ color: '#64748b', fontSize: '0.68rem' }}>{postDate}</span>
                  </div>
                  <div style={{ color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                    {post.description || '(no description)'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 6, color: '#94a3b8', fontSize: '0.68rem' }}>
                    {post.views > 0 && <span>▶ {fmt(post.views)} views</span>}
                    <span>❤️ {fmt(post.likes)}</span>
                    <span>💬 {fmt(post.comments)}</span>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* ── Trends ── */}
      {activeSection === 'trends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>#️⃣ Top Hashtags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {data.hashtags.map((h, i) => (
                <span key={h.tag} style={{ background: i < 6 ? '#7C3AED' : i < 12 ? '#2d1060' : '#f1f5f9', color: i < 12 ? '#fff' : '#64748b', padding: '4px 10px', borderRadius: 999, fontSize: i < 6 ? '0.78rem' : '0.71rem', fontWeight: 600 }}>
                  #{h.tag} <span style={{ opacity: 0.75 }}>{h.count}</span>
                </span>
              ))}
            </div>
            <p style={{ marginTop: 14, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>Use the top 5–8 of these hashtags on every YOI TikTok for maximum discovery.</p>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>⚡ Engagement Rate (Avg Views ÷ Followers)</h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 14 }}>Who punches above their weight on TikTok</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {[...data.accounts].sort((a, b) => b.engagementRate - a.engagementRate).map((acc, i) => (
                <div key={acc.username} style={{ background: acc.isYoi ? '#fffbeb' : '#f8fafc', border: `1px solid ${acc.isYoi ? '#D97706' : '#e2e8f0'}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b' }}>#{i + 1} {acc.name}</span>
                    {acc.isYoi && <span style={{ background: '#D97706', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>YOU</span>}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.3rem', color: acc.isYoi ? '#D97706' : '#7C3AED', marginTop: 2 }}>{acc.engagementRate}%</div>
                  <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{fmt(acc.followers)} followers · avg {fmt(acc.avgViews)} views</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
