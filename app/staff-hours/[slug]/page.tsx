import StaffHoursPublic from '@/app/components/StaffHoursPublic'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

function getStaffHoursPublicSlug(): string | null {
  const s = process.env.STAFF_HOURS_PUBLIC_SLUG?.trim()
  return s ? s : null
}

export default async function PublicStaffHoursPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const expected = getStaffHoursPublicSlug()
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
            <div className="font-bold text-gray-800">Yum of India · Staff Hours</div>
            <div className="text-xs text-gray-500">Weekly hours &amp; pay by employee</div>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-5">
        <StaffHoursPublic slug={slug} />
      </main>
    </div>
  )
}
