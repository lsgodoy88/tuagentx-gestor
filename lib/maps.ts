/**
 * Expande abreviaturas comunes en direcciones colombianas
 * y genera URL de Google Maps en formato: DireccionExpandida, Ciudad, Departamento, Colombia
 *
 * @param direccion  Dirección cruda (puede tener abreviaturas)
 * @param ciudad     Campo ciudad en formato "Departamento/Ciudad" (ej: "Tolima/Ibagué")
 * @returns URL de Google Maps o null si no hay datos suficientes
 */
export function expandirDireccion(
  direccion: string | null | undefined,
  ciudad: string | null | undefined
): string | null {
  // Parsear departamento y ciudad del formato "Departamento/Ciudad"
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

  // Expandir abreviaturas en dirección y luego limpiar referencias internas
  let dir = ''
  if (direccion) {
    dir = limpiarParaMaps(expandir(direccion))
  }

  // Construir la cadena de búsqueda
  const partes: string[] = []
  if (dir) partes.push(dir)
  if (ciu) partes.push(ciu)
  if (dep) partes.push(dep)
  if (partes.length === 0) return null
  partes.push('Colombia')

  const query = partes.join(', ')
  return 'https://maps.google.com/maps?q=' + encodeURIComponent(query)
}

/** Expande abreviaturas en una dirección. */
function expandir(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ')

  // Reemplazos ordenados de más específico a menos específico
  const reemplazos: [RegExp, string][] = [
    // Apartamento (primero los más largos)
    [/\bAPTO\b/gi, 'Apartamento'],
    [/\bAP\b/gi, 'Apartamento'],
    // Local
    [/\bLCL\b/gi, 'Local'],
    [/\bLC\b/gi, 'Local'],
    // Carrera (CRA y KR antes de CR)
    [/\bCRA\b/gi, 'Carrera'],
    [/\bKR\b/gi, 'Carrera'],
    // Calle (CLL antes de CL)
    [/\bCLL\b/gi, 'Calle'],
    // Barrio (BRR antes de B/)
    [/\bBRR\b/gi, 'Barrio'],
    // Barrio con slash: "B/ texto" → "Barrio texto"
    [/\bB\//gi, 'Barrio '],
    // Urbanización
    [/\bURB\b/gi, 'Urbanización'],
    // Vereda
    [/\bVRD\b/gi, 'Vereda'],
    // Kilómetro
    [/\bKM\b/gi, 'Kilómetro'],
    // Interior
    [/\bINT\b/gi, 'Interior'],
    // Transversal
    [/\bTV\b/gi, 'Transversal'],
    // Diagonal
    [/\bDG\b/gi, 'Diagonal'],
    // Manzana
    [/\bMANZ\b/gi, 'Manzana'],
    [/\bMZ\b/gi, 'Manzana'],
    // Edificio
    [/\bED\b/gi, 'Edificio'],
    // Avenida
    [/\bAV\b/gi, 'Avenida'],
    // Carrera (CR y CL al final, más cortos)
    [/\bCR\b/gi, 'Carrera'],
    [/\bCL\b/gi, 'Calle'],
    // No → # (número de casa/local)
    [/\bNo\.?\s*/gi, '# '],
  ]

  for (const [pattern, replacement] of reemplazos) {
    s = s.replace(pattern, replacement)
  }

  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Normaliza dirección colombiana para Google Maps.
 *
 * Regla simple y robusta:
 * 1. Si tiene vía (Carrera/Calle/etc) → extraer TipoVia+Número+Cruce + barrio si existe
 * 2. Si no tiene vía → extraer nombre de barrio/sector (eliminar Manzana/Casa/Bloque)
 */
function limpiarParaMaps(dir: string): string {
  // 1. Detectar si tiene vía principal
  // Pre-limpiar referencias de urbanización antes de extraer componentes viales
  const dirClean = dir.replace(/\bManzana\s+\w+/gi, '').replace(/\bCasa\s+\d+\w*/gi, '').replace(/\s{2,}/g, ' ').trim()
  const matchVia = dir.match(
    /^((?:Carrera|Calle|Diagonal|Transversal|Avenida|Kilom[eé]tro)\s+\d+[A-Za-z]?(?:\s+[A-Za-z])?)\s*/i
  )

  // 2. Detectar número de cruce colombiano: # XX-XX o XX-XX
  const matchCruce = dir.match(/(?:#\s*)(\d+[A-Z]?(?:\s*[-\u2013]\s*\d+[A-Z]?)?)/i)
  // Cruce solo válido si hay # explícito (evita tomar número de calle como cruce)

  // 3. Detectar barrio: texto precedido de "Barrio" o al final tras refs de urbanización
  const matchBarrio = dir.match(
    /\bBarrio\s+([A-ZÁÉÍÓÚ][A-ZÁÉÍÓÚ\w\s]{1,35}?)(?:\s+(?:PARTE\s+(?:ALTA|BAJA)|\d*\s*ETAPA|\d*\s*ETP|PTE\s+(?:ALTA|BAJA)))?\s*$/i
  )

  let resultado: string

  if (matchVia) {
    const via = matchVia[1].trim()
    const cruce = matchCruce ? matchCruce[1].trim() : ''
    const barrio = matchBarrio ? matchBarrio[1].trim() : ''
    resultado = [via, cruce, barrio].filter(Boolean).join(' ')
      .replace(/\bLocal\s+#?\s*\w*/gi, '')
      .replace(/\bBarrio\s+/gi, '')
      .replace(/\bManzana\s+\w+/gi, '')
      .replace(/\s{2,}/g, ' ').trim()
  } else {
    // Sin vía: extraer solo barrio/sector
    resultado = dir
      .replace(/\b(Manzana|MZ|MZN|MANZ)\s+\w+/gi, '')
      .replace(/\b(Casa|CS)\s+\w+/gi, '')
      .replace(/\b(Bloque|BL|SMZ|Super\s+Manzana)\s+\w+/gi, '')
      .replace(/(Lote|Lt)\s+\S+/gi, '')
      .replace(/\bLocal\s+#?\s*\w*/gi, '')
      .replace(/Apartamento\s+#?\w+/gi, '')
      .replace(/\b(\d+\s*ETAPA|ETAPA\s*\d+|\d+\s*ETP|ETP\s*\d+|PARTE\s+(?:ALTA|BAJA)|PTE\s+(?:ALTA|BAJA))\b/gi, '')
      .replace(/Barrio\s+/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .replace(/[,\s]+$/, '')
  }

  // Limpieza final
  return resultado
    .replace(/(CENTRO|NORTE|SUR|OCCIDENTE|ORIENTE|ORIENTAL|OCCIDENTAL)\s*$/i, '')
    .replace(/[,\s]+$/, '')
    .trim()
}
