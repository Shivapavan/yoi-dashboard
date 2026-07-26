import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from '../../node_modules/xlsx/xlsx.mjs'
import { parseRestcallWorkbook } from './parse-analytics.mjs'

function buildSampleWorkbook() {
  const wb = XLSX.utils.book_new()

  const summary = [
    ['Yum of India Analytics'],
    ['Today | Jul 25, 2026, 9:00 AM CDT to Jul 25, 2026, 4:58 PM CDT'],
    ['Generated Jul 25, 2026, 4:58 PM CDT | America/Chicago'],
    [],
    ['Metric', 'Value'],
    ['Selected range', 'Today'],
    ['Revenue', 57.16],
    ['Orders', 3],
    ['Average ticket', 19.05333333333333],
    ['Cancellation rate', 0],
    ['Counted sales', 3],
    ['All order outcomes', 3],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary')

  const comparison = [
    ['Metric', 'Current period', 'Previous period', 'Change'],
    ['Revenue', 57.16, 318.02, -0.8202628765486448],
    ['Orders', 3, 12, -0.75],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(comparison), 'Comparison')

  const financials = [
    ['Metric', 'Value', 'Definition'],
    ['Revenue', 57.16, 'Exact total across counted orders'],
    ['Gross item sales', 52.81, 'Explicit money-breakdown orders only'],
    ['Taxes', 4.35, 'Known tax buckets'],
    ['Covered orders', 3, '3 counted orders'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(financials), 'Financials')

  const channels = [
    ['Dimension', 'Value', 'Orders', 'Revenue', 'Order share', 'Revenue share'],
    ['Source', 'Walk-in iPad', 3, 57.16, 1, 1],
    ['Fulfillment', 'Dine-in', 2, 55.01, 0.6666666666666666, 0.9623862841147657],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(channels), 'Channels')

  const outcomes = [
    ['Status', 'Orders', 'Share of outcomes'],
    ['Received', 0, 0],
    ['Ready', 1, 0.3333333333333333],
    ['Picked up', 2, 0.6666666666666666],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(outcomes), 'Outcomes')

  const dailyRevenue = [
    ['Business date', 'Revenue', 'Orders', 'Average ticket'],
    [new Date(2026, 6, 25), 57.16, 3, 19.05333333333333],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dailyRevenue), 'Daily Revenue')

  const hourlyVolume = [
    ['Restaurant-local hour', 'Orders', 'Revenue', 'Share of orders'],
    ['10 AM', 1, 2.15, 0.3333333333333333],
    ['3 PM', 1, 37.7, 0.3333333333333333],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hourlyVolume), 'Hourly Volume')

  const categories = [
    ['Category', 'Quantity sold', 'Item revenue', 'Revenue share'],
    ['Tandoor & Kebab', 1, 16.99, 0.3217193713311872],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(categories), 'Categories')

  const topSellers = [
    ['Rank', 'Menu item', 'Quantity sold', 'Revenue', 'Average revenue per unit'],
    [1, 'Masala Chai Large', 3, 5.97, 1.99],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(topSellers), 'Top Sellers')

  const aiSummary = [
    ['Call intelligence', 'Value'],
    ['Customer calls', 0],
    ['Spam / robocalls', 0],
    ['Calls with issues', 0],
    ['Issue rate', 0],
    ['Major or critical', 0],
    [],
    ['Call outcomes', 'Count'],
    [],
    ['Call issue categories', 'Count'],
    [],
    ['Message intelligence', 'Value'],
    ['AI conversations', 0],
    ['Direct text orders', 0],
    ['Attributed revenue', 0],
    ['Conversion rate', 0],
    ['Median response (seconds)', 'Not available'],
  ]
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aiSummary), 'AI Summary')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

test('parses summary metrics', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.summary.revenue, 57.16)
  assert.equal(result.summary.orders, 3)
  assert.equal(result.summary.selectedRange, 'Today')
})

test('parses financials', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.financials.grossItemSales, 52.81)
  assert.equal(result.financials.coveredOrders, 3)
})

test('parses channels as an array of rows', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.channels.length, 2)
  assert.deepEqual(result.channels[0], { dimension: 'Source', value: 'Walk-in iPad', orders: 3, revenue: 57.16, orderShare: 1, revenueShare: 1 })
})

test('parses top sellers', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.deepEqual(result.topSellers[0], { rank: 1, item: 'Masala Chai Large', qtySold: 3, revenue: 5.97, avgRevenuePerUnit: 1.99 })
})

test('parses AI summary scalars across stacked sections, ignoring empty count tables', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.aiSummary.customerCalls, 0)
  assert.equal(result.aiSummary.aiConversations, 0)
  assert.equal(result.aiSummary.medianResponseSeconds, 'Not available')
  assert.deepEqual(result.aiSummary.breakdowns['Call outcomes'], [])
})

test('parses comparison deltas keyed by metric', () => {
  const result = parseRestcallWorkbook(buildSampleWorkbook())
  assert.equal(result.comparison['Revenue'].previous, 318.02)
})
