/**
 * lib/bodega.ts
 * Helpers compartidos del módulo bodega.
 * Centraliza patrones repetitivos para evitar desincronización entre endpoints.
 */

import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { getEmpresaId, ROLES_ADMIN_BODEGA } from '@/lib/auth-helpers'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

// ─── R2 ──────────────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

/**
 * Sube un base64 a R2 y devuelve el key almacenado.
 * contentType: 'image/jpeg' | 'image/png'
 */
export async function subirR2(
  base64: string,
  key: string,
  contentType: string,
): Promise<string> {
  const data = base64.replace(/^data:[^;]+;base64,/, '')
  const buffer = Buffer.from(data, 'base64')
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }))
  return key
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface BodegaCtx {
  user: any
  empresaId: string
  empleadoId: string | null
}

/**
 * Valida sesión y rol bodega.
 * Devuelve { ctx } si OK o { error: NextResponse } si falla.
 */
export async function getBodegaCtx(
  req: NextRequest,
): Promise<{ ctx: BodegaCtx; error?: never } | { ctx?: never; error: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }
  const user = session.user as any
  if (!ROLES_ADMIN_BODEGA.includes(user.role)) {
    return { error: NextResponse.json({ error: 'Sin acceso' }, { status: 403 }) }
  }
  return {
    ctx: {
      user,
      empresaId: getEmpresaId(user),
      empleadoId: user.role !== 'empresa' ? (user.id ?? null) : null,
    },
  }
}

// ─── origenId → empresaId real ───────────────────────────────────────────────
// FIX 2026-06-20: OrdenDespacho ya NO se duplica por EmpresaVinculada.
// Antes: cada orden vinculada vivía como copia bajo empresaId del propietario
// de la vinculación (ej. Lumeli), marcada con origenVinculadaId.
// Ahora: una sola fila por orden, bajo el empresaId real de quien la generó
// en UpTres (ej. Leche). Para ver/operar bodega de una empresa vinculada,
// se resuelve su empresaClienteId y se consulta DIRECTO ese empresaId —
// sin filtro adicional de origenVinculadaId (ya no aplica).

/**
 * Resuelve el empresaId real a consultar/operar en OrdenDespacho según el
 * origenId elegido en el selector de bodega ('propia' o el id de una
 * EmpresaVinculada activa de la empresa logueada).
 */
export async function resolverEmpresaIdOrigen(
  prisma: any,
  empresaPropiaId: string,
  origenId: string
): Promise<string> {
  if (!origenId || origenId === 'propia') return empresaPropiaId
  const vinculada = await prisma.empresaVinculada.findFirst({
    where: { id: origenId, empresaId: empresaPropiaId, activa: true },
    select: { empresaClienteId: true },
  })
  // Si el id no es una vinculada válida del usuario, no se filtra por nada
  // ajeno — cae a la propia, evitando exponer datos de otra empresa.
  return vinculada?.empresaClienteId || empresaPropiaId
}

// ─── DespachoLog ─────────────────────────────────────────────────────────────

export type ModoDespacho = 'repartidor' | 'transportadora' | 'personal'

/** Infiere el modo de despacho a partir de los campos de la orden */
export function inferirModo(orden: {
  firmaEntrega?: string | null
  guiaTransporte?: string | null
  transportadora?: string | null
  repartidorId?: string | null
}): ModoDespacho {
  if (orden.firmaEntrega) return 'personal'
  if (orden.guiaTransporte || orden.transportadora) return 'transportadora'
  return 'repartidor'
}

/**
 * Inserta una entrada en DespachoLog — fire and forget.
 * Usa NOW() AT TIME ZONE 'UTC' para garantizar consistencia de timezone.
 * Nunca lanza excepción — si falla, loguea y sigue.
 */
export function registrarDespachoLog(orden: {
  empresaId: string
  origenVinculadaId?: string | null
  numeroFactura?: string | null
  numeroOrden?: string | null
  clienteNombre?: string | null
  firmaEntrega?: string | null
  guiaTransporte?: string | null
  transportadora?: string | null
  repartidorId?: string | null
}): void {
  const modo = inferirModo(orden)
  prisma.$executeRawUnsafe(
    `INSERT INTO ${DB_SCHEMA}."DespachoLog"
       (id, "empresaId", "origenVinculadaId", "numeroFactura", "clienteNombre",
        modo, "guiaTransporte", transportadora, "despachadoEl")
     VALUES
       (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7,
        (NOW() AT TIME ZONE 'UTC'))
     ON CONFLICT DO NOTHING`,
    orden.empresaId,
    orden.origenVinculadaId ?? null,
    orden.numeroFactura ?? orden.numeroOrden ?? '',
    orden.clienteNombre ?? '',
    modo,
    orden.guiaTransporte ?? null,
    orden.transportadora ?? null,
  ).catch((err: unknown) => {
    console.error('[DespachoLog] Error al registrar:', err)
  })
}

/** Estados que significan que una orden ya fue despachada */
export const ESTADOS_DESPACHADOS = ['en_entrega', 'en_transito', 'entregado'] as const
export type EstadoDespachado = typeof ESTADOS_DESPACHADOS[number]

export function esDespachado(estado: string): estado is EstadoDespachado {
  return ESTADOS_DESPACHADOS.includes(estado as EstadoDespachado)
}
