import type { Metadata } from 'next'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import VisitorBeacon from './components/VisitorBeacon'
import TokenAlert from './components/TokenAlert'

export const metadata: Metadata = {
  title: 'Yum of India — Daily Dashboard',
  description: 'Shift4 daily sales dashboard for Yum of India',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><TokenAlert />{children}<Analytics /><VisitorBeacon /></body>
    </html>
  )
}
