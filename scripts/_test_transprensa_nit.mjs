// Script temporal para verificar match NIT en Transprensa
import { createRequire } from 'module'
const require = createRequire(import.meta.url)

// Cargar env
import { config } from 'dotenv'
config({ path: '/srv/gestor-staging/.env.local' })

const { PrismaClient } = require('/srv/gestor-staging/app/generated/prisma/index.js')
const prisma = new PrismaClient()
const BASE_URL = 'https://transprensa.colombiasoftware.net/index.php'

// Leer config de integracion
const intg = await prisma.integracion.findFirst({
  where: { tipo: 'transprensa', activa: true },
  select: { config: true, empresaId: true }
})
const cfg = intg.config

// Decrypt manual vía openssl (evitar import de TS)
import { execSync } from 'child_process'
function decrypt(encrypted, secret) {
  try {
    const buf = Buffer.from(encrypted, 'base64')
    const iv = buf.slice(0, 16)
    const data = buf.slice(16)
    // Usar crypto nativo de Node
    const { createDecipheriv, scryptSync } = await import('crypto')
    // No async aqui — usar sync approach
  } catch(e) {}
}

// Mejor: leer password directo desde un campo de texto si existe, o usar el job real
// Ejecutar el job real en modo dry-run con logs
console.log('Config keys:', Object.keys(cfg))
console.log('NIT remitente candidatos:', cfg.nit_remitente, cfg.cliente_nit, cfg.nit, cfg.nitRemitente)

await prisma.$disconnect()
