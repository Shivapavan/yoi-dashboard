interface MetricCardProps {
  label: string
  value: number
  borderColor: string
}

export default function MetricCard({ label, value, borderColor }: MetricCardProps) {
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
  return (
    <div className="bg-white rounded-lg p-5 shadow-sm" style={{ borderLeft: `4px solid ${borderColor}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-2">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{formatted}</p>
    </div>
  )
}
