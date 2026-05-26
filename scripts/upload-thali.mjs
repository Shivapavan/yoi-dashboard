import { put } from '@vercel/blob'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN
if (!TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN missing')

const buf = await readFile('/tmp/yoi-thali-slide.png')
const path = `menu/${randomUUID()}.png`
const blob = await put(path, buf, {
  access: 'public',
  contentType: 'image/png',
  token: TOKEN,
})
console.log(JSON.stringify({ url: blob.url, path }))
