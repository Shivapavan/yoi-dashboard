import type { HttpResult } from './types'

export interface FieldSelector {
  name: string
  selector: string       // CSS selector
  attr?: string          // attribute to grab (default: textContent)
  multiple?: boolean     // return array of all matches
}

export interface HttpScraperConfig {
  url: string
  fields: FieldSelector[]
  pagination?: {
    nextSelector: string   // CSS selector for "next page" link
    maxPages?: number
  }
}

// Minimal HTML parser — extracts values using regex-based CSS selectors
// (No DOM/browser needed — works in Vercel serverless)
function extractField(html: string, selector: string, attr?: string, multiple = false): string | string[] {
  // Convert simple selectors to regex patterns
  let pattern: RegExp

  // tag.class or tag#id or tag[attr=val] — build a loose pattern
  const tagMatch = selector.match(/^(\w+)/)
  const classMatch = selector.match(/\.([^.#[\s]+)/)
  const idMatch = selector.match(/#([^.#[\s]+)/)
  const attrMatch = selector.match(/\[([^\]]+)\]/)

  const tag = tagMatch?.[1] ?? '[a-z]+'
  const classFilter = classMatch ? `[^>]*class="[^"]*${classMatch[1]}[^"]*"` : '[^>]*'
  const idFilter = idMatch ? `[^>]*id="${idMatch[1]}"` : '[^>]*'
  const attrFilter = attrMatch ? `[^>]*${attrMatch[1]}[^>]*` : '[^>]*'

  const combined = `<${tag}${classFilter}${idFilter}${attrFilter}>(.*?)</${tag}>`
  pattern = new RegExp(combined, 'gsi')

  const matches: string[] = []
  let m: RegExpExecArray | null

  while ((m = pattern.exec(html)) !== null) {
    if (attr) {
      // Extract specific attribute from the opening tag
      const tagStr = m[0]
      const attrPattern = new RegExp(`${attr}=["']([^"']+)["']`, 'i')
      const attrVal = tagStr.match(attrPattern)?.[1] ?? ''
      if (attrVal) matches.push(attrVal)
    } else {
      // Strip inner tags, decode basic entities
      const text = m[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .trim()
      if (text) matches.push(text)
    }
    if (!multiple && matches.length === 1) break
  }

  return multiple ? matches : (matches[0] ?? '')
}

export async function scrapeUrl(config: HttpScraperConfig): Promise<HttpResult | null> {
  try {
    const res = await fetch(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YOI-Scraper/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return null

    const html = await res.text()
    const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i)
    const title = titleMatch?.[1]?.trim() ?? ''

    const fields: Record<string, string | string[]> = {}
    for (const fieldDef of config.fields) {
      fields[fieldDef.name] = extractField(html, fieldDef.selector, fieldDef.attr, fieldDef.multiple)
    }

    return { url: config.url, title, fields, scrapedAt: new Date().toISOString() }
  } catch {
    return null
  }
}

export async function scrapeUrls(configs: HttpScraperConfig[]): Promise<HttpResult[]> {
  const results: HttpResult[] = []
  for (const config of configs) {
    const result = await scrapeUrl(config)
    if (result) results.push(result)
    await new Promise(r => setTimeout(r, 500))
  }
  return results
}
