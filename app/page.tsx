import Header from './components/Header'
import DisputeAlert from './components/DisputeAlert'
import Dashboard from './components/Dashboard'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      <main className="max-w-6xl mx-auto px-6 py-6">
        <DisputeAlert />
        <Dashboard />
      </main>
    </div>
  )
}
