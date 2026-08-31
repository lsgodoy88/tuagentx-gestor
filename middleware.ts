import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// ── Mapa de rutas protegidas → roles permitidos ───────────────────────────────
// Solo roles base — permisos granulares los maneja cada página internamente
// Todos los roles válidos del sistema
const ALL_ROLES = ['superadmin', 'empresa', 'supervisor', 'vendedor', 'entregas', 'impulsadora', 'bodega']

// Rutas accesibles por TODOS los roles autenticados (sin restricción adicional)
const ROUTES_ALL_ROLES = ['/inicio', '/configuracion', '/ventas', '/cobros', '/ordenes', '/turno', '/historial-turnos', '/listas', '/mapa', '/mi-ruta']

// Rutas con restricción de rol específica
const ROUTE_ROLES: Record<string, string[]> = {
  '/ingresos':       ['empresa', 'supervisor'],
  '/egresos':        ['empresa', 'supervisor'],
  '/empleados':      ['empresa', 'supervisor'],
  '/recaudos':       ['empresa', 'supervisor'],
  '/rutas':          ['empresa', 'supervisor'],
  '/clientes':       ['empresa', 'supervisor', 'vendedor'],
  '/cartera':        ['empresa', 'supervisor', 'vendedor'],
  '/visitas':        ['empresa', 'supervisor', 'vendedor', 'entregas'],
  '/impulsos':       ['empresa', 'supervisor', 'vendedor', 'impulsadora'],
  '/trazabilidad':   ['empresa', 'supervisor', 'vendedor', 'bodega', 'entregas'],
  '/stock':          ['empresa', 'supervisor', 'bodega'],
  '/bodega':         ['bodega'],
  '/gastos':         ['vendedor', 'impulsadora'],
  '/historial':      ['vendedor'],
  '/mapa-ruta':      ['vendedor', 'entregas'],
  '/rutas-entregas': ['entregas'],
  '/impulsadora':    ['impulsadora'],
  '/impulsar':       ['impulsadora'],
  '/empresas':       ['superadmin'],
  '/monitor':        ['superadmin'],
  '/precios':        ['superadmin'],
  '/code':           ['superadmin'],
  '/reportes':       ['superadmin'],
}

// Países permitidos — Colombia + algunos comunes de admin
const ALLOWED_COUNTRIES = ['CO', 'US', 'XX'] // XX = desconocido (desarrollo local)

// Rutas que NO requieren geo-bloqueo (webhooks, APIs públicas)
const BYPASS_PATHS = [
  '/api/deploy/webhook',
  '/api/cartera/recibo-publico',
  '/api/health',
  '/api/version',
  '/api/voucher',
  '/recaudo/recibo',
  '/api/auth',
  '/_next',
  '/favicon',
]

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname

  // Bypass para rutas públicas
  if (BYPASS_PATHS.some(p => path.startsWith(p))) {
    return NextResponse.next()
  }

  // Cloudflare proporciona el país en este header
  const country = req.headers.get('cf-ipcountry') || 'XX'

  if (!ALLOWED_COUNTRIES.includes(country)) {
    return new NextResponse(
      JSON.stringify({ error: 'Acceso restringido por región', country }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // ── Guard de roles ────────────────────────────────────────────────────────
  // Solo aplica a rutas de página — las APIs tienen su propio guard
  // con getServerSession() internamente. NO extender este guard a /api/
  // sin revisar cada endpoint: muchas APIs son compartidas entre roles.
  const isAppRoute = !path.startsWith('/api/') && !path.startsWith('/login') && !path.startsWith('/recaudo')
  if (isAppRoute) {
    const cookieName = process.env.AUTH_COOKIE_NAME ?? 'staging-next-auth.session-token'
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName })

    if (!token) {
      // No autenticado — dejar pasar solo /login
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const role = token.role as string

    // Ruta en whitelist sin restricción adicional → ok
    if (ROUTES_ALL_ROLES.some(r => path === r || path.startsWith(r + '/'))) {
      return NextResponse.next()
    }

    // Ruta con restricción específica → verificar rol
    const matchedRoute = Object.keys(ROUTE_ROLES).find(r => path === r || path.startsWith(r + '/'))
    if (matchedRoute) {
      if (!ROUTE_ROLES[matchedRoute].includes(role)) {
        return NextResponse.redirect(new URL('/inicio', req.url))
      }
      return NextResponse.next()
    }

    // Ruta no mapeada en ninguna lista → deny por defecto (nueva ruta sin declarar)
    // Superadmin pasa siempre para no bloquearse
    if (role !== 'superadmin') {
      return NextResponse.redirect(new URL('/inicio', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$|.*\\.webp$|.*\\.ico$|.*\\.woff2?$|.*\\.json$).*)',
  ],
}
