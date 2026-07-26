import { prisma } from './prisma'

const DB_ENV = process.env.DATABASE_URL?.includes('gestor_staging') ? 'staging' : 'prod'

const REDACT = ['password', 'token', 'secret', 'apiSecret', 'apiKey', 'firmaBase64', 'fotoBase64']

function redactBody(body: any): any {
  if (!body || typeof body !== 'object') return body
  const result: any = Array.isArray(body) ? [] : {}
  for (const key of Object.keys(body)) {
    if (REDACT.some(r => key.toLowerCase().includes(r.toLowerCase()))) {
      result[key] = '[REDACTED]'
    } else if (typeof body[key] === 'object' && body[key] !== null) {
      result[key] = redactBody(body[key])
    } else {
      result[key] = body[key]
    }
  }
  return result
}

// Función original — preservada para compatibilidad
export async function audit(
  accion: string,
  usuario?: string,
  detalle?: string,
  empleadoId?: string,
  empresaId?: string
) {
  try {
    await (prisma as any).auditLog.create({
      data: { accion, usuario, detalle, empleadoId, empresaId }
    })
  } catch(e) {
    console.log('Audit error:', e)
  }
}

// Nueva función para audit de API requests
export async function auditLog(params: {
  method: string
  path: string
  userId?: string | null
  userEmail?: string | null
  userRole?: string | null
  empresaId?: string | null
  ip?: string | null
  statusCode?: number | null
  body?: any
  duracionMs?: number | null
}) {
  try {
    await (prisma as any).auditLog.create({
      data: {
        env: DB_ENV,
        method: params.method,
        path: params.path,
        empleadoId: params.userId || null,
        userEmail: params.userEmail || null,
        userRole: params.userRole || null,
        empresaId: params.empresaId || null,
        ip: params.ip || null,
        statusCode: params.statusCode || null,
        bodyResumen: params.body ? redactBody(params.body) : null,
        duracionMs: params.duracionMs || null,
        accion: `${params.method} ${params.path}`,
      }
    })
  } catch (e) {
    console.error('[auditLog] error:', e)
  }
}
