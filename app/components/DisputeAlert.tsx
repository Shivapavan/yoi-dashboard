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
    <div className="border border-red-300 rounded-lg bg-red-50 p-4 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-red-600 font-bold text-sm uppercase tracking-wide">⚠️ Disputed Transactions</span>
        <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">{disputes.length}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Scanned last 90 days · Event Status = Notification of Dispute · Last scanned {lastScanned}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-red-700 font-semibold border-b border-red-200">
            {['Date','Transaction ID','Auth','Customer','Card','Server','Amount','Receipt'].map(h => (
              <th key={h} className="text-left py-1 pr-4">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {disputes.map((d) => (
            <tr key={d.txnId} className="border-b border-red-100 last:border-0">
              <td className="py-2 pr-4">{d.date}</td>
              <td className="py-2 pr-4 font-mono text-xs">{d.txnId}</td>
              <td className="py-2 pr-4">{d.authCode}</td>
              <td className="py-2 pr-4">{d.customer}</td>
              <td className="py-2 pr-4">*{d.last4}</td>
              <td className="py-2 pr-4">{d.server}</td>
              <td className="py-2 pr-4 font-semibold text-red-700">${d.amount.toFixed(2)}</td>
              <td className="py-2">
                <a href={d.link} target="_blank" rel="noopener noreferrer"
                  className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-700 transition-colors">
                  Open in Shift4
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
