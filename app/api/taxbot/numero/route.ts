import { NextResponse } from 'next/server'

const MASTER_URL = 'http://localhost:3020'

export async function GET() {
  try {
    const res = await fetch(`${MASTER_URL}/api/taxbot/numero`, { cache: 'no-store' })
    const data = await res.json()
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ numero: null })
  }
}
