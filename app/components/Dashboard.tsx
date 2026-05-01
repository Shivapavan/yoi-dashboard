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
      {tab === 'end-of-day' && <EndOfDay />}
      {tab === 'sales-trend' && <SalesTrend />}
      {tab === 'top-items' && <TopItems />}
    </div>
  )
}
