import webpush from 'web-push'
import { prisma, DB_SCHEMA } from '@/lib/prisma'
import { Prisma } from '@/app/generated/prisma'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function enviarPushEmpleados(empleadoIds: string[], titulo: string, cuerpo: string, url = '/dashboard/mi-ruta') {
  let subs: any[] = []
  try {
    subs = await prisma.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" WHERE "empleadoId" = ANY(${empleadoIds}::text[])`
  } catch (e) {
    console.error('Push query error:', e)
    return
  }

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: titulo, body: cuerpo, url })
      )
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status
      const errMsg = e?.message ?? ''
      if (status === 410 || status === 404 || errMsg.includes('unexpected response')) {
        // Suscripción expirada o cancelada — limpiar DB
        await prisma.$executeRaw`
          DELETE FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcion" WHERE endpoint = ${sub.endpoint}`
          .catch(() => {})
      } else {
        console.log('Push error:', e)
      }
    }
  }
}

export async function enviarPushAdmin(empresaId: string, titulo: string, cuerpo: string, url = '/dashboard') {
  let subs: any[] = []
  try {
    subs = await prisma.$queryRaw<any[]>`
      SELECT * FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin" WHERE "empresaId" = ${empresaId}`
  } catch (e) {
    console.error('PushAdmin query error:', e)
    return
  }

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: titulo, body: cuerpo, url })
      )
    } catch (e: any) {
      const status = e?.statusCode ?? e?.status
      const errMsg = e?.message ?? ''
      if (status === 410 || status === 404 || errMsg.includes('unexpected response')) {
        await prisma.$executeRaw`
          DELETE FROM ${Prisma.raw(DB_SCHEMA)}."PushSuscripcionAdmin" WHERE endpoint = ${sub.endpoint}`
          .catch(() => {})
      } else {
        console.log('PushAdmin error:', e)
      }
    }
  }
}
