export function slugify(n: string) {
  return n.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20)
}

export function generarPasswordDefault(nom: string, tel: string) {
  const prefijo = nom.trim().slice(0, 3)
  const sufijo = tel.replace(/\D/g, '').slice(-4)
  if (prefijo && sufijo) return prefijo + '*' + sufijo
  return ''
}

export const fmtMeta = (v: string) => {
  const n = parseInt(v.replace(/[^0-9]/g,''), 10)
  if (!n || isNaN(n)) return v
  return Math.round(n).toLocaleString('es-CO')
}

export const parseMeta = (v: string) => v.replace(/[^0-9]/g,'')

export function getSlug(n: string, empresaNombre: string) {
  return slugify(n) + '@' + slugify(empresaNombre)
}
