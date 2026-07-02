import { kv } from '@vercel/kv'
import { put, list, del } from '@vercel/blob'
import type { ScraperConfig, ScrapeRun } from './types'

const KV_CONFIGS = 'scraper:configs'
const KV_RUNS   = 'scraper:runs'

// ─── Config management ────────────────────────────────────────────────────────

export async function getConfigs(): Promise<ScraperConfig[]> {
  return (await kv.get<ScraperConfig[]>(KV_CONFIGS)) ?? []
}

export async function saveConfig(config: ScraperConfig): Promise<void> {
  const configs = await getConfigs()
  const idx = configs.findIndex(c => c.id === config.id)
  if (idx >= 0) configs[idx] = config
  else configs.push(config)
  await kv.set(KV_CONFIGS, configs)
}

export async function deleteConfig(id: string): Promise<void> {
  const configs = await getConfigs()
  await kv.set(KV_CONFIGS, configs.filter(c => c.id !== id))
}

// ─── Run management ───────────────────────────────────────────────────────────

export async function getRuns(scraperId?: string): Promise<ScrapeRun[]> {
  const runs = (await kv.get<ScrapeRun[]>(KV_RUNS)) ?? []
  return scraperId ? runs.filter(r => r.scraperId === scraperId) : runs
}

export async function getActiveRun(scraperId: string): Promise<ScrapeRun | null> {
  const runs = await getRuns(scraperId)
  return runs.find(r => r.status === 'running') ?? null
}

export async function startRun(scraperId: string): Promise<ScrapeRun> {
  const run: ScrapeRun = {
    id: `run_${Date.now()}`,
    scraperId,
    status: 'running',
    startedAt: new Date().toISOString(),
  }
  const runs = await getRuns()
  // Keep only last 20 runs total
  const trimmed = runs.slice(-19)
  trimmed.push(run)
  await kv.set(KV_RUNS, trimmed)
  return run
}

export async function updateRun(runId: string, patch: Partial<ScrapeRun>): Promise<void> {
  const runs = await getRuns()
  const idx = runs.findIndex(r => r.id === runId)
  if (idx >= 0) {
    runs[idx] = { ...runs[idx], ...patch }
    await kv.set(KV_RUNS, runs)
  }
}

// ─── Result storage ───────────────────────────────────────────────────────────

export async function saveResult(scraperId: string, data: unknown): Promise<string> {
  const blob = await put(`scraper/${scraperId}/result.json`, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
  await kv.set(`scraper:result-url:${scraperId}`, blob.url)
  return blob.url
}

export async function getResultUrl(scraperId: string): Promise<string | null> {
  return kv.get<string>(`scraper:result-url:${scraperId}`)
}

export async function getResult<T>(scraperId: string): Promise<T | null> {
  const url = await getResultUrl(scraperId)
  if (!url) return null
  try {
    const res = await fetch(url, { next: { revalidate: 0 } })
    return res.ok ? (res.json() as Promise<T>) : null
  } catch {
    return null
  }
}

export async function deleteResult(scraperId: string): Promise<void> {
  const url = await getResultUrl(scraperId)
  if (url) {
    try {
      // List blobs and delete matching one
      const { blobs } = await list({ prefix: `scraper/${scraperId}/` })
      for (const blob of blobs) await del(blob.url)
    } catch { /* ignore */ }
    await kv.del(`scraper:result-url:${scraperId}`)
  }
}
