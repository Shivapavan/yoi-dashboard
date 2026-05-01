import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Yum of India — Daily Dashboard',
  description: 'Shift4 daily sales dashboard for Yum of India',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
