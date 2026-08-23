import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import SwUpdateNotifier from './sw-update-notifier'
import StaleDeployGuard from './StaleDeployGuard'

const geist = Geist({ subsets: ['latin'] })
import { DM_Sans } from 'next/font/google'
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['200'], variable: '--font-dm-sans' })

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: 'Gestor TuAgentX',
  description: 'Gestión de fuerza de trabajo en campo',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${geist.className} ${dmSans.variable} text-white`} style={{background:'#060f2c'}}>
        <Providers>{children}</Providers>
        <SwUpdateNotifier />
        <StaleDeployGuard />
      </body>
    </html>
  )
}
