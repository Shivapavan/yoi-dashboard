'use client'

import { useEffect, useState } from 'react'

// Google Maps
interface PlaceResult {
  placeId: string; name: string; rating: number; userRatingsTotal: number
  address: string; phone: string; website: string; isYoi: boolean
  reviews: { author: string; rating: number; text: string; relativeTime: string }[]
  scrapedAt: string
}
interface MapsIntel { lastUpdated: string; totalPlaces: number; places: PlaceResult[]; yoi: PlaceResult | null; avgRating: number }

// Yelp
interface YelpBusiness {
  id: string; name: string; rating: number; reviewCount: number
  address: string; url: string; imageUrl: string; categories: string[]
  isYoi: boolean; scrapedAt: string
  reviews: { id: string; text: string; rating: number; author: string; timeCreated: string; url: string }[]
}
interface YelpIntel {
  lastUpdated: string; totalBusinesses: number; businesses: YelpBusiness[]
  yoi: YelpBusiness | null; avgRating: number
  recentReviews: ({ businessName: string; isYoi: boolean } & YelpBusiness['reviews'][0])[]
}

// Search
interface SearchItem { position: number; title: string; url: string; displayUrl: string; snippet: string; isYoi: boolean }
interface SearchResult { query: string; yoiPosition: number | null; items: SearchItem[]; scrapedAt: string }
interface SearchIntel { lastUpdated: string; queries: SearchResult[]; yoiVisibility: number; totalQueries: number; avgYoiPosition: number }

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span style={{ color: '#F59E0B', fontSize: '0.8rem', letterSpacing: -1 }}>
      {'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}
    </span>
  )
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

function useRefresh(endpoint: string, onDone: () => void) {
  const [status, setStatus] = useState<RefreshStatus>('idle')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (status !== 'running') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/${endpoint}-refresh`)
        const json = await res.json()
        if (json.status === 'done') { setStatus('done'); onDone() }
        else if (json.status === 'failed') { setStatus('failed') }
        else if (json.elapsedSecs) { setElapsed(json.elapsedSecs) }
      } catch { /* keep polling */ }
    }, 30_000)
    return () => clearInterval(interval)
  }, [status, endpoint, onDone])

  const start = async () => {
    setStatus('starting')
    try {
      const res = await fetch(`/api/${endpoint}-refresh`, { method: 'POST' })
      const json = await res.json()
      if (json.status === 'started' || json.status === 'already_running') {
        setStatus('running'); setElapsed(0)
      } else { setStatus('failed') }
    } catch { setStatus('failed') }
  }

  return { status, elapsed, start }
}

function RefreshButton({ status, elapsed, onStart, label }: { status: RefreshStatus; elapsed: number; onStart: () => void; label: string }) {
  const busy = status === 'running' || status === 'starting'
  return (
    <button onClick={onStart} disabled={busy}
      style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', color: '#fff', borderRadius: 8, padding: '7px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1 }}>
      {status === 'starting' ? '⏳ Starting…' : status === 'running' ? `⏳ ${label} ${elapsed > 0 ? `${Math.round(elapsed / 60)}m` : ''}` : '🔄 Refresh'}
    </button>
  )
}

export default function LocalIntel() {
  const [mapsData, setMapsData] = useState<MapsIntel | null>(null)
  const [yelpData, setYelpData] = useState<YelpIntel | null>(null)
  const [searchData, setSearchData] = useState<SearchIntel | null>(null)
  const [mapsLoading, setMapsLoading] = useState(true)
  const [yelpLoading, setYelpLoading] = useState(true)
  const [searchLoading, setSearchLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'maps' | 'yelp' | 'search'>('maps')

  const loadMaps   = () => fetch('/api/google-maps-intel').then(r => r.json()).then(d => { setMapsData(d);   setMapsLoading(false)   }).catch(() => setMapsLoading(false))
  const loadYelp   = () => fetch('/api/yelp-intel').then(r => r.json()).then(d => { setYelpData(d);   setYelpLoading(false)   }).catch(() => setYelpLoading(false))
  const loadSearch = () => fetch('/api/google-search-intel').then(r => r.json()).then(d => { setSearchData(d); setSearchLoading(false) }).catch(() => setSearchLoading(false))

  useEffect(() => { loadMaps(); loadYelp(); loadSearch() }, [])

  const mapsRefresh   = useRefresh('google-maps',   loadMaps)
  const yelpRefresh   = useRefresh('yelp',           loadYelp)
  const searchRefresh = useRefresh('google-search',  loadSearch)

  const updatedDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const lastUpdated = mapsData?.lastUpdated ?? yelpData?.lastUpdated ?? searchData?.lastUpdated

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0D9488, #D97706)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', margin: 0 }}>🗺 Local Intelligence</h2>
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', marginTop: 4 }}>
              Google Maps · Yelp · Search Rankings{lastUpdated ? ` · Updated ${updatedDate(lastUpdated)}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Section Nav */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['maps', 'yelp', 'search'] as const).map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            style={{ padding: '6px 16px', borderRadius: 999, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: activeSection === s ? '#0D9488' : '#f1f5f9',
              color: activeSection === s ? '#fff' : '#64748b' }}>
            {s === 'maps' ? '📍 Google Maps' : s === 'yelp' ? '⭐ Yelp Reviews' : '🔍 Search Rankings'}
          </button>
        ))}
      </div>

      {/* ── Google Maps ── */}
      {activeSection === 'maps' && (
        <div>
          {/* Maps sub-header */}
          <div style={{ background: 'linear-gradient(135deg, #1a7a74, #0D9488)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                {mapsLoading ? 'Loading…' : mapsData && !('error' in (mapsData as object))
                  ? `${mapsData.totalPlaces} businesses · avg rating ${mapsData.avgRating}★`
                  : 'No data yet'}
              </div>
              {mapsRefresh.status === 'running' && <div style={{ color: '#FCD34D', fontSize: '0.73rem', marginTop: 3 }}>⏳ Scraping… {mapsRefresh.elapsed > 0 ? `${Math.round(mapsRefresh.elapsed / 60)}m elapsed` : 'starting'}</div>}
              {mapsRefresh.status === 'done'    && <div style={{ color: '#6EE7B7', fontSize: '0.73rem', marginTop: 3 }}>✅ Refreshed!</div>}
              {mapsRefresh.status === 'failed'  && <div style={{ color: '#FCA5A5', fontSize: '0.73rem', marginTop: 3 }}>❌ Failed — try again</div>}
            </div>
            <RefreshButton status={mapsRefresh.status} elapsed={mapsRefresh.elapsed} onStart={mapsRefresh.start} label="Scraping…" />
          </div>

          {mapsLoading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading…</div>}
          {!mapsLoading && (!mapsData || 'error' in (mapsData as object)) && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No Google Maps data yet. Click Refresh to fetch.</div>
          )}
          {!mapsLoading && mapsData && !('error' in (mapsData as object)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mapsData.places.map((place, i) => (
                <div key={place.placeId} style={{ background: place.isYoi ? '#fffbeb' : '#fff', border: `1px solid ${place.isYoi ? '#D97706' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 16px', boxShadow: place.isYoi ? '0 0 0 2px #D97706' : undefined }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <RankBadge rank={i + 1} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{place.name}</span>
                        {place.isYoi && <span style={{ background: '#D97706', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4 }}>YOU</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                        <StarRating rating={place.rating} />
                        <span style={{ fontWeight: 800, color: place.isYoi ? '#D97706' : '#0D9488', fontSize: '0.9rem' }}>{place.rating.toFixed(1)}</span>
                        <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>({fmt(place.userRatingsTotal)} reviews)</span>
                      </div>
                      {place.address && <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 3 }}>{place.address}</div>}
                    </div>
                  </div>
                  {place.reviews.length > 0 && (
                    <div style={{ marginTop: 8, paddingLeft: 34 }}>
                      <div style={{ color: '#94a3b8', fontSize: '0.68rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        "{place.reviews[0].text}"
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: '0.65rem', marginTop: 2 }}>— {place.reviews[0].author} · {place.reviews[0].relativeTime}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Yelp ── */}
      {activeSection === 'yelp' && (
        <div>
          {/* Yelp sub-header */}
          <div style={{ background: 'linear-gradient(135deg, #c0392b, #e74c3c)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                {yelpLoading ? 'Loading…' : yelpData && !('error' in (yelpData as object))
                  ? `${yelpData.totalBusinesses} businesses · avg rating ${yelpData.avgRating}★`
                  : 'No data yet'}
              </div>
              {yelpRefresh.status === 'running' && <div style={{ color: '#FCD34D', fontSize: '0.73rem', marginTop: 3 }}>⏳ Scraping… {yelpRefresh.elapsed > 0 ? `${Math.round(yelpRefresh.elapsed / 60)}m elapsed` : 'starting'}</div>}
              {yelpRefresh.status === 'done'    && <div style={{ color: '#6EE7B7', fontSize: '0.73rem', marginTop: 3 }}>✅ Refreshed!</div>}
              {yelpRefresh.status === 'failed'  && <div style={{ color: '#FCA5A5', fontSize: '0.73rem', marginTop: 3 }}>❌ Failed — try again</div>}
            </div>
            <RefreshButton status={yelpRefresh.status} elapsed={yelpRefresh.elapsed} onStart={yelpRefresh.start} label="Scraping…" />
          </div>

          {yelpLoading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading…</div>}
          {!yelpLoading && (!yelpData || 'error' in (yelpData as object)) && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No Yelp data yet. Click Refresh to fetch.</div>
          )}
          {!yelpLoading && yelpData && !('error' in (yelpData as object)) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Leaderboard */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', margin: '0 0 4px 0' }}>Rating Leaderboard</h3>
                {yelpData.businesses.map((biz, i) => (
                  <div key={biz.id} style={{ background: biz.isYoi ? '#fffbeb' : '#fff', border: `1px solid ${biz.isYoi ? '#D97706' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 14px', boxShadow: biz.isYoi ? '0 0 0 2px #D97706' : undefined }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RankBadge rank={i + 1} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <a href={biz.url} target="_blank" rel="noopener" style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', textDecoration: 'none' }}>{biz.name}</a>
                          {biz.isYoi && <span style={{ background: '#D97706', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>YOU</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <StarRating rating={biz.rating} />
                          <span style={{ fontWeight: 800, color: biz.isYoi ? '#D97706' : '#c0392b', fontSize: '0.85rem' }}>{biz.rating.toFixed(1)}</span>
                          <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>({fmt(biz.reviewCount)})</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Recent Reviews */}
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b', margin: '0 0 12px 0' }}>Recent Reviews</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {yelpData.recentReviews.slice(0, 10).map((rev, i) => (
                    <div key={`${rev.id}-${i}`} style={{ background: rev.isYoi ? '#fffbeb' : '#fff', border: `1px solid ${rev.isYoi ? '#fde68a' : '#e2e8f0'}`, borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1e293b' }}>{rev.author}</span>
                          {rev.isYoi && <span style={{ marginLeft: 6, background: '#D97706', color: '#fff', fontSize: '0.58rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>YOI</span>}
                          <span style={{ color: '#94a3b8', fontSize: '0.7rem', marginLeft: 6 }}>on {rev.businessName}</span>
                        </div>
                        <StarRating rating={rev.rating} />
                      </div>
                      <div style={{ color: '#475569', fontSize: '0.75rem', lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                        {rev.text}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '0.65rem', marginTop: 4 }}>
                        {new Date(rev.timeCreated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Search Rankings ── */}
      {activeSection === 'search' && (
        <div>
          {/* Search sub-header */}
          <div style={{ background: 'linear-gradient(135deg, #1565c0, #1976d2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                {searchLoading ? 'Loading…' : searchData && !('error' in (searchData as object))
                  ? `${searchData.yoiVisibility} of ${searchData.totalQueries} queries show YOI in top 10`
                  : 'No data yet'}
              </div>
              {searchData && !('error' in (searchData as object)) && searchData.yoiVisibility > 0 && (
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.72rem', marginTop: 2 }}>
                  Avg position when found: #{Math.round(searchData.avgYoiPosition)}
                </div>
              )}
              {searchRefresh.status === 'running' && <div style={{ color: '#FCD34D', fontSize: '0.73rem', marginTop: 3 }}>⏳ Searching… {searchRefresh.elapsed > 0 ? `${Math.round(searchRefresh.elapsed / 60)}m elapsed` : 'starting'}</div>}
              {searchRefresh.status === 'done'    && <div style={{ color: '#6EE7B7', fontSize: '0.73rem', marginTop: 3 }}>✅ Refreshed!</div>}
              {searchRefresh.status === 'failed'  && <div style={{ color: '#FCA5A5', fontSize: '0.73rem', marginTop: 3 }}>❌ Failed — try again</div>}
            </div>
            <RefreshButton status={searchRefresh.status} elapsed={searchRefresh.elapsed} onStart={searchRefresh.start} label="Searching…" />
          </div>

          {searchLoading && <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading…</div>}
          {!searchLoading && (!searchData || 'error' in (searchData as object)) && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No search data yet. Click Refresh to check rankings.</div>
          )}
          {!searchLoading && searchData && !('error' in (searchData as object)) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Summary card */}
              <div style={{ background: searchData.yoiVisibility >= searchData.totalQueries / 2 ? '#dcfce7' : '#fef3c7', border: `1px solid ${searchData.yoiVisibility >= searchData.totalQueries / 2 ? '#86efac' : '#fde68a'}`, borderRadius: 10, padding: '14px 18px', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: searchData.yoiVisibility >= searchData.totalQueries / 2 ? '#166534' : '#92400e' }}>
                  {searchData.yoiVisibility >= searchData.totalQueries / 2 ? '✅' : '⚠️'} YOI appears in {searchData.yoiVisibility} of {searchData.totalQueries} search queries
                  {searchData.yoiVisibility > 0 && ` · avg position #${Math.round(searchData.avgYoiPosition)}`}
                </div>
                {searchData.yoiVisibility < searchData.totalQueries && (
                  <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: 4 }}>
                    {searchData.totalQueries - searchData.yoiVisibility} quer{searchData.totalQueries - searchData.yoiVisibility === 1 ? 'y' : 'ies'} where YOI is not in the top 10 — opportunities for local SEO improvement.
                  </div>
                )}
              </div>

              {/* Per-query rows */}
              {searchData.queries.map((result, i) => (
                <div key={i} style={{ background: result.yoiPosition !== null ? '#fffbeb' : '#fff', border: `1px solid ${result.yoiPosition !== null ? '#fde68a' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>"{result.query}"</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.68rem', marginTop: 2 }}>
                        {new Date(result.scrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                    {result.yoiPosition !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '1rem' }}>🏆</span>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '1.3rem', color: '#D97706', lineHeight: 1 }}>#{result.yoiPosition}</div>
                          <div style={{ fontSize: '0.65rem', color: '#92400e', fontWeight: 600 }}>YOI position</div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>Not in top 10</div>
                    )}
                  </div>
                  {result.yoiPosition !== null && result.items.length > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #fde68a' }}>
                      {result.items.filter(item => item.isYoi).map((item, j) => (
                        <div key={j}>
                          <a href={item.url} target="_blank" rel="noopener" style={{ color: '#1565c0', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none' }}>{item.title}</a>
                          <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{item.snippet}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
