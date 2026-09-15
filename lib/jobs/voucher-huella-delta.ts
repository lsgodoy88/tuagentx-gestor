/**
 * voucher-huella-delta.ts — match por niveles + normalización
 *
 * Nivel 1 — 5 campos (ref+valor+fecha+banco+titular) → 🚨 certeza alta
 * Nivel 2 — 4 campos (ref+valor+fecha+banco, sin titular) → ⚠️ sospechoso
 * Nivel 3 — 3 campos (ref+valor+fecha) → 🔎 revisar
 *
 * Normalización antes del match: sin tildes, uppercase, espacios colapsados
 * alertada=true al procesar — no se reprocesa
 */
import { prisma } from '@/lib/prisma'

const schema = process.env.DB_SCHEMA || 'gestor'

// Normaliza texto para comparación: sin tildes, uppercase, espacios simples
function norm(s: any): string {
  if (s === null || s === undefined) return ''
  const str = String(s)
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
}

// Agrupa huellas por clave normalizada
function agrupar(huellas: any[], campos: string[]): Map<string, any[]> {
  const mapa = new Map<string, any[]>()
  for (const h of huellas) {
    const clave = campos.map(c => norm(h[c])).join('|')
    if (!clave.replace(/\|/g, '')) continue
    const grupo = mapa.get(clave) ?? []
    grupo.push(h)
    mapa.set(clave, grupo)
  }
  return mapa
}

export async function runVoucherHuellaDelta() {
  // Traer todas las huellas no alertadas con al menos ref+valor+fecha
  const huellas: any[] = await (prisma as any).$queryRawUnsafe(`
    SELECT id, referencia, valor, fecha, banco, titular,
           pago_id, empresa_id, vendedor_nombre, created_at
    FROM ${schema}."VoucherHuella"
    WHERE
      referencia IS NOT NULL AND referencia <> '' AND
      valor      IS NOT NULL AND
      fecha      IS NOT NULL AND fecha <> '' AND
      alertada   = false
  `)

  if (!huellas.length) {
    console.log('[voucher-delta] sin huellas pendientes')
    return { duplicados: 0 }
  }

  // Agrupar por nivel — de más estricto a menos
  const nivel1 = agrupar(huellas, ['referencia', 'valor', 'fecha', 'banco', 'titular'])
  const nivel2 = agrupar(huellas, ['referencia', 'valor', 'fecha', 'banco'])
  const nivel3 = agrupar(huellas, ['referencia', 'valor', 'fecha'])

  // IDs ya procesados — evitar que un duplicado aparezca en múltiples niveles
  const procesados = new Set<string>()

  // Coleccionar todos los grupos duplicados con su nivel
  const grupos: Array<{ huellas: any[], nivel: 1 | 2 | 3 }> = []

  for (const [, grupo] of nivel1) {
    if (grupo.length < 2) continue
    const ids = grupo.map((h: any) => h.id)
    if (ids.some((id: string) => procesados.has(id))) continue
    ids.forEach((id: string) => procesados.add(id))
    grupos.push({ huellas: grupo, nivel: 1 })
  }
  for (const [, grupo] of nivel2) {
    if (grupo.length < 2) continue
    const ids = grupo.map((h: any) => h.id)
    if (ids.some((id: string) => procesados.has(id))) continue
    ids.forEach((id: string) => procesados.add(id))
    grupos.push({ huellas: grupo, nivel: 2 })
  }
  for (const [, grupo] of nivel3) {
    if (grupo.length < 2) continue
    const ids = grupo.map((h: any) => h.id)
    if (ids.some((id: string) => procesados.has(id))) continue
    ids.forEach((id: string) => procesados.add(id))
    grupos.push({ huellas: grupo, nivel: 3 })
  }

  if (!grupos.length) {
    console.log('[voucher-delta] sin duplicados')
    return { duplicados: 0 }
  }

  // Lookup empresas y recibos
  const todasEmpresaIds = [...new Set(grupos.flatMap(g => g.huellas.map((h: any) => h.empresa_id as string)))]
  const todosPagoIds    = [...new Set(grupos.flatMap(g => g.huellas.map((h: any) => h.pago_id as string)))]

  const empresas: any[] = todasEmpresaIds.length > 0
    ? await (prisma as any).$queryRawUnsafe('SELECT id, nombre FROM ' + schema + '."Empresa" WHERE id = ANY($1::text[])', todasEmpresaIds)
    : []
  const recibos: any[] = todosPagoIds.length > 0
    ? await (prisma as any).$queryRawUnsafe('SELECT id, "numeroRecibo" FROM ' + schema + '."PagoCartera" WHERE id = ANY($1::text[])', todosPagoIds)
    : []

  const empresaNombres = new Map(empresas.map((e: any) => [e.id, e.nombre]))
  const reciboMap      = new Map(recibos.map((r: any) => [r.id, r.numeroRecibo]))

  let alertados = 0

  for (const { huellas: grupo, nivel } of grupos) {
    const tipo = new Set(grupo.map((h: any) => h.empresa_id)).size > 1 ? 'cross-empresa' : 'duplicado-interno'
    const huellaIds = grupo.map((h: any) => h.id)
    const ref = grupo[0]

    for (let i = 0; i < grupo.length; i++) {
      const h = grupo[i]
      const otros = grupo.filter((_: any, j: number) => j !== i)

      const alerta = JSON.stringify({
        tipo,
        nivel,
        referencia: ref.referencia,
        valor:      Number(ref.valor),
        fecha:      ref.fecha,
        banco:      ref.banco ?? null,
        titular:    ref.titular ?? null,
        primerUso:  ref.created_at,
        otrosRecibos: otros.map((o: any) => ({
          pagoId:       o.pago_id,
          numeroRecibo: reciboMap.get(o.pago_id) ?? null,
          empresaId:    o.empresa_id,
          empresa:      empresaNombres.get(o.empresa_id) ?? o.empresa_id,
        })),
      })

      try {
        await (prisma as any).pagoCartera.update({
          where: { id: h.pago_id },
          data:  { alertaVoucher: alerta },
        })
        alertados++
      } catch (e: any) {
        if (e?.code !== 'P2025') throw e
        // pago_id no existe — huella huérfana, omitir
      }
    }

    await (prisma as any).$executeRawUnsafe(
      'UPDATE ' + schema + '."VoucherHuella" SET alertada = true WHERE id = ANY($1::text[])',
      huellaIds
    )
  }

  console.log('[voucher-delta] ' + grupos.length + ' grupos | ' + alertados + ' pagos alertados')
  return { duplicados: grupos.length, alertados }
}
