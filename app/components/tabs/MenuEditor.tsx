'use client'

import { useEffect, useRef, useState } from 'react'

interface Page {
  id: string
  blob_url: string
  position: number
}

const QR_URL = 'https://yoi-menu.vercel.app'

export default function MenuEditor() {
  const [pages, setPages] = useState<Page[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const replaceTargetId = useRef<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/menu', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`)
      setPages(d.pages || [])
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function flash(text: string, isError = false) {
    if (isError) setErr(text); else setMsg(text)
    setTimeout(() => { setMsg(null); setErr(null) }, 3500)
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const r = await fetch('/api/admin/menu', { method: 'POST', body: fd })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || `Upload failed: ${file.name}`)
      }
      flash(`Uploaded ${files.length} page${files.length > 1 ? 's' : ''}.`)
      await load()
    } catch (e: any) {
      flash(e.message, true)
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleReplace(id: string, file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/admin/menu/${id}`, { method: 'PUT', body: fd })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Replace failed')
      flash('Page replaced.')
      await load()
    } catch (e: any) {
      flash(e.message, true)
    } finally {
      setBusy(false)
      if (replaceInputRef.current) replaceInputRef.current.value = ''
      replaceTargetId.current = null
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this page?')) return
    setBusy(true)
    try {
      const r = await fetch(`/api/admin/menu/${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Delete failed')
      flash('Page deleted.')
      await load()
    } catch (e: any) {
      flash(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  async function persistOrder(newOrder: Page[]) {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/menu/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: newOrder.map(p => p.id) }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Reorder failed')
      flash('Order saved.')
    } catch (e: any) {
      flash(e.message, true)
      await load()
    } finally {
      setBusy(false)
    }
  }

  function onDragStart(id: string) { setDragId(id) }
  function onDragOver(e: React.DragEvent) { e.preventDefault() }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return
    const src = pages.findIndex(p => p.id === dragId)
    const dst = pages.findIndex(p => p.id === targetId)
    if (src < 0 || dst < 0) return
    const next = pages.slice()
    const [moved] = next.splice(src, 1)
    next.splice(dst, 0, moved)
    const renumbered = next.map((p, i) => ({ ...p, position: i + 1 }))
    setPages(renumbered)
    setDragId(null)
    persistOrder(renumbered)
  }

  function move(id: string, dir: -1 | 1) {
    const idx = pages.findIndex(p => p.id === id)
    if (idx < 0) return
    const dst = idx + dir
    if (dst < 0 || dst >= pages.length) return
    const next = pages.slice()
    ;[next[idx], next[dst]] = [next[dst], next[idx]]
    const renumbered = next.map((p, i) => ({ ...p, position: i + 1 }))
    setPages(renumbered)
    persistOrder(renumbered)
  }

  async function seedFromOldSite() {
    if (!confirm('Pull the original 7 PNGs from yoi-menu.vercel.app into Blob storage? Only works if menu is currently empty.')) return
    setBusy(true)
    try {
      const r = await fetch('/api/admin/menu/seed', { method: 'POST' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Seed failed')
      if (d.skipped) flash('Already seeded.')
      else flash(`Seeded ${d.seeded?.length || 0} pages.`)
      await load()
    } catch (e: any) {
      flash(e.message, true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-gray-800">Menu Editor</h2>
          <p className="text-sm text-gray-500 mt-1">
            Add, reorder, replace, or remove menu pages. Changes are live at{' '}
            <a href={QR_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{QR_URL}</a>
            {' '}— scan the same QR code, no reprint needed.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="px-4 py-2 bg-purple-700 text-white rounded text-sm font-medium hover:bg-purple-800 disabled:opacity-50"
          >+ Add page(s)</button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
          {pages.length === 0 && !loading && (
            <button
              onClick={seedFromOldSite}
              disabled={busy}
              className="px-3 py-2 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
            >Seed from current QR site</button>
          )}
        </div>
      </div>

      {msg && <div className="mb-3 p-2 bg-green-50 border border-green-200 text-green-800 rounded text-sm">{msg}</div>}
      {err && <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-800 rounded text-sm">{err}</div>}

      {loading ? (
        <div className="text-gray-500">Loading…</div>
      ) : pages.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center text-gray-500">
          No menu pages yet. Click <strong>+ Add page(s)</strong> or <strong>Seed from current QR site</strong>.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {pages.map((p, i) => (
            <div
              key={p.id}
              draggable
              onDragStart={() => onDragStart(p.id)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(p.id)}
              className={`relative border rounded-lg overflow-hidden bg-white shadow-sm cursor-move ${dragId === p.id ? 'opacity-50' : ''}`}
            >
              <div className="absolute top-1 left-1 z-10 bg-purple-700 text-white text-xs font-bold rounded px-2 py-0.5">
                {i + 1}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.blob_url} alt={`Page ${i + 1}`} className="w-full h-48 object-cover" />
              <div className="flex items-center justify-between p-2 border-t bg-gray-50 text-xs gap-1">
                <div className="flex gap-1">
                  <button onClick={() => move(p.id, -1)} disabled={busy || i === 0} className="px-2 py-1 border rounded disabled:opacity-40">↑</button>
                  <button onClick={() => move(p.id, 1)} disabled={busy || i === pages.length - 1} className="px-2 py-1 border rounded disabled:opacity-40">↓</button>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => { replaceTargetId.current = p.id; replaceInputRef.current?.click() }}
                    disabled={busy}
                    className="px-2 py-1 border rounded hover:bg-gray-100 disabled:opacity-40"
                  >Replace</button>
                  <button
                    onClick={() => handleDelete(p.id)}
                    disabled={busy}
                    className="px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40"
                  >Delete</button>
                </div>
              </div>
            </div>
          ))}
          <input
            ref={replaceInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              const id = replaceTargetId.current
              if (f && id) handleReplace(id, f)
            }}
          />
        </div>
      )}
    </div>
  )
}
