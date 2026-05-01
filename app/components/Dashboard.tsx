'use client'

import { useState } from 'react'
import TabNav, { Tab } from './TabNav'
import EndOfDay from './tabs/EndOfDay'
import SalesTrend from './tabs/SalesTrend'
import TopItems from './tabs/TopItems'

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('end-of-day')
  return (
    <div>
      <TabNav active={tab} onChange={setTab} />
      {/* Keep all tabs mounted — hiding with CSS preserves state across tab switches */}
      <div className={tab === 'end-of-day' ? '' : 'hidden'}><EndOfDay /></div>
      <div className={tab === 'sales-trend' ? '' : 'hidden'}><SalesTrend /></div>
      <div className={tab === 'top-items' ? '' : 'hidden'}><TopItems /></div>
    </div>
  )
}
