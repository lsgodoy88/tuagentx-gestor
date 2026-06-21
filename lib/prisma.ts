import { PrismaClient } from '../app/generated/prisma'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// FIX 2026-06-20: schema real del entorno, derivado de DATABASE_URL en vez de
// hardcodear 'gestor' en queries SQL crudas. En staging DATABASE_URL apunta a
// gestor_staging — el hardcode causaba que $queryRawUnsafe leyera producción
// mientras Prisma normal leía staging, devolviendo resultados vacíos/mezclados.
// Única fuente de verdad: DATABASE_URL. Nunca declarar el schema por separado.
export const DB_SCHEMA = (() => {
  const match = process.env.DATABASE_URL?.match(/schema=([^&]+)/)
  return match?.[1] || 'gestor'
})()
