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
    <div className="bg-white rounded-lg shadow-sm mt-6 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-gray-800">Card processing detail (calendar day)</h3>
          <p className="text-xs text-gray-400 mt-0.5">{windowLabel}</p>
        </div>
        {historical && (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
            Per-card breakdown only available for current business day
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-6 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Card Type</th>
            <th className="text-right px-6 py-3 text-xs uppercase tracking-wide text-gray-500 font-semibold">Amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-b border-gray-50 last:border-0">
              <td className={`px-6 py-3 ${row.bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                {row.label}
              </td>
              <td className={`px-6 py-3 text-right ${row.bold ? 'font-bold text-gray-900' : 'text-gray-400'}`}>
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
