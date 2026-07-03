// Google Custom Search API

export interface SearchResult {
  query: string
  yoiPosition: number | null
  items: SearchItem[]
  scrapedAt: string
}

export interface SearchItem {
  position: number
  title: string
  url: string
  displayUrl: string
  snippet: string
  isYoi: boolean
}

type GSearchItem = { title: string; link: string; displayLink?: string; snippet?: string }

const YOI_MARKERS = ['yumofindiamckinney', 'yumofindia', 'yum of india', 'yum-of-india']

function isYoiResult(url: string, title: string): boolean {
  const s = (url + title).toLowerCase()
  return YOI_MARKERS.some(m => s.includes(m))
}

export async function searchGoogle(
  query: string,
  apiKey: string,
  cx: string
): Promise<SearchResult> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=10`
  const res = await fetch(url)
  const json = await res.json() as { items?: GSearchItem[] }

  const items: SearchItem[] = (json.items ?? []).map((item, idx) => ({
    position: idx + 1,
    title: item.title,
    url: item.link,
    displayUrl: item.displayLink ?? item.link,
    snippet: item.snippet ?? '',
    isYoi: isYoiResult(item.link, item.title),
  }))

  return {
    query,
    yoiPosition: items.find(i => i.isYoi)?.position ?? null,
    items,
    scrapedAt: new Date().toISOString(),
  }
}

export async function searchMultipleQueries(
  queries: string[],
  apiKey: string,
  cx: string,
  onProgress?: (done: number, total: number) => void
): Promise<SearchResult[]> {
  const results: SearchResult[] = []

  for (let i = 0; i < queries.length; i++) {
    try {
      results.push(await searchGoogle(queries[i], apiKey, cx))
    } catch { /* skip */ }
    onProgress?.(i + 1, queries.length)
    if (i < queries.length - 1) await new Promise(r => setTimeout(r, 1200))
  }

  return results
}
