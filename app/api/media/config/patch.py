with open('/srv/gestor-staging/app/api/media/config/route.ts', 'r') as f:
    c = f.read()

# Patch 1: POST header — detectar FormData vs JSON
c = c.replace(
"""// POST — subir logo o portafolio (multipart via base64)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const empresaId = (session.user as any).empresaId
  const { tipo, nombre, base64 } = await req.json() // tipo: 'logo' | 'portafolio'

  if (!['logo', 'portafolio'].includes(tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }""",
"""// POST — logo via JSON+base64 (comprimido cliente), portafolio via FormData (sin límite 4MB)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if ((session.user as any).role !== 'empresa') return NextResponse.json({ error: 'Prohibido' }, { status: 403 })

  const empresaId = (session.user as any).empresaId
  const ct = req.headers.get('content-type') || ''
  let tipo: string, nombre: string, base64: string | undefined, pdfBuffer: Buffer | undefined

  if (ct.includes('multipart/form-data')) {
    const form = await req.formData()
    tipo = String(form.get('tipo') || '')
    nombre = String(form.get('nombre') || '')
    const blob = form.get('file') as Blob | null
    if (!blob) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })
    pdfBuffer = Buffer.from(await blob.arrayBuffer())
  } else {
    const body = await req.json()
    tipo = body.tipo; nombre = body.nombre; base64 = body.base64
  }

  if (!['logo', 'portafolio'].includes(tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }""", 1)

# Patch 2: llamada a subirMediaArchivo — pasar pdfBuffer o base64
c = c.replace(
"""  // Subir nuevo — logo como imagen, portafolio como pdf
  const { key, url, tamano_byte } = await subirMediaArchivo(
    base64, empresaId, `_config_${tipo}`, nombre
  )""",
"""  // Subir nuevo — logo (base64 comprimido) o portafolio (buffer directo)
  const { key, url, tamano_byte } = await subirMediaArchivo(
    pdfBuffer ?? base64!, empresaId, `_config_${tipo}`, nombre
  )""", 1)

with open('/srv/gestor-staging/app/api/media/config/route.ts', 'w') as f:
    f.write(c)
print('OK')
