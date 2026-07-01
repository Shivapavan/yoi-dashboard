import EventsCalendar from '@/app/components/EventsCalendar'
import { getEventsPublicSlug } from '@/lib/events'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function PublicEventsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const expected = getEventsPublicSlug()
  if (!expected || slug !== expected) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/yum_logo.png" alt="Yum of India" className="h-10 w-auto" />
          <div>
            <div className="font-bold text-gray-800">Yum of India · Events Space</div>
            <div className="text-xs text-gray-500">Party space bookings</div>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-5">
        <EventsCalendar
          slug={slug}
          title="Party Space Bookings"
          subtitle="Browse availability and request a booking"
        />
      </main>
    </div>
  )
}
