'use client'

import { useEffect, useState } from 'react'
import EventsCalendar from '../EventsCalendar'

// July end this year (computed at render so the calendar follows the calendar year).
function julyEndThisYear(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric' })
  const y = fmt.format(new Date())
  return `${y}-07-31`
}

export default function EventsSpace() {
  const [slug, setSlug] = useState<string | null>(null)
  const [slugLoading, setSlugLoading] = useState(true)
  const endDate = julyEndThisYear()

  useEffect(() => {
    // The admin tab itself uses session auth — but to render the QR we need
    // the public slug. Fetch it from a tiny server endpoint that just echoes
    // EVENTS_PUBLIC_SLUG when called with a valid session.
    fetch('/api/events/slug', { credentials: 'include', cache: 'no-store' })
      .then(r => r.ok ? r.json() : { slug: null })
      .then(j => setSlug(j.slug || null))
      .catch(() => setSlug(null))
      .finally(() => setSlugLoading(false))
  }, [])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = slug ? `${origin}/events/${slug}` : null
  const qrSrc = publicUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(publicUrl)}`
    : null

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex flex-col md:flex-row gap-5 items-start">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-800">Public QR Access</h3>
            <p className="text-sm text-gray-500 mt-1">
              Anyone with this QR can view and edit party-space bookings without logging in.
              Print it, tape it behind the host stand, or share with event staff. Treat the URL
              as the credential — anyone who has it has access.
            </p>

            {slugLoading ? (
              <div className="text-sm text-gray-400 mt-4">Loading link…</div>
            ) : !slug ? (
              <div className="mt-4 border border-amber-200 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded">
                <b>Not configured yet.</b> Set the environment variable{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">EVENTS_PUBLIC_SLUG</code>{' '}
                in Vercel (pick something hard to guess — UUID or 24+ random chars), then redeploy.
                The QR will appear here automatically.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">Public URL</div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publicUrl || ''}
                    className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 font-mono bg-gray-50"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <button
                    onClick={() => publicUrl && navigator.clipboard.writeText(publicUrl)}
                    className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded font-medium"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
          </div>

          {qrSrc && (
            <div className="flex-shrink-0">
              <div className="bg-white p-3 rounded border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrSrc} alt="QR code for Events Space" width={240} height={240} />
              </div>
              <a
                href={qrSrc}
                download="yoi-events-qr.png"
                className="block text-center text-xs text-yoi-primary hover:underline mt-2"
              >
                Download QR
              </a>
            </div>
          )}
        </div>
      </div>

      <EventsCalendar
        endDate={endDate}
        title="Party Space Bookings"
        subtitle={`Today through ${endDate}`}
      />
    </div>
  )
}
