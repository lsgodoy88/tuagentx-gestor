import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { invalidatePattern } from '@/lib/cache'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ ok: false })
  const userId = (session.user as any).id
  await invalidatePattern(`g:v:${userId}:*`)
  return NextResponse.json({ ok: true })
}
