import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import fs from 'fs/promises'
import path from 'path'

const ROOT = process.cwd()
const APP_DIR = path.join(ROOT, 'app')
const LIB_DIR = path.join(ROOT, 'lib')
const PRISMA_SCHEMA = path.join(ROOT, 'prisma', 'schema.prisma')
const WORKERS_DIR = path.join(ROOT, 'workers')

async function readSafe(p: string): Promise<string> {
  try { return await fs.readFile(p, 'utf-8') } catch { return '' }
}

async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch { return [] }
}

// ─── Escaneo de páginas (módulos UI) ────────────────────────────────────────
async function scanPage(modulePath: string, ruta: string) {
  const pagePath = path.join(modulePath, 'page.tsx')
  const txt = await readSafe(pagePath)
  if (!txt) return null

  // Botones (onClick simples)
  const botones = new Set<string>()
  const btnRegex = /<button[^>]*onClick=\{[^}]*\}[^>]*>([\s\S]*?)<\/button>/g
  let m
  while ((m = btnRegex.exec(txt)) !== null) {
    const label = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (label && label.length < 80) botones.add(label)
  }

  // Endpoints que consume
  const endpoints = new Set<string>()
  const epRegex = /fetch\(\s*['"`](\/api\/[^'"`?]+)/g
  while ((m = epRegex.exec(txt)) !== null) endpoints.add(m[1])

  // useState (propiedades reactivas)
  const states: string[] = []
  const stateRegex = /useState[<\w,\[\]\s|]*\(\s*([^)]*?)\s*\)/g
  // Mejor: tomar el nombre de la variable
  const stateNameRegex = /const\s+\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=\s*useState/g
  while ((m = stateNameRegex.exec(txt)) !== null) states.push(m[1])

  // Tabs
  const tabs = new Set<string>()
  const tabRegex = /['"`]([\w\-]+)['"`]\s*\|\s*['"`]([\w\-]+)['"`]/g
  // No es confiable; saltamos

  // Permisos por rol mencionados
  const roles = new Set<string>()
  const roleRegex = /role\s*===?\s*['"`](\w+)['"`]/g
  while ((m = roleRegex.exec(txt)) !== null) roles.add(m[1])
  const roleListRegex = /\[['"`](\w+)['"`](?:\s*,\s*['"`](\w+)['"`])*\]\.includes\(\s*user\??\.\s*role/g
  while ((m = roleListRegex.exec(txt)) !== null) {
    for (let i = 1; i < m.length; i++) if (m[i]) roles.add(m[i])
  }

  return {
    ruta,
    archivo: pagePath.replace(ROOT, ''),
    botones: [...botones].slice(0, 20),
    endpoints: [...endpoints],
    propiedades: [...new Set(states)].slice(0, 30),
    roles: [...roles],
    lineas: txt.split('\n').length,
  }
}

async function scanModulos() {
  const dashboardDir = path.join(APP_DIR, '(app)')
  const subdirs = await listDirs(dashboardDir)
  const modulos: any[] = []
  for (const sub of subdirs) {
    const info = await scanPage(path.join(dashboardDir, sub), `/${sub}`)
    if (info) modulos.push({ nombre: sub, ...info })
  }
  // Inicio
  const inicio = await scanPage(dashboardDir, '/inicio')
  if (inicio) modulos.unshift({ nombre: '(inicio)', ...inicio })
  return modulos
}

// ─── Escaneo de endpoints API ───────────────────────────────────────────────
async function scanApiRecursive(dir: string, base = ''): Promise<any[]> {
  const out: any[] = []
  let entries: any[] = []
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return [] }

  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...await scanApiRecursive(full, `${base}/${e.name}`))
    } else if (e.name === 'route.ts' || e.name === 'route.tsx') {
      const txt = await readSafe(full)
      const metodos: string[] = []
      for (const verb of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (new RegExp(`export\\s+async\\s+function\\s+${verb}\\b`).test(txt)) metodos.push(verb)
      }
      // Tablas Prisma que toca
      const tablas = new Set<string>()
      const tablaRegex = /prisma(?:\s+as\s+any)?\)?\.(\w+)\./g
      let m
      while ((m = tablaRegex.exec(txt)) !== null) {
        if (!['$', 'transaction', 'connect', 'disconnect'].includes(m[1])) tablas.add(m[1])
      }
      out.push({
        ruta: `/api${base}`,
        archivo: full.replace(ROOT, ''),
        metodos,
        tablas: [...tablas],
        lineas: txt.split('\n').length,
      })
    }
  }
  return out
}

// ─── Schema Prisma ──────────────────────────────────────────────────────────
async function scanSchema() {
  const txt = await readSafe(PRISMA_SCHEMA)
  const modelos: any[] = []
  const re = /model\s+(\w+)\s*\{([\s\S]*?)\}/g
  let m
  while ((m = re.exec(txt)) !== null) {
    const nombre = m[1]
    const cuerpo = m[2]
    const campos = cuerpo.split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('@@') && !l.startsWith('//'))
      .map(l => {
        const parts = l.split(/\s+/)
        return { name: parts[0], type: parts[1] || '' }
      })
      .filter(f => f.name && !f.name.startsWith('@'))
    modelos.push({ nombre, campos: campos.slice(0, 40), totalCampos: campos.length })
  }
  return modelos
}

// ─── Workers/Crons ──────────────────────────────────────────────────────────
async function scanWorkers() {
  const start = await readSafe(path.join(WORKERS_DIR, 'start.ts'))
  if (!start) return []
  const jobs: any[] = []
  const re = /(\w+)Queue\.add\([^,]+,[^,]*,\s*\{\s*repeat:\s*\{\s*pattern:\s*['"`]([^'"`]+)['"`]/g
  let m
  while ((m = re.exec(start)) !== null) {
    jobs.push({ job: m[1], cron: m[2] })
  }
  // Otro formato: cronJob.schedule
  const re2 = /schedule\(\s*['"`]([^'"`]+)['"`]\s*,\s*async/g
  while ((m = re2.exec(start)) !== null) jobs.push({ job: 'inline', cron: m[1] })
  return jobs
}

// ─── Adaptadores de integración ─────────────────────────────────────────────
async function scanAdaptadores() {
  const dir = path.join(LIB_DIR, 'integracion', 'adapters')
  const archivos: string[] = []
  try {
    const entries = await fs.readdir(dir)
    for (const e of entries) if (e.endsWith('.ts') && !e.endsWith('.bak')) archivos.push(e)
  } catch {}
  const out: any[] = []
  for (const a of archivos) {
    const txt = await readSafe(path.join(dir, a))
    const metodos: string[] = []
    const re = /async\s+(\w+)\s*\(/g
    let m
    while ((m = re.exec(txt)) !== null) metodos.push(m[1])
    out.push({ adaptador: a.replace('.ts', ''), metodos: [...new Set(metodos)] })
  }
  return out
}

// ─── Constantes y env ───────────────────────────────────────────────────────
async function scanEnv() {
  const envPath = path.join(ROOT, '.env')
  const txt = await readSafe(envPath)
  return txt.split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .map(l => l.split('=')[0])
    .filter(Boolean)
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'superadmin') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const [modulos, endpoints, modelos, crons, adaptadores, envKeys] = await Promise.all([
    scanModulos(),
    scanApiRecursive(path.join(APP_DIR, 'api')),
    scanSchema(),
    scanWorkers(),
    scanAdaptadores(),
    scanEnv(),
  ])

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    resumen: {
      modulos: modulos.length,
      endpoints: endpoints.length,
      modelos: modelos.length,
      crons: crons.length,
      adaptadores: adaptadores.length,
      envKeys: envKeys.length,
    },
    modulos,
    endpoints,
    modelos,
    crons,
    adaptadores,
    envKeys,
  })
}
