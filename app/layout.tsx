import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Providers from './providers'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gestor TuAgentX',
  description: 'Gestión de fuerza de trabajo en campo',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geist.className} bg-zinc-950 text-white`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
