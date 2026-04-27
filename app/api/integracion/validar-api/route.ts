import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'empresa') return NextResponse.json({ error: 'Solo empresa' }, { status: 403 })

  const { url, token, endpoints: epOverrides } = await req.json()
  if (!url) return NextResponse.json({ error: 'URL requerida' }, { status: 400 })

  const baseUrl = url.replace(/\/$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const paths = {
    clientes:  { method: epOverrides?.clientes?.method  ?? 'GET',  path: epOverrides?.clientes?.path  ?? '/clientes' },
    cartera:   { method: epOverrides?.cartera?.method   ?? 'GET',  path: epOverrides?.cartera?.path   ?? '/cartera' },
    empleados: { method: epOverrides?.empleados?.method ?? 'GET',  path: epOverrides?.empleados?.path ?? '/empleados' },
    recaudos:  { method: epOverrides?.recaudos?.method  ?? 'POST', path: epOverrides?.recaudos?.path  ?? '/recaudos' },
  }

  const probar = async (method: string, path: string) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(`${baseUrl}${path}`, { method, headers, signal: controller.signal })
      clearTimeout(timeout)
      return { ok: res.ok, status: res.status }
    } catch (e: any) {
      return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timeout' : e.message }
    }
  }

  const [clientes, cartera, empleados, recaudos] = await Promise.all([
    probar(paths.clientes.method, paths.clientes.path),
    probar(paths.cartera.method, paths.cartera.path),
    probar(paths.empleados.method, paths.empleados.path),
    probar(paths.recaudos.method, paths.recaudos.path),
  ])

  const ok = clientes.ok || cartera.ok || empleados.ok || recaudos.ok
  return NextResponse.json({ ok, endpoints: { clientes, cartera, empleados, recaudos } })
}
