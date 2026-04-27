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
 * Elimina referencias internas que confunden a Google Maps:
 * Local X, Local #X, LC X — con cualquier identificador alfanumérico.
 */
function limpiarParaMaps(dir: string): string {
  return dir
    // "Local 3", "Local 1CENTRO", "Local #3", "Local A2" — hasta fin de token
    .replace(/\bLocal\s+#?\w+/gi, '')
    // # en direcciones colombianas (ej: "Carrera 15 # 9-57") → espacio
    .replace(/#/g, ' ')
    // Espacios dobles residuales
    .replace(/\s{2,}/g, ' ')
    .trim()
    // Palabras genéricas de barrio al final que confunden a Google Maps
    .replace(/\b(CENTRO|NORTE|SUR|OCCIDENTE|ORIENTE|ORIENTAL|OCCIDENTAL)\s*$/i, '')
    // Coma o espacio colgante al final (segunda pasada, por si quedó algo)
    .replace(/[,\s]+$/, '')
}
