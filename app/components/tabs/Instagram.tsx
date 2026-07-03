'use client'

import { useEffect, useState } from 'react'

interface AccountSummary {
  account: string
  name: string
  posts: number
  videos: number
  topViews: number
  avgViews: number
  avgLikes: number
  isYoi: boolean
  bestPostUrl: string
  bestCaption: string
}

interface TopPost {
  views: number
  url: string
  account: string
  name: string
  caption: string
  date: string
  likes: number
  thumbnail: string
}

interface HashtagItem { tag: string; count: number }
interface TopicItem   { topic: string; count: number }

interface IntelData {
  lastUpdated: string
  totalPosts: number
  accounts: AccountSummary[]
  topPosts: TopPost[]
  hashtags: HashtagItem[]
  topics: TopicItem[]
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

export default function Instagram() {
  const [data, setData] = useState<IntelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>('idle')
  const [elapsedSecs, setElapsedSecs] = useState(0)
  const [activeSection, setActiveSection] = useState<'leaderboard' | 'posts' | 'trends'>('leaderboard')

  const loadData = () => {
    fetch('/api/instagram-intel')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  // Poll run status while scraping is in progress
  useEffect(() => {
    if (refreshStatus !== 'running') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/instagram-refresh')
        const json = await res.json()
        if (json.status === 'done') {
          setRefreshStatus('done')
          loadData()
        } else if (json.status === 'failed') {
          setRefreshStatus('failed')
        } else if (json.elapsedSecs) {
          setElapsedSecs(json.elapsedSecs)
        }
      } catch { /* keep polling */ }
    }, 30_000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const startRefresh = async () => {
    setRefreshStatus('starting')
    try {
      const res = await fetch('/api/instagram-refresh', { method: 'POST' })
      const json = await res.json()
      if (json.status === 'started' || json.status === 'already_running') {
        setRefreshStatus('running')
        setElapsedSecs(0)
      } else {
        setRefreshStatus('failed')
      }
    } catch {
      setRefreshStatus('failed')
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20 text-gray-400">Loading Instagram data…</div>
  )
  if (!data || 'error' in (data as object)) return (
    <div className="text-center py-20 text-gray-400">No Instagram data available.</div>
  )

  const yoiRank = data.accounts.findIndex(a => a.isYoi) + 1
  const yoi = data.accounts.find(a => a.isYoi)
  const topViews = data.accounts[0]?.topViews ?? 1
  const maxTopicCount = data.topics[0]?.count ?? 1
  const updatedDate = new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0D9488, #7C3AED)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>📸 Instagram Competitive Intelligence</h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', marginTop: 4 }}>
              {data.accounts.length} restaurants · {data.totalPosts.toLocaleString()} posts · Updated {updatedDate}
            </p>
            {refreshStatus === 'running' && (
              <p style={{ color: '#FCD34D', fontSize: '0.75rem', marginTop: 4 }}>
                ⏳ Scraping… {elapsedSecs > 0 ? `${Math.round(elapsedSecs / 60)}m elapsed` : 'starting'} (~20 min total)
              </p>
            )}
            {refreshStatus === 'done' && (
              <p style={{ color: '#6EE7B7', fontSize: '0.75rem', marginTop: 4 }}>✅ Data refreshed!</p>
            )}
            {refreshStatus === 'failed' && (
              <p style={{ color: '#FCA5A5', fontSize: '0.75rem', marginTop: 4 }}>❌ Refresh failed — try again</p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ color: '#FFD700', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>#{yoiRank}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', marginTop: 2 }}>YOI Rank</div>
            </div>
            <button
              onClick={startRefresh}
              disabled={refreshStatus === 'running' || refreshStatus === 'starting'}
              style={{
                background: refreshStatus === 'running' || refreshStatus === 'starting' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                border: '1px solid rgba(255,255,255,0.35)',
                color: '#fff', borderRadius: 8, padding: '7px 14px',
                fontSize: '0.78rem', fontWeight: 600, cursor: refreshStatus === 'running' || refreshStatus === 'starting' ? 'not-allowed' : 'pointer',
                opacity: refreshStatus === 'running' || refreshStatus === 'starting' ? 0.6 : 1,
              }}
            >
              {refreshStatus === 'starting' ? '⏳ Starting…' : refreshStatus === 'running' ? '⏳ Scraping…' : '🔄 Refresh Data'}
            </button>
          </div>
        </div>

        {/* YOI Quick Stats */}
        {yoi && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Top Post Views', value: fmt(yoi.topViews) },
              { label: 'Avg Views / Post', value: fmt(yoi.avgViews) },
              { label: 'Posts Scraped', value: yoi.posts },
              { label: 'Video Posts', value: yoi.videos },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 14px', flex: '1 1 80px', minWidth: 80 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{s.value}</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.68rem' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['leaderboard', 'posts', 'trends'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            style={{
              padding: '6px 16px', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: activeSection === s ? '#0D9488' : '#f1f5f9',
              color: activeSection === s ? '#fff' : '#64748b',
            }}
          >
            {s === 'leaderboard' ? '🏆 Leaderboard' : s === 'posts' ? '🎬 Latest Reels' : '📈 Trends'}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {activeSection === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.accounts.map((acc, i) => {
            const barPct = Math.round((acc.topViews / topViews) * 100)
            return (
              <div
                key={acc.account}
                style={{
                  background: acc.isYoi ? '#fffbeb' : '#fff',
                  border: `1px solid ${acc.isYoi ? '#D97706' : '#e2e8f0'}`,
                  borderRadius: 10,
                  padding: '12px 16px',
                  boxShadow: acc.isYoi ? '0 0 0 2px #D97706' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <RankBadge rank={i + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <a
                        href={`https://www.instagram.com/${acc.account}/`}
                        target="_blank" rel="noopener"
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', textDecoration: 'none' }}
                      >
                        {acc.name}
                      </a>
                      {acc.isYoi && (
                        <span style={{ background: '#D97706', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>YOU</span>
                      )}
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>@{acc.account}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                        <div style={{ width: `${barPct}%`, height: 6, borderRadius: 4, background: acc.isYoi ? '#D97706' : 'linear-gradient(90deg, #0D9488, #7C3AED)' }} />
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: acc.isYoi ? '#D97706' : '#0D9488', minWidth: 48, textAlign: 'right' }}>{fmt(acc.topViews)}</span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 3 }}>
                      avg {fmt(acc.avgViews)} views · {acc.videos}/{acc.posts} videos · {acc.avgLikes} avg likes
                    </div>
                  </div>
                </div>
                {acc.bestCaption && (
                  <div style={{ marginTop: 6, paddingLeft: 34, color: '#64748b', fontSize: '0.73rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{acc.bestCaption}"
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Top Posts */}
      {activeSection === 'posts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {data.topPosts.map((post, i) => {
            const GRADIENTS = [
              'linear-gradient(135deg,#0D9488,#7C3AED)',
              'linear-gradient(135deg,#D97706,#DC2626)',
              'linear-gradient(135deg,#7C3AED,#0D9488)',
              'linear-gradient(135deg,#0891b2,#7C3AED)',
              'linear-gradient(135deg,#059669,#0D9488)',
            ]
            const grad = GRADIENTS[i % GRADIENTS.length]
            return (
            <a
              key={post.url}
              href={post.url}
              target="_blank" rel="noopener"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', transition: 'box-shadow 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
              onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}
            >
              <div style={{ width: '100%', height: 130, background: grad, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <span style={{ fontSize: '2.2rem' }}>🎬</span>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, fontSize: '0.8rem' }}>{post.name}</span>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.7rem' }}>▶ Open on Instagram</span>
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <span style={{ color: '#7C3AED', fontSize: '0.75rem', fontWeight: 700 }}>{post.name}</span>
                  <span style={{ color: '#64748b', fontSize: '0.68rem' }}>{post.date}</span>
                </div>
                <div style={{ color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.5,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                  {post.caption || '(no caption)'}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 6, color: '#94a3b8', fontSize: '0.68rem' }}>
                  <span>❤️ {post.likes.toLocaleString()}</span>
                  {post.views > 0 && <span>▶ {fmt(post.views)} views</span>}
                </div>
              </div>
            </a>
            )
          })}
        </div>
      )}

      {/* Trends */}
      {activeSection === 'trends' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Hashtags */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>#️⃣ Top Hashtags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {data.hashtags.map((h, i) => (
                <span key={h.tag} style={{
                  background: i < 6 ? '#0D9488' : i < 12 ? '#164e63' : '#f1f5f9',
                  color: i < 12 ? '#fff' : '#64748b',
                  padding: '4px 10px', borderRadius: 999, fontSize: i < 6 ? '0.78rem' : '0.71rem', fontWeight: 600,
                }}>
                  #{h.tag} <span style={{ opacity: 0.75 }}>{h.count}</span>
                </span>
              ))}
            </div>
            <p style={{ marginTop: 14, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
              Add top 8–10 of these to every YOI post for maximum discovery.
            </p>
          </div>

          {/* Topics */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>📈 Winning Content Topics</h3>
            {data.topics.map(t => (
              <div key={t.topic} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '0.8rem', color: '#475569', minWidth: 160 }}>{t.topic}</span>
                <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 8 }}>
                  <div style={{ width: `${Math.round((t.count / maxTopicCount) * 100)}%`, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, #7C3AED, #0D9488)' }} />
                </div>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', minWidth: 20, textAlign: 'right' }}>{t.count}</span>
              </div>
            ))}
          </div>

          {/* Strategy tips */}
          <div style={{ gridColumn: '1 / -1', background: '#fffbeb', border: '1px solid #D97706', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', marginBottom: 12 }}>⭐ What YOI Should Post More Of</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
              {[
                { icon: '🎬', tip: 'Live food prep videos — sizzling tawa, fresh dosa, biryani dum being opened' },
                { icon: '👨‍👩‍👧', tip: 'Owner/family story reels — the emotional "why" behind YOI connects deeply' },
                { icon: '🎉', tip: 'Holiday & occasion content — Diwali, Ugadi, Mother\'s Day, Eid reels' },
                { icon: '📸', tip: 'Customer crowd shots on busy evenings — social proof drives new visitors' },
                { icon: '#️⃣', tip: '#friscoeats #mckinneytx #dallasfoodies #indianfood on every single post' },
                { icon: '📅', tip: 'Post 5–7× per week — competitors posting 50 reels vs YOI\'s 33 in same period' },
              ].map(item => (
                <div key={item.tip} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                  <span style={{ fontSize: '0.78rem', color: '#78350f', lineHeight: 1.45 }}>{item.tip}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
