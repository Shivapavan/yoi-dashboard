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
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
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
                    className="bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded hover:bg-red-700 transition-colors whitespace-nowrap">
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
          <div key={d.txnId} className="bg-white rounded-lg border border-red-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-red-700 text-base">${d.amount.toFixed(2)}</span>
              <span className="text-xs text-gray-500">{d.date}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
              <div><span className="text-gray-400 uppercase tracking-wide">Txn ID</span><br /><span className="font-mono">{d.txnId}</span></div>
              <div><span className="text-gray-400 uppercase tracking-wide">Auth</span><br />{d.authCode}</div>
              <div><span className="text-gray-400 uppercase tracking-wide">Card</span><br />*{d.last4}</div>
              <div><span className="text-gray-400 uppercase tracking-wide">Server</span><br />{d.server}</div>
            </div>
            <a href={d.link} target="_blank" rel="noopener noreferrer"
              className="block w-full text-center bg-red-600 text-white text-xs font-semibold px-3 py-2 rounded hover:bg-red-700 transition-colors">
              Open in Shift4
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
