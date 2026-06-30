import Header from './components/Header'
import DisputeAlert from './components/DisputeAlert'
import Dashboard from './components/Dashboard'
import IdleGuard from './components/IdleGuard'

export default function Home() {
  return (
    <IdleGuard>
      <div className="min-h-screen" style={{ backgroundColor: 'var(--yoi-bg)' }}>
        <Header />
        <main className="max-w-6xl mx-auto px-6 py-6">
          <Dashboard />
          <DisputeAlert />
        </main>
      </div>
    </IdleGuard>
  )
}
