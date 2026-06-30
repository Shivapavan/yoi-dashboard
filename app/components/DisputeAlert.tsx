'use client'

import { useEffect, useState, useCallback } from 'react'

const REFRESH_MS = 5 * 60 * 1000

interface Dispute {
  date: string
  txnId: string
  authCode: string
  amount: number
  last4: string
  customer: string
  server: string
  link: string
}

export default function DisputeAlert() {
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [lastScanned, setLastScanned] = useState<string>('')

  const fetchData = useCallback(() => {
    fetch('/api/disputes')
      .then((r) => r.json())
      .then((d) => { if (!d.error) { setDisputes(d.disputes); setLastScanned(d.lastScanned) } })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  if (disputes.length === 0) return null

  return (
    <div
      className="rounded-xl p-4 mb-6"
      style={{ backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="font-bold text-sm uppercase tracking-wide" style={{ color: '#F87171' }}>⚠️ Disputed Transactions</span>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#DC2626', color: '#fff' }}>
          {disputes.length}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: '#8B949E' }}>
        Scanned last 90 days · Event Status = Notification of Dispute · Last scanned {lastScanned}
      </p>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase font-semibold" style={{ borderBottom: '1px solid rgba(220,38,38,0.25)', color: '#F87171' }}>
              {['Date','Transaction ID','Auth','Customer','Card','Server','Amount','Receipt'].map(h => (
                <th key={h} className="text-left py-1 pr-4">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {disputes.map((d) => (
              <tr key={d.txnId} style={{ borderBottom: '1px solid rgba(220,38,38,0.15)', color: '#C9D1D9' }} className="last:border-0">
                <td className="py-2 pr-4">{d.date}</td>
                <td className="py-2 pr-4 font-mono text-xs">{d.txnId}</td>
                <td className="py-2 pr-4">{d.authCode}</td>
                <td className="py-2 pr-4">{d.customer}</td>
                <td className="py-2 pr-4">*{d.last4}</td>
                <td className="py-2 pr-4">{d.server}</td>
                <td className="py-2 pr-4 font-semibold" style={{ color: '#F87171' }}>${d.amount.toFixed(2)}</td>
                <td className="py-2">
                  <a href={d.link} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    style={{ backgroundColor: '#DC2626', color: '#fff' }}>
                    Open in Shift4
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {disputes.map((d) => (
          <div
            key={d.txnId}
            className="rounded-xl p-3"
            style={{ backgroundColor: 'rgba(22,27,34,0.8)', border: '1px solid rgba(220,38,38,0.3)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-base" style={{ color: '#F87171' }}>${d.amount.toFixed(2)}</span>
              <span className="text-xs" style={{ color: '#8B949E' }}>{d.date}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2" style={{ color: '#C9D1D9' }}>
              <div><span className="uppercase tracking-wide" style={{ color: '#6E7681' }}>Txn ID</span><br /><span className="font-mono">{d.txnId}</span></div>
              <div><span className="uppercase tracking-wide" style={{ color: '#6E7681' }}>Auth</span><br />{d.authCode}</div>
              <div><span className="uppercase tracking-wide" style={{ color: '#6E7681' }}>Card</span><br />*{d.last4}</div>
              <div><span className="uppercase tracking-wide" style={{ color: '#6E7681' }}>Server</span><br />{d.server}</div>
            </div>
            <a href={d.link} target="_blank" rel="noopener noreferrer"
              className="block w-full text-center text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: '#DC2626', color: '#fff' }}>
              Open in Shift4
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
