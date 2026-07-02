// GET  /api/scraper           — list all configs + their last run status
// POST /api/scraper           — create or update a scraper config
// DELETE /api/scraper?id=xxx  — delete a config and its results

import { NextRequest, NextResponse } from 'next/server'
import { getConfigs, saveConfig, deleteConfig, getRuns, getResultUrl } from '@/lib/scraper/runner'
import type { ScraperConfig } from '@/lib/scraper/types'

export async function GET() {
  const [configs, runs] = await Promise.all([getConfigs(), getRuns()])

  const enriched = await Promise.all(configs.map(async c => {
    const lastRun = runs.filter(r => r.scraperId === c.id).at(-1) ?? null
    const resultUrl = await getResultUrl(c.id)
    return { ...c, lastRun, hasResult: !!resultUrl }
  }))

  return NextResponse.json({ scrapers: enriched })
}

export async function POST(req: NextRequest) {
  const body = await req.json() as Partial<ScraperConfig>
  if (!body.name || !body.type || !body.targets?.length) {
    return NextResponse.json({ error: 'name, type, and targets are required' }, { status: 400 })
  }

  const config: ScraperConfig = {
    id: body.id ?? `scraper_${Date.now()}`,
    name: body.name,
    type: body.type,
    targets: body.targets,
    schedule: body.schedule ?? 'manual',
    options: body.options ?? {},
  }

  await saveConfig(config)
  return NextResponse.json({ scraper: config })
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await deleteConfig(id)
  return NextResponse.json({ ok: true })
}
