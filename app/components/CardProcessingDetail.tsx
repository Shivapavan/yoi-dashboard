interface Row {
  label: string
  amount: number | null
  bold?: boolean
}

interface Props {
  windowLabel: string
  rows: Row[]
  historical?: boolean
}

export default function CardProcessingDetail({ windowLabel, rows, historical }: Props) {
  return (
    <div
      className="rounded-xl mt-6 overflow-hidden"
      style={{ backgroundColor: '#161B22', border: '1px solid #21262D' }}
    >
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid #21262D' }}>
        <div>
          <h3 className="font-semibold" style={{ color: '#E6EDF3' }}>Card processing detail (calendar day)</h3>
          <p className="text-xs mt-0.5" style={{ color: '#6E7681' }}>{windowLabel}</p>
        </div>
        {historical && (
          <span
            className="text-xs px-2 py-1 rounded"
            style={{ color: '#FCD34D', backgroundColor: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)' }}
          >
            Per-card breakdown only available for current business day
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #21262D' }}>
            <th className="text-left px-6 py-3 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Card Type</th>
            <th className="text-right px-6 py-3 text-xs uppercase tracking-wide font-semibold" style={{ color: '#6E7681' }}>Amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderBottom: '1px solid #1C2333' }} className="last:border-0">
              <td className="px-6 py-3" style={{ color: row.bold ? '#E6EDF3' : '#C9D1D9', fontWeight: row.bold ? '700' : undefined }}>
                {row.label}
              </td>
              <td className="px-6 py-3 text-right" style={{ color: row.bold ? '#E6EDF3' : '#8B949E', fontWeight: row.bold ? '700' : undefined }}>
                {row.amount == null
                  ? '—'
                  : `$${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
