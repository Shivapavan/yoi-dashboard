'use client'

import { useEffect, useState } from 'react'

interface AccountSummary {
  account: string; name: string; followers: number
  posts: number; videos: number; topViews: number
  avgViews: number; avgLikes: number; engagementRate: number
  isYoi: boolean; bestPostUrl: string; bestCaption: string
}
interface TopPost {
  views: number; url: string; account: string; name: string
  caption: string; date: string; likes: number
}
interface HashtagItem { tag: string; count: number }
interface TopicItem   { topic: string; count: number }
interface Suggestion  { icon: string; title: string; detail: string }
interface Insights {
  bestDay: string; bestHour: number; bestHourLabel: string
  dayCounts: Record<string, number>
  postsByDay: Record<string, number>
  yoiByDay: Record<string, number>
  engagementRanking: AccountSummary[]
  yoiPostsRecent: number; avgCompetitorPostsRecent: number
  sweetSpotCaptionLength: number; yoiAvgCaptionLength: number
  winningFirstLines: string[]
}
interface IntelData {
  lastUpdated: string; totalPosts: number
  accounts: AccountSummary[]; topPosts: TopPost[]
  hashtags: HashtagItem[]; topics: TopicItem[]
  insights?: Insights; suggestions?: Suggestion[]
}

interface FollowedAccount {
  username: string; fullName: string; isVerified: boolean
  isPrivate: boolean; profilePicUrl: string; latestReelAt: number | null
}
interface CommonFollow {
  account: FollowedAccount; sharedBy: string[]; score: number
}
interface FollowingSummary {
  lastUpdated: string; accountsScraped: number; totalUniqueFollows: number
  accounts: { username: string; displayName: string; totalFollowing: number; verifiedFollows: number }[]
  commonFollows: CommonFollow[]
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
  const [activeSection, setActiveSection] = useState<'leaderboard' | 'posts' | 'trends' | 'strategy' | 'network'>('leaderboard')

  // Network (following scraper) state
  const [netStatus, setNetStatus] = useState<RefreshStatus>('idle')
  const [netSummary, setNetSummary] = useState<FollowingSummary | null>(null)
  const [netAccount, setNetAccount] = useState<string>('')
  const [netAccountData, setNetAccountData] = useState<{ username: string; accounts: FollowedAccount[] } | null>(null)
  const [netFilter, setNetFilter] = useState<'all' | 'verified' | 'common'>('common')

  const loadData = () => {
    fetch('/api/instagram-intel')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (refreshStatus !== 'running') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/instagram-refresh')
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
      const res = await fetch('/api/instagram-refresh', { method: 'POST' })
      const json = await res.json()
      if (json.status === 'started' || json.status === 'already_running') {
        setRefreshStatus('running'); setElapsedSecs(0)
      } else { setRefreshStatus('failed') }
    } catch { setRefreshStatus('failed') }
  }

  // Network: load summary on mount
  useEffect(() => {
    fetch('/api/instagram-following')
      .then(r => r.json())
      .then(d => { if (d.summary) setNetSummary(d.summary); if (d.status) setNetStatus(d.status === 'running' ? 'running' : 'idle') })
      .catch(() => {})
  }, [])

  // Network: poll while running
  useEffect(() => {
    if (netStatus !== 'running') return
    const iv = setInterval(async () => {
      const d = await fetch('/api/instagram-following').then(r => r.json())
      if (d.status === 'done') { setNetStatus('done'); if (d.summary) setNetSummary(d.summary) }
      else if (d.status === 'failed') setNetStatus('failed')
    }, 15_000)
    return () => clearInterval(iv)
  }, [netStatus])

  const startNetworkScrape = async () => {
    setNetStatus('starting')
    const res = await fetch('/api/instagram-following', { method: 'POST' })
    const json = await res.json()
    setNetStatus(json.status === 'started' || json.status === 'already_running' ? 'running' : 'failed')
  }

  const loadAccountFollowing = async (username: string) => {
    setNetAccount(username)
    setNetAccountData(null)
    const res = await fetch(`/api/instagram-following?username=${username}`)
    if (res.ok) {
      const d = await res.json() as { username: string; accounts: FollowedAccount[] }
      setNetAccountData(d)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400">Loading Instagram data…</div>
  if (!data || 'error' in (data as object)) return <div className="text-center py-20 text-gray-400">No Instagram data available.</div>

  const yoiRank = data.accounts.findIndex(a => a.isYoi) + 1
  const yoi = data.accounts.find(a => a.isYoi)
  const topViews = data.accounts[0]?.topViews ?? 1
  const maxTopicCount = data.topics[0]?.count ?? 1
  const updatedDate = new Date(data.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const ins = data.insights
  const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
              <div style={{ color: '#FFD700', fontWeight: 800, fontSize: '1.6rem', lineHeight: 1 }}>#{yoiRank}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', marginTop: 2 }}>YOI Rank</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '7px 12px', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', textAlign: 'right', maxWidth: 200 }}>
              💻 To refresh, run:<br />
              <code style={{ color: '#FCD34D', fontSize: '0.68rem' }}>node scripts/scrape-instagram-local.mjs</code>
            </div>
          </div>
        </div>
        {yoi && (
          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Top Post Views', value: fmt(yoi.topViews) },
              { label: 'Avg Views', value: fmt(yoi.avgViews) },
              { label: 'Engagement Rate', value: yoi.engagementRate != null ? `${yoi.engagementRate}%` : '—' },
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

      {/* Section Nav */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['leaderboard', 'posts', 'trends', 'strategy', 'network'] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            style={{ padding: '6px 16px', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: activeSection === s ? '#0D9488' : '#f1f5f9',
              color: activeSection === s ? '#fff' : '#64748b' }}>
            {s === 'leaderboard' ? '🏆 Leaderboard' : s === 'posts' ? '🎬 Latest Reels' : s === 'trends' ? '📈 Trends' : s === 'strategy' ? '🎯 Strategy' : '🕵️ Network'}
          </button>
        ))}
      </div>

      {/* ── Leaderboard ── */}
      {activeSection === 'leaderboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.accounts.map((acc, i) => {
            const barPct = Math.round((acc.topViews / topViews) * 100)
            return (
              <div key={acc.account} style={{ background: acc.isYoi ? '#fffbeb' : '#fff', border: `1px solid ${acc.isYoi ? '#D97706' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 16px', boxShadow: acc.isYoi ? '0 0 0 2px #D97706' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <RankBadge rank={i + 1} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <a href={`https://www.instagram.com/${acc.account}/`} target="_blank" rel="noopener"
                        style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', textDecoration: 'none' }}>{acc.name}</a>
                      {acc.isYoi && <span style={{ background: '#D97706', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>YOU</span>}
                      <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>@{acc.account}</span>
                      {acc.followers > 0 && <span style={{ color: '#64748b', fontSize: '0.72rem' }}>{fmt(acc.followers)} followers</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 6 }}>
                        <div style={{ width: `${barPct}%`, height: 6, borderRadius: 4, background: acc.isYoi ? '#D97706' : 'linear-gradient(90deg, #0D9488, #7C3AED)' }} />
                      </div>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: acc.isYoi ? '#D97706' : '#0D9488', minWidth: 48, textAlign: 'right' }}>{fmt(acc.topViews)}</span>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '0.7rem', marginTop: 3 }}>
                      avg {fmt(acc.avgViews)} views · {acc.videos}/{acc.posts} videos · {acc.avgLikes} avg likes
                      {acc.engagementRate > 0 && ` · ${acc.engagementRate}% engagement`}
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

      {/* ── Latest Reels ── */}
      {activeSection === 'posts' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {data.topPosts.map((post, i) => {
            const GRADIENTS = ['linear-gradient(135deg,#0D9488,#7C3AED)','linear-gradient(135deg,#D97706,#DC2626)','linear-gradient(135deg,#7C3AED,#0D9488)','linear-gradient(135deg,#0891b2,#7C3AED)','linear-gradient(135deg,#059669,#0D9488)']
            const grad = GRADIENTS[i % GRADIENTS.length]
            return (
              <a key={post.url} href={post.url} target="_blank" rel="noopener"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', transition: 'box-shadow 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = '')}>
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
                  <div style={{ color: '#1e293b', fontSize: '0.78rem', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
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

      {/* ── Trends ── */}
      {activeSection === 'trends' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>#️⃣ Top Hashtags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {data.hashtags.map((h, i) => (
                <span key={h.tag} style={{ background: i < 6 ? '#0D9488' : i < 12 ? '#164e63' : '#f1f5f9', color: i < 12 ? '#fff' : '#64748b', padding: '4px 10px', borderRadius: 999, fontSize: i < 6 ? '0.78rem' : '0.71rem', fontWeight: 600 }}>
                  #{h.tag} <span style={{ opacity: 0.75 }}>{h.count}</span>
                </span>
              ))}
            </div>
            <p style={{ marginTop: 14, fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>Add top 8–10 of these to every YOI post for maximum discovery.</p>
          </div>

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

          {/* Engagement Rate Ranking */}
          {ins?.engagementRanking && (
            <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
              <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>⚡ Engagement Rate (Views ÷ Followers)</h3>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 14 }}>Who punches above their weight — regardless of follower count</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {ins.engagementRanking.map((a, i) => (
                  <div key={a.account} style={{ background: a.isYoi ? '#fffbeb' : '#f8fafc', border: `1px solid ${a.isYoi ? '#D97706' : '#e2e8f0'}`, borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1e293b' }}>#{i + 1} {a.name}</span>
                      {a.isYoi && <span style={{ background: '#D97706', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>YOU</span>}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.3rem', color: a.isYoi ? '#D97706' : '#0D9488', marginTop: 2 }}>{a.engagementRate}%</div>
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{fmt(a.followers)} followers · avg {fmt(a.avgViews)} views</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Strategy ── */}
      {activeSection === 'strategy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Dynamic Suggestions — auto-generated from scraped data */}
          {data.suggestions && data.suggestions.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #D97706', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#92400e', margin: 0 }}>⭐ What YOI Should Do Right Now</h3>
                  <p style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 3 }}>Generated from {data.accounts.length} competitor accounts · Updates on every Refresh</p>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {data.suggestions.map((s, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>{s.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#78350f', marginBottom: 3 }}>{s.title}</div>
                        <div style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.45 }}>{s.detail}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* YOI vs Top 3 Head-to-Head */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>🥊 YOI vs Top 3 Competitors</h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>Side-by-side on the metrics that matter</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#94a3b8', fontWeight: 600 }}>Metric</th>
                    {[yoi, ...data.accounts.filter(a => !a.isYoi).slice(0, 3)].filter(Boolean).map(a => (
                      <th key={a!.account} style={{ textAlign: 'center', padding: '6px 8px', color: a!.isYoi ? '#D97706' : '#475569', fontWeight: 700 }}>
                        {a!.name}{a!.isYoi ? ' 🫵' : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: 'Followers', fn: (a: AccountSummary) => a.followers > 0 ? fmt(a.followers) : '—' },
                    { label: 'Top Post Views', fn: (a: AccountSummary) => fmt(a.topViews) },
                    { label: 'Avg Views', fn: (a: AccountSummary) => fmt(a.avgViews) },
                    { label: 'Engagement Rate', fn: (a: AccountSummary) => a.engagementRate > 0 ? `${a.engagementRate}%` : '—' },
                    { label: 'Posts Scraped', fn: (a: AccountSummary) => a.posts },
                    { label: 'Video Posts', fn: (a: AccountSummary) => a.videos },
                    { label: 'Avg Likes', fn: (a: AccountSummary) => a.avgLikes },
                  ].map((row, ri) => (
                    <tr key={row.label} style={{ borderBottom: '1px solid #f1f5f9', background: ri % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '7px 8px', color: '#64748b', fontWeight: 600 }}>{row.label}</td>
                      {[yoi, ...data.accounts.filter(a => !a.isYoi).slice(0, 3)].filter(Boolean).map(a => (
                        <td key={a!.account} style={{ textAlign: 'center', padding: '7px 8px', fontWeight: a!.isYoi ? 700 : 400, color: a!.isYoi ? '#D97706' : '#1e293b' }}>
                          {row.fn(a!)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Best Posting Time + Frequency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {ins && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>⏰ Best Day to Post</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 14 }}>Based on competitor top-performing reels</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {DAY_ORDER.map(day => {
                    const compCount = ins.postsByDay[day] ?? 0
                    const yoiCount = ins.yoiByDay[day] ?? 0
                    const maxCount = Math.max(...DAY_ORDER.map(d => ins.postsByDay[d] ?? 0), 1)
                    const isHot = day === ins.bestDay
                    return (
                      <div key={day}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: isHot ? '#D97706' : '#64748b', fontWeight: isHot ? 700 : 400, marginBottom: 2 }}>
                          <span>{isHot ? '🔥 ' : ''}{day}</span>
                          <span>{compCount} competitor posts · YOI: {yoiCount}</span>
                        </div>
                        <div style={{ background: '#f1f5f9', borderRadius: 4, height: 7 }}>
                          <div style={{ width: `${Math.round((compCount / maxCount) * 100)}%`, height: 7, borderRadius: 4, background: isHot ? '#D97706' : '#0D9488', opacity: 0.7 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p style={{ fontSize: '0.73rem', color: '#D97706', fontWeight: 600, marginTop: 12 }}>
                  🔥 Best time: {ins.bestDay}s around {ins.bestHourLabel} UTC
                </p>
              </div>
            )}

            {ins && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>📅 Posting Frequency (30 days)</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>YOI vs competitor average</p>

                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  {[
                    { label: 'YOI Posts', value: ins.yoiPostsRecent, color: '#D97706' },
                    { label: 'Competitor Avg', value: ins.avgCompetitorPostsRecent, color: '#0D9488' },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '2rem', color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '0.73rem', color: '#64748b' }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {ins.avgCompetitorPostsRecent > ins.yoiPostsRecent && (
                  <div style={{ background: '#fef3c7', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#92400e' }}>
                    📉 YOI is posting <strong>{Math.round(ins.avgCompetitorPostsRecent - ins.yoiPostsRecent)} fewer reels</strong> per month than competitors. More posts = more reach.
                  </div>
                )}
                {ins.yoiPostsRecent >= ins.avgCompetitorPostsRecent && (
                  <div style={{ background: '#dcfce7', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#166534' }}>
                    ✅ YOI is posting at or above competitor average. Keep it up!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Caption Sweet Spot + Winning First Lines */}
          {ins && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>✍️ Caption Sweet Spot</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>Length of captions in top-performing competitor reels</p>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {[
                    { label: 'Viral posts avg', value: `${ins.sweetSpotCaptionLength} chars`, color: '#0D9488' },
                    { label: 'YOI avg', value: `${ins.yoiAvgCaptionLength} chars`, color: '#D97706' },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.3rem', color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.label}</div>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                  Strong hook in the first sentence. Story or detail in 2–3 more lines. End with a soft CTA.
                </p>
              </div>

              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>🎣 Winning Opening Lines</h3>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 14 }}>First line of competitor top-viewed reels</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ins.winningFirstLines.slice(0, 6).map((line, i) => (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: '7px 10px', fontSize: '0.75rem', color: '#475569', lineHeight: 1.4 }}>
                      <span style={{ color: '#0D9488', fontWeight: 700, marginRight: 6 }}>{i + 1}.</span>"{line}"
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ── Network (Following Scraper) ── */}
      {activeSection === 'network' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header card */}
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #4c1d95)', borderRadius: 12, padding: '18px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', margin: 0 }}>🕵️ Competitor Following Analysis</h3>
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.75rem', marginTop: 4 }}>
                  See who your competitors follow — find influencers, suppliers, and industry accounts they watch
                </p>
                {netStatus === 'running' && <p style={{ color: '#FCD34D', fontSize: '0.72rem', marginTop: 4 }}>⏳ Scraping following lists… (~10 min total)</p>}
                {netStatus === 'done'    && <p style={{ color: '#6EE7B7', fontSize: '0.72rem', marginTop: 4 }}>✅ Done!</p>}
                {netStatus === 'failed'  && <p style={{ color: '#FCA5A5', fontSize: '0.72rem', marginTop: 4 }}>❌ Failed — try again</p>}
              </div>
              <button onClick={startNetworkScrape} disabled={netStatus === 'running' || netStatus === 'starting'}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', opacity: netStatus === 'running' || netStatus === 'starting' ? 0.5 : 1 }}>
                {netStatus === 'starting' ? '⏳ Starting…' : netStatus === 'running' ? '⏳ Running…' : '🔄 Scrape Following Lists'}
              </button>
            </div>
            {netSummary && (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {[
                  { label: 'Accounts Scraped', value: netSummary.accountsScraped },
                  { label: 'Unique Follows', value: fmt(netSummary.totalUniqueFollows) },
                  { label: 'Common Follows (2+)', value: netSummary.commonFollows.length },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 14px' }}>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>{s.value}</div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {!netSummary && netStatus === 'idle' && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.85rem' }}>
              No data yet. Click "Scrape Following Lists" to start. Takes ~10 minutes for all competitor accounts.
            </div>
          )}

          {netSummary && (
            <>
              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 8 }}>
                {(['common', 'verified', 'all'] as const).map(f => (
                  <button key={f} onClick={() => setNetFilter(f)}
                    style={{ padding: '5px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer',
                      background: netFilter === f ? '#7C3AED' : '#f1f5f9',
                      color: netFilter === f ? '#fff' : '#64748b' }}>
                    {f === 'common' ? `👥 Common Follows (${netSummary.commonFollows.length})` : f === 'verified' ? '✅ Verified Only' : '📋 By Account'}
                  </button>
                ))}
              </div>

              {/* Common follows view */}
              {netFilter === 'common' && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                  <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>👥 Accounts Followed by Multiple Competitors</h3>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>If 3+ competitors all follow the same person, that's an influencer worth reaching out to</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {netSummary.commonFollows.slice(0, 50).map(cf => (
                      <div key={cf.account.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                        <img src={cf.account.profilePicUrl} alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <a href={`https://www.instagram.com/${cf.account.username}/`} target="_blank" rel="noopener"
                              style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', textDecoration: 'none' }}>
                              @{cf.account.username}
                            </a>
                            {cf.account.isVerified && <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>✓ Verified</span>}
                            {cf.account.isPrivate && <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>🔒 Private</span>}
                          </div>
                          {cf.account.fullName && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cf.account.fullName}</div>}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#7C3AED' }}>{cf.sharedBy.length} follow</div>
                          <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>score {cf.score}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verified filter */}
              {netFilter === 'verified' && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                  <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 4 }}>✅ Verified Accounts Competitors Follow</h3>
                  <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 16 }}>Brands, media, and public figures your competitors watch</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {netSummary.commonFollows.filter(cf => cf.account.isVerified).slice(0, 50).map(cf => (
                      <div key={cf.account.username} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                        <img src={cf.account.profilePicUrl} alt="" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <a href={`https://www.instagram.com/${cf.account.username}/`} target="_blank" rel="noopener"
                              style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1e293b', textDecoration: 'none' }}>
                              @{cf.account.username}
                            </a>
                            <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>✓ Verified</span>
                          </div>
                          {cf.account.fullName && <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{cf.account.fullName}</div>}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#7C3AED' }}>{cf.sharedBy.length} follow</div>
                      </div>
                    ))}
                    {netSummary.commonFollows.filter(cf => cf.account.isVerified).length === 0 && (
                      <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>No verified common follows found.</div>
                    )}
                  </div>
                </div>
              )}

              {/* By account drill-down */}
              {netFilter === 'all' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20 }}>
                    <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', marginBottom: 14 }}>📋 Browse by Account</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                      {netSummary.accounts.map(a => (
                        <button key={a.username} onClick={() => loadAccountFollowing(a.username)}
                          style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 600, border: '1px solid #e2e8f0', cursor: 'pointer',
                            background: netAccount === a.username ? '#7C3AED' : '#f8fafc',
                            color: netAccount === a.username ? '#fff' : '#475569' }}>
                          @{a.username} <span style={{ opacity: 0.7 }}>({a.totalFollowing})</span>
                        </button>
                      ))}
                    </div>

                    {netAccountData && (
                      <>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 12 }}>
                          Showing {netAccountData.accounts.length} accounts that @{netAccountData.username} follows
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 400, overflowY: 'auto' }}>
                          {netAccountData.accounts.map(acc => (
                            <div key={acc.username} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: '#f8fafc' }}>
                              <img src={acc.profilePicUrl} alt="" width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <a href={`https://www.instagram.com/${acc.username}/`} target="_blank" rel="noopener"
                                  style={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b', textDecoration: 'none' }}>
                                  @{acc.username}
                                </a>
                                {acc.fullName && <span style={{ color: '#94a3b8', fontSize: '0.7rem', marginLeft: 6 }}>{acc.fullName}</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {acc.isVerified && <span style={{ background: '#3b82f6', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>✓</span>}
                                {acc.isPrivate  && <span style={{ background: '#f1f5f9', color: '#94a3b8', fontSize: '0.58rem', padding: '1px 4px', borderRadius: 3 }}>🔒</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    {netAccount && !netAccountData && (
                      <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>Loading…</div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
