'use client'

import { useState, useEffect } from 'react'
import TabNav, { Tab } from './TabNav'
import EndOfDay from './tabs/EndOfDay'
import SalesTrend from './tabs/SalesTrend'
import TopItems from './tabs/TopItems'
import ItemTrends from './tabs/ItemTrends'
import Catering from './tabs/Catering'
import Visitors from './tabs/Visitors'
import EmpShdt from './tabs/EmpShdt'
import Expenses from './tabs/Expenses'
import Containers from './tabs/Containers'
import Reviews from './tabs/Reviews'
import Activity from './tabs/Activity'
import MenuEditor from './tabs/MenuEditor'
import EventsSpace from './tabs/EventsSpace'

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>('end-of-day')
  const [isAdmin, setIsAdmin] = useState(false)
  const [canEditMenu, setCanEditMenu] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.user?.isAdmin) setIsAdmin(true)
        if (d.user?.canEditMenu) setCanEditMenu(true)
      })
      .catch(() => {})
  }, [])

  return (
    <div>
      <TabNav active={tab} onChange={setTab} isAdmin={isAdmin} canEditMenu={canEditMenu} />
      <div className={tab === 'end-of-day'   ? '' : 'hidden'}><EndOfDay /></div>
      <div className={tab === 'sales-trend'  ? '' : 'hidden'}><SalesTrend /></div>
      <div className={tab === 'top-items'    ? '' : 'hidden'}><TopItems /></div>
      <div className={tab === 'item-trends'  ? '' : 'hidden'}><ItemTrends /></div>
      <div className={tab === 'catering'     ? '' : 'hidden'}><Catering /></div>
      <div className={tab === 'events-space' ? '' : 'hidden'}><EventsSpace /></div>
      <div className={tab === 'containers'   ? '' : 'hidden'}><Containers /></div>
      <div className={tab === 'reviews'      ? '' : 'hidden'}><Reviews /></div>
      <div className={tab === 'visitors'     ? '' : 'hidden'}><Visitors /></div>
      <div className={tab === 'emp-shdt'     ? '' : 'hidden'}><EmpShdt /></div>
      <div className={tab === 'expenses'     ? '' : 'hidden'}><Expenses /></div>
      {canEditMenu && <div className={tab === 'menu-editor' ? '' : 'hidden'}><MenuEditor /></div>}
      {isAdmin && <div className={tab === 'activity' ? '' : 'hidden'}><Activity /></div>}
    </div>
  )
}
