import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const raw = readFileSync(join(process.cwd(), 'public', 'version.json'), 'utf8')
    const info = JSON.parse(raw)
    return NextResponse.json(info, {
      headers: { 'Cache-Control': 'no-store' }
    })
  } catch {
    return NextResponse.json({ commit: 'unknown', version: '?', env: 'production' })
  }
}
