import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { exec } from 'child_process'

// Responde 202 inmediato — el deploy corre en background
export async function POST(req: NextRequest) {
  // 1. Verificar firma HMAC
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) {
    console.error('[deploy] WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Config error' }, { status: 500 })
  }

  const signature = req.headers.get('x-deploy-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Sin firma' }, { status: 401 })
  }

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

  // 2. Parsear payload
  let payload: { commit?: string; buildKey?: string } = {}
  try { payload = JSON.parse(body) } catch { /* payload vacío ok */ }

  const commit = payload.commit ?? 'desconocido'
  const buildKey = payload.buildKey ?? ''

  console.log(`[deploy] Webhook recibido — commit ${commit}`)

  // 3. Disparar deploy en background y responder 202 inmediato
  const script = `/home/luis/deploy-webhook.sh "${commit}" "${buildKey}"`
  exec(script, { env: { ...process.env, HOME: '/home/luis' } }, (err, stdout, stderr) => {
    if (err) {
      console.error('[deploy] Script falló:', err.message)
      console.error('[deploy] stderr:', stderr)
    } else {
      console.log('[deploy] Script OK:', stdout.trim())
    }
  })

  return NextResponse.json({ ok: true, commit, message: 'Deploy iniciado' }, { status: 202 })
}
