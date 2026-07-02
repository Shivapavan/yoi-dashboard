import { put, head } from '@vercel/blob'
import type { ScraperConfig, ScrapeRun } from './types'

const STATE_BLOB = 'scraper/state.json'

interface ScraperState {
  configs: ScraperConfig[]
  runs: ScrapeRun[]
  resultUrls: Record<string, string>
}

async function readState(): Promise<ScraperState> {
  try {
    // head() checks if blob exists without fetching full content
    const info = await head(`https://blob.vercel-storage.com/${STATE_BLOB}`).catch(() => null)
    if (!info) return { configs: [], runs: [], resultUrls: {} }

    const res = await fetch(info.url, { next: { revalidate: 0 } })
    if (!res.ok) return { configs: [], runs: [], resultUrls: {} }
    return await res.json() as ScraperState
  } catch {
    return { configs: [], runs: [], resultUrls: {} }
  }
}

async function writeState(state: ScraperState): Promise<void> {
  await put(STATE_BLOB, JSON.stringify(state), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}

// ─── Config management ────────────────────────────────────────────────────────

export async function getConfigs(): Promise<ScraperConfig[]> {
  return (await readState()).configs
}

export async function saveConfig(config: ScraperConfig): Promise<void> {
  const state = await readState()
  const idx = state.configs.findIndex(c => c.id === config.id)
  if (idx >= 0) state.configs[idx] = config
  else state.configs.push(config)
  await writeState(state)
}

export async function deleteConfig(id: string): Promise<void> {
  const state = await readState()
  state.configs = state.configs.filter(c => c.id !== id)
  delete state.resultUrls[id]
  await writeState(state)
}

// ─── Run management ───────────────────────────────────────────────────────────

export async function getRuns(scraperId?: string): Promise<ScrapeRun[]> {
  const runs = (await readState()).runs
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
  const state = await readState()
  // Keep only last 20 runs total
  state.runs = state.runs.slice(-19)
  state.runs.push(run)
  await writeState(state)
  return run
}

export async function updateRun(runId: string, patch: Partial<ScrapeRun>): Promise<void> {
  const state = await readState()
  const idx = state.runs.findIndex(r => r.id === runId)
  if (idx >= 0) {
    state.runs[idx] = { ...state.runs[idx], ...patch }
    await writeState(state)
  }
}

// ─── Result storage ───────────────────────────────────────────────────────────

export async function saveResult(scraperId: string, data: unknown): Promise<string> {
  const blob = await put(`scraper/${scraperId}/result.json`, JSON.stringify(data), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
  const state = await readState()
  state.resultUrls[scraperId] = blob.url
  await writeState(state)
  return blob.url
}

export async function getResultUrl(scraperId: string): Promise<string | null> {
  const state = await readState()
  return state.resultUrls[scraperId] ?? null
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
  const state = await readState()
  delete state.resultUrls[scraperId]
  await writeState(state)
}
