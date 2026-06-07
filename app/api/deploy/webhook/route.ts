import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { writeFileSync } from 'fs'

// El webhook escribe un trigger file — el deployer daemon lo ejecuta fuera del árbol Node
export async function POST(req: NextRequest) {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) return NextResponse.json({ error: 'Config error' }, { status: 500 })

  const signature = req.headers.get('x-deploy-signature')
  if (!signature) return NextResponse.json({ error: 'Sin firma' }, { status: 401 })

  const body = await req.text()
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')

  try {
    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expected)
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      console.error('[deploy] Firma inválida')
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  let payload: { commit?: string; buildKey?: string } = {}
  try { payload = JSON.parse(body) } catch { /* ok */ }

  const commit = payload.commit ?? 'desconocido'
  const buildKey = payload.buildKey ?? ''

  // Escribir trigger — el deployer daemon lo detecta y ejecuta el deploy
  // fuera del árbol de procesos Node (evita que pm2 delete mate el script)
  const trigger = JSON.stringify({ commit, buildKey, ts: Date.now() })
  writeFileSync('/tmp/gestor-deploy-trigger.json', trigger, 'utf8')

  console.log(`[deploy] Trigger escrito — commit ${commit}`)
  return NextResponse.json({ ok: true, commit, message: 'Deploy en cola' }, { status: 202 })
}
