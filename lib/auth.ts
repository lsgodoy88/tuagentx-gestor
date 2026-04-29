import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        
        // Buscar en Empresa
        const empresa = await prisma.empresa.findUnique({ where: { email: credentials.email } })
        if (empresa && await bcrypt.compare(credentials.password, empresa.password)) {
          const role = empresa.plan === 'superadmin' ? 'superadmin' : 'empresa'
          return { id: empresa.id, email: empresa.email, name: empresa.nombre, role, empresaId: empresa.id }
        }

        // Buscar en Empleado
        const empleado = await prisma.empleado.findUnique({
          where: { email: credentials.email },
          include: { empresa: true }
        })
        if (empleado && await bcrypt.compare(credentials.password, empleado.password)) {
          return {
            id: empleado.id,
            email: empleado.email,
            name: empleado.nombre,
            role: empleado.rol,
            empresaId: empleado.empresaId,
            puedeCapturarGPS: (empleado as any).puedeCapturarGPS,
            permisos: (empleado as any).permisos ?? {},
            etiqueta: (empleado as any).etiqueta ?? null
          }
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
        token.empresaId = (user as any).empresaId
        token.userId = (user as any).id
        token.permisos = (user as any).permisos ?? {}
        token.etiqueta = (user as any).etiqueta ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role as string
        (session.user as any).empresaId = token.empresaId as string
        (session.user as any).id = (token.userId || token.sub) as string
        (session.user as any).permisos = token.permisos ?? {}
        ;(session.user as any).etiqueta = token.etiqueta ?? null
      }
      return session
    },
  },
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
}
