// POST /api/scraper/run  — trigger a scraper run
// GET  /api/scraper/run?id=xxx  — get run status + results

import { NextRequest, NextResponse, after } from 'next/server'
import { put } from '@vercel/blob'
import { getConfigs, getActiveRun, startRun, updateRun, saveResult, getResult, getRuns } from '@/lib/scraper/runner'
import { scrapeAccounts } from '@/lib/scraper/instagram'
import { buildIntel } from '@/lib/scraper/instagram-intel'
import { scrapeUrls } from '@/lib/scraper/http'
import type { HttpScraperConfig } from '@/lib/scraper/http'

export async function POST(req: NextRequest) {
  const { scraperId } = await req.json() as { scraperId: string }
  if (!scraperId) return NextResponse.json({ error: 'scraperId required' }, { status: 400 })

  const configs = await getConfigs()
  const config = configs.find(c => c.id === scraperId)
  if (!config) return NextResponse.json({ error: 'Scraper not found' }, { status: 404 })

  // Prevent duplicate runs
  const active = await getActiveRun(scraperId)
  if (active) return NextResponse.json({ run: active, status: 'already_running' })

  const run = await startRun(scraperId)

  // Run synchronously for HTTP scrapers (fast), async-style for Instagram (slow)
  if (config.type === 'http') {
    try {
      const httpConfigs: HttpScraperConfig[] = config.targets.map(url => ({
        url,
        fields: (config.options?.fields as HttpScraperConfig['fields']) ?? [],
      }))
      const results = await scrapeUrls(httpConfigs)
      await saveResult(scraperId, results)
      await updateRun(run.id, { status: 'done', finishedAt: new Date().toISOString(), itemsCount: results.length })
      return NextResponse.json({ run: { ...run, status: 'done', itemsCount: results.length } })
    } catch (e) {
      await updateRun(run.id, { status: 'failed', finishedAt: new Date().toISOString(), errorMessage: String(e) })
      return NextResponse.json({ run: { ...run, status: 'failed' } })
    }
  }

  // Instagram — returns immediately, runs in background via waitUntil if available
  const sessionId = process.env.IG_SESSION_ID
  if (!sessionId) {
    await updateRun(run.id, { status: 'failed', errorMessage: 'IG_SESSION_ID not configured' })
    return NextResponse.json({ error: 'IG_SESSION_ID env var not set' }, { status: 500 })
  }

  const postLimit = (config.options?.postLimit as number) ?? 30

  const doScrape = async () => {
    try {
      const profiles = await scrapeAccounts(config.targets, sessionId, postLimit)
      await saveResult(scraperId, profiles)

      // Also write to instagram-intel.json so the Instagram tab stays in sync
      const intel = buildIntel(profiles)
      await put('instagram-intel.json', JSON.stringify(intel), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      })

      await updateRun(run.id, {
        status: 'done',
        finishedAt: new Date().toISOString(),
        itemsCount: profiles.reduce((s, p) => s + p.posts.length, 0),
      })
    } catch (e) {
      await updateRun(run.id, { status: 'failed', finishedAt: new Date().toISOString(), errorMessage: String(e) })
    }
  }

  after(doScrape)

  return NextResponse.json({ run, status: 'started', message: 'Scraping started in background' })
}

export async function GET(req: NextRequest) {
  const scraperId = req.nextUrl.searchParams.get('id')
  if (!scraperId) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const runs = await getRuns(scraperId)
  const lastRun = runs.at(-1) ?? null

  if (!lastRun) return NextResponse.json({ status: 'idle', run: null })

  if (lastRun.status === 'done') {
    const data = await getResult(scraperId)
    return NextResponse.json({ status: 'done', run: lastRun, data })
  }

  return NextResponse.json({ status: lastRun.status, run: lastRun })
}
