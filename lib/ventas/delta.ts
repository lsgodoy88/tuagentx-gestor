/**
 * lib/ventas/delta.ts
 * Responsabilidad: sync incremental de listas de clientes y proveedores
 * Llamado por lib/jobs/sync-delta.ts (orquestador)
 */
import { prisma } from '@/lib/shared/infra/prisma'
import { type UpTresCursor } from '@/lib/integracion/adapters/uptres'
import { type DeltaCtx, type DeltaResult, emptyResult } from '@/lib/shared/utils/delta-ctx'

export async function deltaVentas(ctx: DeltaCtx): Promise<Partial<DeltaResult>> {
  const { adapter, destino, empresa } = ctx
  const result = emptyResult()
  const _t = (k: string, s: number) => { result.timings[k] = Date.now() - s }
  let _s: number

  // ─── Listas de clientes ──────────────────────────────────────────────────────
  try {
    const cursorListas = empresa?.sync_cursor_listas as UpTresCursor | null ?? null
    const desdeListas = new Date('2020-01-01')
    _s = Date.now()
    const { data: listasExt, ultimoCursor: nuevoCursorListas } =
      await adapter.fetchListasClientesConCursor(cursorListas, desdeListas)
    _t('fetchListas', _s)

    if (listasExt.length > 0) {
      for (const lista of listasExt) {
        let listaLocal = await (prisma as any).listaClientes.findUnique({ where: { api_id: lista.apiId } })
        if (!listaLocal) {
          const huerfana = await (prisma as any).listaClientes.findFirst({
            where: { empresaId: destino, nombre: lista.nombre, api_id: null },
          })
          if (huerfana) {
            listaLocal = await (prisma as any).listaClientes.update({
              where: { id: huerfana.id },
              data: { api_id: lista.apiId, name_us: lista.nameUs },
            })
          } else {
            listaLocal = await (prisma as any).listaClientes.create({
              data: { api_id: lista.apiId, nombre: lista.nombre, name_us: lista.nameUs, empresaId: destino },
            })
          }
        } else {
          listaLocal = await (prisma as any).listaClientes.update({
            where: { id: listaLocal.id },
            data: { nombre: lista.nombre, name_us: lista.nameUs },
          })
        }

        if (lista.clienteApiIds.length > 0) {
          const clientesEnLista = await (prisma as any).cliente.findMany({
            where: { empresaId: destino, apiId: { in: lista.clienteApiIds } },
            select: { id: true },
          })
          const clienteIdsEnLista: string[] = clientesEnLista.map((c: any) => c.id)

          if (clienteIdsEnLista.length > 0) {
            await (prisma as any).clienteLista.createMany({
              data: clienteIdsEnLista.map((clienteId: string) => ({ clienteId, listaId: listaLocal.id })),
              skipDuplicates: true,
            })
            await (prisma as any).clienteLista.deleteMany({
              where: { listaId: listaLocal.id, clienteId: { notIn: clienteIdsEnLista } },
            })
          }

          await (prisma as any).cliente.updateMany({
            where: { empresaId: destino, apiId: { in: lista.clienteApiIds } },
            data: { listaId: listaLocal.id },
          })
          result.listasActualizadas++
        }
      }

      if (nuevoCursorListas) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_listas: nuevoCursorListas } })
      }
    }
  } catch (err: any) {
    console.error('[delta/ventas] listas error:', err.message)
    result.erroresParciales.push('listas: ' + err.message)
  }

  // ─── Proveedores ─────────────────────────────────────────────────────────────
  try {
    const cursorProveedores = empresa?.sync_cursor_proveedores as UpTresCursor | null ?? null
    const desdeProveedores = new Date('2020-01-01')
    _s = Date.now()
    const { data: proveedoresExt, ultimoCursor: nuevoCursorProveedores } =
      await adapter.fetchProveedoresConCursor(cursorProveedores, desdeProveedores)
    _t('fetchProveedores', _s)

    if (proveedoresExt.length > 0) {
      for (const p of proveedoresExt) {
        await (prisma as any).proveedor.upsert({
          where: { api_id: p.apiId },
          create: {
            api_id: p.apiId, empresaId: destino,
            firstName: p.firstName, lastName: p.lastName,
            document: p.document, documentType: p.documentType,
            verificationDigit: p.verificationDigit,
            email: p.email, phone: p.phone, cityId: p.cityId,
            address: p.address, neighborhood: p.neighborhood,
            note: p.note, condition: true,
            updatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
          },
          update: {
            firstName: p.firstName, lastName: p.lastName,
            document: p.document, documentType: p.documentType,
            verificationDigit: p.verificationDigit,
            email: p.email, phone: p.phone, cityId: p.cityId,
            address: p.address, neighborhood: p.neighborhood,
            note: p.note, updatedAt: p.updatedAt ? new Date(p.updatedAt) : null,
          },
        })
        result.proveedoresActualizados++
      }
      if (nuevoCursorProveedores) {
        await prisma.empresa.update({ where: { id: destino }, data: { sync_cursor_proveedores: nuevoCursorProveedores } })
      }
    }
  } catch (err: any) {
    console.error('[delta/ventas] proveedores error:', err.message)
    result.erroresParciales.push('proveedores: ' + err.message)
  }

  return result
}
