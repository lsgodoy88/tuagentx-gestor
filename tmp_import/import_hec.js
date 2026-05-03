
const {PrismaClient} = require('/srv/gestor/app/generated/prisma')
const p = new PrismaClient()
const fs = require('fs')

const clientes = JSON.parse(fs.readFileSync('/srv/gestor/tmp_import/19474458hec_clientes.json'))

async function main() {
  let created = 0, updated = 0
  for (const c of clientes) {
    const apiId = c._id['$oid']
    const r = {
      apiId,
      empresaId: 'cmojhfct40000znvfaos1jy1m',
      nombre: ((c.name||'') + ' ' + (c.lastName||'')).trim(),
      nit: String(c.doc||'').trim() || null,
      direccion: String(c.dir||'').trim() || null,
      telefono: String(c.nCel||'').trim() || null,
      ciudad: String(c.ciudad||'').trim() || null,
    }
    const existing = await p.cliente.findFirst({ where: { empresaId: r.empresaId, apiId: r.apiId } })
    if (existing) {
      await p.cliente.update({ where: { id: existing.id }, data: r })
      updated++
    } else {
      await p.cliente.create({ data: r })
      created++
    }
    if ((created + updated) % 100 === 0) console.log('procesados:', created + updated)
  }
  console.log('Leche creados:', created, 'actualizados:', updated)
  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
