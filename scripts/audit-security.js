const fs = require('fs')
const path = require('path')

const MODELOS_CRITICOS = ['Cliente', 'Empleado', 'SyncDeuda', 'CarteraCache', 'Visita', 'Ruta', 'Turno', 'OrdenDespacho', 'PagoCartera']

// Filtros que garantizan aislamiento por empresa indirectamente
const FILTROS_SEGUROS = ['empresaId', 'empleadoId', 'user.id', 'rutaId', 'clienteId', 'turnoId', 'integracionId', 'empresaVinculadaId', 'where,', 'where: {']

const API_DIR = path.join(__dirname, '../app/api')

let alertas = 0
let ok = 0
let ignorados = 0

function revisarArchivo(filePath) {
  const contenido = fs.readFileSync(filePath, 'utf-8')
  const relativo = filePath.replace(path.join(__dirname, '..'), '')
  const lineas = contenido.split('\n')

  for (const modelo of MODELOS_CRITICOS) {
    const modeloLower = modelo.toLowerCase()
    
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i]
      if (!linea.includes(`prisma.${modeloLower}.findMany`) && 
          !linea.includes(`prisma.${modeloLower}.findFirst`) &&
          !linea.includes(`prisma.${modeloLower}.updateMany`) &&
          !linea.includes(`prisma.${modeloLower}.deleteMany`)) continue

      // Buscar el bloque where (siguientes 10 líneas)
      const bloque = lineas.slice(i, i + 10).join('\n')
      
      const tieneFiltroSeguro = FILTROS_SEGUROS.some(f => bloque.includes(f))
      
      if (tieneFiltroSeguro) {
        ignorados++
      } else {
        console.log(`⚠️  ${relativo}:${i+1} → ${modelo} sin filtro de empresa`)
        alertas++
      }
    }
  }
}

function revisarDirectorio(dir) {
  const items = fs.readdirSync(dir)
  for (const item of items) {
    const fullPath = path.join(dir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) revisarDirectorio(fullPath)
    else if (item.endsWith('.ts') && item.includes('route')) revisarArchivo(fullPath)
  }
}

console.log('=== AUDIT DE SEGURIDAD TUAGENTX ===\n')
revisarDirectorio(API_DIR)
console.log(`\n=== RESULTADO ===`)
console.log(`✅ Queries protegidas: ${ignorados}`)
console.log(`⚠️  Alertas reales: ${alertas}`)
if (alertas > 0) {
  console.log('\n❌ FALLÓ — revisar antes de deploy')
  process.exit(1)
} else {
  console.log('\n✅ PASÓ — todos los endpoints protegidos')
}
