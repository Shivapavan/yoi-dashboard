'use client'

import { useEffect } from 'react'

// Fires once per session to record the visit
export default function VisitorBeacon() {
  useEffect(() => {
    // Only record once per browser session
    if (sessionStorage.getItem('yoi_visited')) return
    sessionStorage.setItem('yoi_visited', '1')
    fetch('/api/analytics/record', { method: 'POST' }).catch(() => {})
  }, [])
  return null
}
