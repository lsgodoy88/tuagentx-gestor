import { PrismaClient } from '../app/generated/prisma'
import { aplicarMiddlewareEmpresa } from './prisma-middleware'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function crearPrisma() {
  const client = new PrismaClient()
  aplicarMiddlewareEmpresa(client)
  return client
}

export const prisma = globalForPrisma.prisma || crearPrisma()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
