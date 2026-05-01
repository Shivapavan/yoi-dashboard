export interface Shift4Dispute {
  id: string
  created: number
  updated: number
  amount: number
  currency: string
  status: string
  reason: string
  charge: string
  acceptedAsLost: boolean
  evidence?: { customerName?: string; customerEmail?: string }
  card?: { last4: string; brand: string }
  merchantDetails?: { employeeName?: string }
}

export interface Shift4Charge {
  id: string
  created: number
  amount: number
  currency: string
  captured: boolean
  refunded: boolean
  status: string
  paymentMethod?: string
  tip?: number
  tax?: number
  discount?: number
  card?: { last4: string; brand: string; type: string }
  metadata?: Record<string, string>
  merchantDetails?: { employeeName?: string }
}

export interface EndOfDayMetrics {
  grossSales: number
  netSales: number
  taxes: number
  voids: number
  cashPayments: number
  creditCardPayments: number
  discounts: number
  openTickets: number
}

export interface SalesTrendDay {
  date: string
  grossSales: number
  netSales: number
  transactionCount: number
}

export interface TopItem {
  name: string
  count: number
  revenue: number
}
