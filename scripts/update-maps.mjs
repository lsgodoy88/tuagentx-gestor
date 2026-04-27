/**
 * Script para actualizar el campo maps de todos los clientes existentes
 * usando la misma lógica de expandirDireccion que lib/maps.ts
 *
 * Ejecución: node /srv/gestor/scripts/update-maps.mjs
 */

import pg from 'pg'
const { Pool } = pg

const DATABASE_URL = 'postgresql://evolution:evolutionpass@127.0.0.1:5432/evolution?schema=gestor'

const pool = new Pool({ connectionString: DATABASE_URL })

// ── Lógica de expansión (espejo de lib/maps.ts) ──────────────────────────────

const REEMPLAZOS = [
  [/\bAPTO\b/gi, 'Apartamento'],
  [/\bAP\b/gi, 'Apartamento'],
  [/\bLCL\b/gi, 'Local'],
  [/\bLC\b/gi, 'Local'],
  [/\bCRA\b/gi, 'Carrera'],
  [/\bKR\b/gi, 'Carrera'],
  [/\bCLL\b/gi, 'Calle'],
  [/\bBRR\b/gi, 'Barrio'],
  [/\bB\//gi, 'Barrio '],
  [/\bURB\b/gi, 'Urbanización'],
  [/\bVRD\b/gi, 'Vereda'],
  [/\bKM\b/gi, 'Kilómetro'],
  [/\bINT\b/gi, 'Interior'],
  [/\bTV\b/gi, 'Transversal'],
  [/\bDG\b/gi, 'Diagonal'],
  [/\bMZ\b/gi, 'Manzana'],
  [/\bED\b/gi, 'Edificio'],
  [/\bAV\b/gi, 'Avenida'],
  [/\bCR\b/gi, 'Carrera'],
  [/\bCL\b/gi, 'Calle'],
  [/\bNo\.?\s*/gi, '# '],
]

function expandir(raw) {
  let s = raw.trim().replace(/\s+/g, ' ')
  for (const [pattern, replacement] of REEMPLAZOS) {
    s = s.replace(pattern, replacement)
  }
  return s.replace(/\s+/g, ' ').trim()
}

function limpiarParaMaps(dir) {
  return dir
    .replace(/\bLocal\s+#?\w+/gi, '')
    .replace(/#/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/\b(CENTRO|NORTE|SUR|OCCIDENTE|ORIENTE|ORIENTAL|OCCIDENTAL)\s*$/i, '')
    .replace(/[,\s]+$/, '')
}

function generarMaps(direccion, ciudad) {
  let dep = ''
  let ciu = ''
  if (ciudad) {
    const slash = ciudad.indexOf('/')
    if (slash !== -1) {
      dep = ciudad.slice(0, slash).trim()
      ciu = ciudad.slice(slash + 1).trim()
    } else {
      ciu = ciudad.trim()
    }
  }

  const dir = direccion ? limpiarParaMaps(expandir(direccion)) : ''

  const partes = []
  if (dir) partes.push(dir)
  if (ciu) partes.push(ciu)
  if (dep) partes.push(dep)
  if (partes.length === 0) return null
  partes.push('Colombia')

  return 'https://maps.google.com/maps?q=' + encodeURIComponent(partes.join(', '))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect()
  try {
    // Obtener todos los clientes con direccion o ciudad
    const { rows } = await client.query(
      `SELECT id, direccion, ciudad FROM gestor."Cliente" WHERE direccion IS NOT NULL OR ciudad IS NOT NULL`
    )

    console.log(`Procesando ${rows.length} clientes...`)

    let actualizados = 0
    let sinCambio = 0

    for (const row of rows) {
      const nuevaMaps = generarMaps(row.direccion, row.ciudad)
      if (!nuevaMaps) { sinCambio++; continue }

      await client.query(
        `UPDATE gestor."Cliente" SET maps = $1 WHERE id = $2`,
        [nuevaMaps, row.id]
      )
      actualizados++
    }

    console.log(`✓ Actualizados: ${actualizados}`)
    console.log(`  Sin dirección/ciudad: ${sinCambio}`)

    // Mostrar 5 ejemplos del resultado
    const { rows: ejemplos } = await client.query(
      `SELECT direccion, ciudad, maps FROM gestor."Cliente" WHERE maps IS NOT NULL LIMIT 5`
    )
    console.log('\nEjemplos:')
    for (const e of ejemplos) {
      console.log(`  DIR: ${e.direccion}`)
      console.log(`  CIU: ${e.ciudad}`)
      console.log(`  MAP: ${e.maps}`)
      console.log()
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
