export type TemaId = 'oceano' | 'violeta' | 'fuego' | 'esmeralda' | 'rosa'

export interface Tema {
  id: TemaId
  nombre: string
  emoji: string
  bg: string
  blobs: { color: string; size: number; top?: string; bottom?: string; left?: string; right?: string }[]
}

export const TEMAS: Tema[] = [
  {
    id: 'oceano',
    nombre: 'Océano',
    emoji: '🌊',
    bg: '#04080f',
    blobs: [
      { color: '#1a4fa8', size: 280, top: '-80px', left: '-60px' },
      { color: '#0ea5e9', size: 200, bottom: '40px', right: '-40px' },
      { color: '#1e3a8a', size: 160, bottom: '180px', left: '50px' },
      { color: '#0369a1', size: 140, top: '200px', right: '30px' },
      { color: '#075985', size: 120, top: '80px', left: '40%' },
      { color: '#38bdf8', size: 100, bottom: '80px', left: '30%' },
    ],
  },
  {
    id: 'violeta',
    nombre: 'Violeta',
    emoji: '💜',
    bg: '#060410',
    blobs: [
      { color: '#6d28d9', size: 300, top: '-80px', right: '-60px' },
      { color: '#a855f7', size: 180, bottom: '60px', left: '20px' },
      { color: '#4c1d95', size: 150, top: '160px', left: '-30px' },
      { color: '#7c3aed', size: 130, bottom: '200px', right: '20px' },
      { color: '#8b5cf6', size: 110, top: '300px', left: '40%' },
      { color: '#c084fc', size: 90,  bottom: '120px', left: '50%' },
    ],
  },
  {
    id: 'fuego',
    nombre: 'Fuego',
    emoji: '🔥',
    bg: '#0c0602',
    blobs: [
      { color: '#c2410c', size: 280, top: '-60px', left: '-50px' },
      { color: '#f97316', size: 200, bottom: '40px', right: '-30px' },
      { color: '#7c2d12', size: 150, bottom: '200px', left: '60px' },
      { color: '#ea580c', size: 130, top: '220px', right: '40px' },
      { color: '#fb923c', size: 110, top: '100px', left: '45%' },
      { color: '#9a3412', size: 90,  bottom: '100px', left: '35%' },
    ],
  },
  {
    id: 'esmeralda',
    nombre: 'Esmeralda',
    emoji: '💚',
    bg: '#020c07',
    blobs: [
      { color: '#065f46', size: 300, top: '-70px', right: '-50px' },
      { color: '#10b981', size: 190, bottom: '50px', left: '10px' },
      { color: '#047857', size: 150, top: '180px', right: '20px' },
      { color: '#059669', size: 130, bottom: '220px', left: '50px' },
      { color: '#34d399', size: 110, top: '320px', left: '40%' },
      { color: '#064e3b', size: 100, bottom: '130px', right: '35%' },
    ],
  },
  {
    id: 'rosa',
    nombre: 'Rosa',
    emoji: '🌸',
    bg: '#0a010a',
    blobs: [
      { color: '#ff00cc', size: 280, top: '-60px', left: '-40px' },
      { color: '#ff4de6', size: 200, bottom: '30px', right: '-30px' },
      { color: '#ff00aa', size: 150, bottom: '200px', left: '50px' },
      { color: '#ff33cc', size: 130, top: '200px', right: '30px' },
      { color: '#ff80e5', size: 110, top: '320px', left: '40%' },
      { color: '#cc0099', size: 90,  bottom: '120px', left: '30%' },
    ],
  },
]

export function getTema(id: string): Tema {
  return TEMAS.find(t => t.id === id) ?? TEMAS[0]
}
