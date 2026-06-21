import webpush from 'web-push'
import { prisma, DB_SCHEMA } from './prisma'
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
    } catch (e) {
      console.log('Push error:', e)
    }
  }
}
