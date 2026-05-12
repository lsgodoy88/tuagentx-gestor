import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Países permitidos — Colombia + algunos comunes de admin
const ALLOWED_COUNTRIES = ['CO', 'US', 'XX'] // XX = desconocido (desarrollo local)

// Rutas que NO requieren geo-bloqueo (webhooks, APIs públicas)
const BYPASS_PATHS = [
  '/api/cartera/recibo-publico',
  '/api/health',
  '/api/voucher',
  '/recaudo/recibo',
  '/api/auth',
  '/_next',
  '/favicon',
]

export function middleware(req: NextRequest) {
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

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static, _next/image, favicon.ico
     * - public files
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)',
  ],
}
