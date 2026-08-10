import { NextRequest, NextResponse } from 'next/server'
import { approvePost, deletePost } from '@/lib/blog'

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await approvePost(id)
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await deletePost(id)
  return NextResponse.json({ ok: true })
}
