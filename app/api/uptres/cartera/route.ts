import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto-uptres'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = session.user as any

  const empleado = await prisma.empleado.findUnique({ where: { id: user.id } })
  if (!empleado?.uptresEmail || !empleado?.uptresPassword) {
    return NextResponse.json({ error: 'Sin credenciales UpTres' }, { status: 400 })
  }

  const secret = process.env.UPTRES_SECRET!
  let password: string
  try {
    password = decrypt(empleado.uptresPassword, secret)
  } catch {
    return NextResponse.json({ error: 'Error al descifrar credenciales' }, { status: 500 })
  }

  // Login para obtener token
  let token: string
  try {
    const loginRes = await fetch('https://www.uptres.top/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: empleado.uptresEmail, password, version: '1.6.7.0', rememberMe: false }),
    })
    if (!loginRes.ok) return NextResponse.json({ error: 'Credenciales UpTres inválidas' }, { status: 401 })
    const loginData = await loginRes.json()
    token = loginData?.token || loginData?.access_token || loginData?.jwt || loginData?.accessToken || ''
    if (!token) return NextResponse.json({ error: 'No se obtuvo token de UpTres' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con UpTres' }, { status: 502 })
  }

  // Obtener cartera
  let carteraData: any
  try {
    const carteraRes = await fetch(
      'https://www.uptres.top/ordenventa/credito?desde=0&page=0&size=100&sort=numeroOrden&order=desc',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Token': token,
        },
      }
    )
    if (!carteraRes.ok) return NextResponse.json({ error: 'Error al obtener cartera de UpTres' }, { status: 502 })
    carteraData = await carteraRes.json()
  } catch {
    return NextResponse.json({ error: 'Error al obtener cartera' }, { status: 502 })
  }

  const items: any[] = Array.isArray(carteraData)
    ? carteraData
    : carteraData?.content ?? carteraData?.data ?? carteraData?.items ?? []

  return NextResponse.json({
    cartera: items.map((item: any) => ({
      clienteDoc: item.clienteDoc ?? item.nit ?? item.documento ?? '',
      clienteNombre: item.clienteNombre ?? item.nombre ?? item.razonSocial ?? '',
      vTotal: item.vTotal ?? item.total ?? item.valorTotal ?? 0,
      cantidad: item.cantidad ?? item.cuotas ?? 0,
      ciudad: item.ciudad ?? '',
    })),
  })
}
