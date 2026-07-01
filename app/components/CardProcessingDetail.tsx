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
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E4E7F3', boxShadow: '0 1px 4px rgba(79,70,229,0.06)' }}
    >
      <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-2" style={{ borderBottom: '1px solid #E4E7F3' }}>
        <div>
          <h3 className="font-semibold" style={{ color: '#1E1B4B' }}>Card processing detail (calendar day)</h3>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{windowLabel}</p>
        </div>
        {historical && (
          <span
            className="text-xs px-2 py-1 rounded"
            style={{ color: '#B45309', backgroundColor: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)' }}
          >
            Per-card breakdown only available for current business day
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ borderBottom: '1px solid #E4E7F3' }}>
            <th className="text-left px-6 py-3 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Card Type</th>
            <th className="text-right px-6 py-3 text-xs uppercase tracking-wide font-semibold" style={{ color: '#94A3B8' }}>Amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} style={{ borderBottom: '1px solid #F0F2FA' }} className="last:border-0">
              <td className="px-6 py-3" style={{ color: row.bold ? '#1E1B4B' : '#4B5563', fontWeight: row.bold ? '700' : undefined }}>
                {row.label}
              </td>
              <td className="px-6 py-3 text-right font-semibold" style={{ color: row.bold ? '#1E1B4B' : '#0D9488', fontWeight: row.bold ? '700' : undefined }}>
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
