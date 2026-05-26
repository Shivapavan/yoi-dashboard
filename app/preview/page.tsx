'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

function fmt(v: number) {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Tiny inline SVG sparkline
function Sparkline({ data, color = '#3B82F6' }: { data: number[]; color?: string }) {
  const width = 120, height = 28
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const step = width / (data.length - 1)
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} className="opacity-80">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
      {/* Last point dot */}
      <circle cx={(data.length - 1) * step} cy={height - ((data[data.length - 1] - min) / range) * height} r="2" fill={color} />
    </svg>
  )
}

// Card with delta + sparkline
function MetricCardV2({
  label, value, color, delta14, sparkline,
}: { label: string; value: number; color: string; delta14: number; sparkline: number[] }) {
  const up = delta14 >= 0
  return (
    <div className="bg-white rounded-lg p-5 shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{fmt(value)}</p>
      <div className="flex items-center justify-between mt-2">
        <div className={`text-xs font-medium flex items-center gap-1 ${up ? 'text-green-600' : 'text-red-600'}`}>
          <span>{up ? '▲' : '▼'}</span>
          <span>{Math.abs(delta14).toFixed(1)}%</span>
          <span className="text-gray-400 font-normal">vs 14d avg</span>
        </div>
        <Sparkline data={sparkline} color={color} />
      </div>
    </div>
  )
}

// Hourly heatmap
function HourlyHeatmap({ today, average }: { today: number[]; average: number[] }) {
  const hours = ['9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p']
  const max = Math.max(...today, ...average) || 1

  function colorFor(actual: number, avg: number) {
    if (actual === 0) return 'bg-gray-100'
    const ratio = actual / (avg || 1)
    if (ratio >= 1.3)  return 'bg-green-600 text-white'
    if (ratio >= 1.1)  return 'bg-green-400 text-white'
    if (ratio >= 0.9)  return 'bg-amber-200 text-gray-700'
    if (ratio >= 0.5)  return 'bg-orange-300 text-gray-800'
    return 'bg-red-400 text-white'
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-800">Hourly Sales — Today vs Typical</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-400 inline-block rounded" /> Slow</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 inline-block rounded" /> Normal</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-600 inline-block rounded" /> Strong</span>
        </div>
      </div>
      <div className="grid grid-cols-14 gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
        {hours.map((h, i) => (
          <div key={h} className="text-center">
            <div className={`rounded-md py-3 text-xs font-bold ${colorFor(today[i], average[i])}`}>
              ${Math.round(today[i])}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{h}</div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3 italic">
        Green = above average, Red = below average. Tap any hour to see ticket detail.
      </p>
    </div>
  )
}

// Revenue mix donut
function RevenueMix() {
  const data = [
    { name: 'Dine-in',    value: 1850, color: '#5B21B6' },
    { name: 'Pickup',     value:  720, color: '#3B82F6' },
    { name: 'DoorDash',   value:  445, color: '#EF4444' },
    { name: 'Uber Eats',  value:  282, color: '#0F172A' },
    { name: 'Catering',   value:  863, color: '#B8860B' },
  ]
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <h3 className="font-semibold text-gray-800 mb-4">Revenue Mix — Today</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {data.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {data.map(d => {
            const pct = (d.value / total) * 100
            return (
              <div key={d.name} className="flex items-center gap-3 text-sm">
                <span className="w-3 h-3 rounded-sm" style={{ background: d.color }} />
                <span className="text-gray-700 flex-1">{d.name}</span>
                <span className="font-semibold text-gray-900">{fmt(d.value)}</span>
                <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(0)}%</span>
              </div>
            )
          })}
          <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between text-sm font-bold">
            <span className="text-gray-900">Total</span>
            <span className="text-purple-700">{fmt(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PreviewPage() {
  const router = useRouter()
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (!d.user) router.replace('/login')
      else setAuthed(true)
    })
  }, [router])

  if (!authed) return null

  // Mock data based on today's actual numbers
  const todaySparkline   = [3100, 3250, 2950, 3400, 3550, 3100, 3700, 3500, 3200, 3650, 3800, 3450, 3550, 3709]
  const netSparkline     = [2870, 2980, 2730, 3140, 3270, 2870, 3410, 3230, 2960, 3370, 3500, 3180, 3270, 3427]
  const taxSparkline     = [235, 244, 224, 257, 268, 235, 280, 265, 243, 276, 287, 261, 268, 281]
  const voidSparkline    = [12, 8, 18, 5, 22, 14, 9, 6, 25, 11, 8, 16, 12, 97]
  const cashSparkline    = [12, 18, 8, 14, 22, 6, 4, 11, 16, 9, 13, 7, 8, 5.92]
  const cardSparkline    = [3050, 3180, 2880, 3320, 3490, 3030, 3640, 3470, 3140, 3580, 3700, 3400, 3490, 3692]
  const discountSparkline= [5, 8, 12, 0, 4, 10, 6, 0, 3, 0, 11, 7, 4, 10.44]
  const openSparkline    = [125, 88, 200, 45, 150, 120, 90, 60, 175, 110, 80, 165, 130, 7.57]

  const todayHourly   = [120, 180, 450, 680, 590, 320, 180, 220, 380, 580, 720, 680, 410, 280]
  const averageHourly = [140, 200, 480, 640, 560, 300, 200, 240, 400, 560, 660, 640, 440, 300]

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard Design Preview</h1>
            <p className="text-xs text-gray-500">Mock data — pick what you like and I'll wire it to real data</p>
          </div>
          <a href="/" className="text-sm text-purple-600 hover:text-purple-800">← Back to dashboard</a>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">

        {/* ──────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-700 bg-purple-100 px-2 py-1 rounded">Idea 1</span>
            <h2 className="text-lg font-bold text-gray-900">Daily Pulse banner</h2>
          </div>
          {/* Three example variations */}
          <div className="space-y-2">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
              <div className="text-3xl">🔥</div>
              <div>
                <p className="text-sm text-green-800 font-semibold">Strong Friday</p>
                <p className="text-sm text-gray-700">
                  $3,709 gross — <span className="font-bold">8% above</span> your 4-week Friday average. Busiest hour: 7–8 PM ($720). Catering brought in $863.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5 flex items-center gap-4">
              <div className="text-3xl">⚠️</div>
              <div>
                <p className="text-sm text-amber-800 font-semibold">Voids spiked</p>
                <p className="text-sm text-gray-700">
                  Voids today: $97 — <span className="font-bold">8× higher</span> than your 14-day average ($12). Worth checking with Vaishu.
                </p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl p-5 flex items-center gap-4">
              <div className="text-3xl">📉</div>
              <div>
                <p className="text-sm text-red-800 font-semibold">Slow lunch</p>
                <p className="text-sm text-gray-700">
                  Only $312 between 11 AM – 2 PM, vs. typical $850. Dinner is recovering — keep an eye on it.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-700 bg-purple-100 px-2 py-1 rounded">Idea 2</span>
            <h2 className="text-lg font-bold text-gray-900">Metric cards with delta + sparkline</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCardV2 label="Gross Sales"          value={3709.48} color="#3B82F6" delta14={+8.4}  sparkline={todaySparkline} />
            <MetricCardV2 label="Net Sales"            value={3427.16} color="#22C55E" delta14={+7.9}  sparkline={netSparkline} />
            <MetricCardV2 label="Taxes"                value={281.00}  color="#F59E0B" delta14={+8.2}  sparkline={taxSparkline} />
            <MetricCardV2 label="Voids"                value={97.42}   color="#EF4444" delta14={+712}  sparkline={voidSparkline} />
            <MetricCardV2 label="Cash Payments"        value={5.92}    color="#16A34A" delta14={-44}   sparkline={cashSparkline} />
            <MetricCardV2 label="Credit Card Payments" value={3692.35} color="#7C3AED" delta14={+8.7}  sparkline={cardSparkline} />
            <MetricCardV2 label="Discounts"            value={10.44}   color="#EC4899" delta14={+92}   sparkline={discountSparkline} />
            <MetricCardV2 label="Open Tickets"         value={7.57}    color="#0891B2" delta14={-94}   sparkline={openSparkline} />
          </div>
        </section>

        {/* ──────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-700 bg-purple-100 px-2 py-1 rounded">Idea 3</span>
            <h2 className="text-lg font-bold text-gray-900">Hourly sales heatmap</h2>
          </div>
          <HourlyHeatmap today={todayHourly} average={averageHourly} />
        </section>

        {/* ──────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-purple-700 bg-purple-100 px-2 py-1 rounded">Idea 4</span>
            <h2 className="text-lg font-bold text-gray-900">Revenue mix donut</h2>
          </div>
          <RevenueMix />
        </section>

        <div className="bg-white rounded-xl border-2 border-purple-200 p-6 text-center">
          <p className="text-sm text-gray-700 mb-2">Tell me which idea(s) you want — I'll build them with real data</p>
          <p className="text-xs text-gray-400">e.g. "Build #1 and #2" or "I like #1 and #3"</p>
        </div>
      </div>
    </div>
  )
}
