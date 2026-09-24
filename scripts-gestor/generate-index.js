#!/usr/bin/env node
/**
 * generate-index.js — genera .claude-index/<dominio>.json a partir del código real.
 *
 * Objetivo: eliminar el error humano detectado en el piloto de "cartera"
 * (líneas estimadas a mano, hasta 73 líneas de diferencia con la realidad).
 * Este script SOLO reporta lo que puede confirmar con grep exacto sobre el
 * archivo real en el momento de correr — nunca aproxima, nunca "recuerda".
 *
 * Uso: node generate-index.js <dominio>
 * Ej:  node generate-index.js egresos
 *
 * Se engancha a build-staging.sh (ver instrucción al final del archivo).
 */

const fs = require('fs')
const path = require('path')

const ROOT = '/srv/gestor-staging'
const APP_DIR = path.join(ROOT, 'app/(app)')
const INDEX_DIR = path.join(ROOT, '.claude-index')

function listFilesRecursive(dir, exts = ['.ts', '.tsx']) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, exts))
    } else if (exts.includes(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

function relPath(p) {
  return path.relative(ROOT, p)
}

// Extrae funciones definidas a nivel de módulo (candidatas a "botones"/acciones):
// function nombre(...), async function nombre(...), const nombre = (...) =>, export function nombre
function extractFunctions(content, filePath) {
  const lines = content.split('\n')
  const found = []
  // Dos categorías de declaración que sí importan para el índice:
  // 1) function nombre(...) a nivel de módulo o de componente (indentación 0-2)
  // 2) const nombre = useCallback(...) / useMemo(...) / async (...) — acciones
  //    reales dentro de un hook, NO variables simples como `const x = a || b`.
  // Se excluye explícitamente todo lo demás (evita el ruido de `const telefono = ...`).
  const patterns = [
    /^(?:export\s+default\s+)?(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_][\w]*)\s*[\({]/,
    /^  (?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_][\w]*)\s*\(/,
    /^  const\s+([a-zA-Z_][\w]*)\s*=\s*useCallback\s*\(/,
    /^  const\s+([a-zA-Z_][\w]*)\s*=\s*useMemo\s*\(/,
    /^  (?:export\s+)?const\s+([a-zA-Z_][\w]*)\s*=\s*async\s*\(/,
  ]
  lines.forEach((line, idx) => {
    for (const re of patterns) {
      const m = line.match(re)
      if (m) {
        found.push({ nombre: m[1], linea: idx + 1 })
        break
      }
    }
  })
  return found
}

function extractApiCalls(content) {
  const calls = new Set()
  const re = /fetch\(\s*[`'"]([^`'"]+)[`'"]/g
  let m
  while ((m = re.exec(content))) {
    // normalizar query strings dinámicos
    const clean = m[1].replace(/\$\{[^}]+\}/g, ':param')
    calls.add(clean)
  }
  return [...calls]
}

function extractExportedHookType(content) {
  const m = content.match(/export function (use[A-Z]\w+)/)
  return m ? m[1] : null
}

function buildDomainIndex(dominio) {
  const domainDir = path.join(APP_DIR, dominio)
  if (!fs.existsSync(domainDir)) {
    console.error(`[generate-index] Dominio no encontrado: ${domainDir}`)
    process.exit(1)
  }

  const allFiles = listFilesRecursive(domainDir)
  const result = {
    dominio,
    generado_automaticamente: true,
    generado_en: new Date().toISOString(),
    carpeta_principal: relPath(domainDir),
    archivos: {},
  }

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8')
    const rel = relPath(file)
    const lineCount = content.split('\n').length
    const funcs = extractFunctions(content, file)
    const apiCalls = extractApiCalls(content)
    const hookType = extractExportedHookType(content)

    result.archivos[rel] = {
      lineas: lineCount,
      ...(hookType ? { hook_exportado: hookType } : {}),
      ...(funcs.length ? { funciones: funcs } : {}),
      ...(apiCalls.length ? { llamadas_api: apiCalls } : {}),
    }
  }

  return result
}

function main() {
  const dominio = process.argv[2]
  if (!dominio) {
    console.error('Uso: node generate-index.js <dominio>')
    process.exit(1)
  }

  const index = buildDomainIndex(dominio)

  if (!fs.existsSync(INDEX_DIR)) fs.mkdirSync(INDEX_DIR, { recursive: true })
  const outPath = path.join(INDEX_DIR, `${dominio}.auto.json`)
  fs.writeFileSync(outPath, JSON.stringify(index, null, 2), 'utf8')

  // Auto-validación — si esto falla, el archivo no debe considerarse válido
  JSON.parse(fs.readFileSync(outPath, 'utf8'))

  console.log(`[generate-index] OK — ${outPath}`)
  console.log(`[generate-index] Archivos indexados: ${Object.keys(index.archivos).length}`)
}

main()

/**
 * INTEGRACIÓN A build-staging.sh (pendiente de aplicar — requiere confirmación Luis):
 *
 *   for d in ingresos ordenes impulsos configuracion empleados recaudos rutas cartera egresos; do
 *     node /home/luis/scripts-gestor/generate-index.js "$d" || echo "[WARN] index $d falló"
 *   done
 *
 * El "|| echo WARN" es intencional: un fallo en el índice NUNCA debe romper
 * el build. Es una herramienta de asistencia, no una dependencia crítica.
 */
