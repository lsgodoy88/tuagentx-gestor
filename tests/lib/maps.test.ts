import { describe, it, expect } from 'vitest'
import { expandirDireccion } from '@/lib/maps'

describe('lib/maps — expandirDireccion (genera URL Google Maps con direcciones colombianas)', () => {
  describe('parseo de ciudad "Departamento/Ciudad"', () => {
    it('formato completo: "Tolima/Ibagué"', () => {
      const url = expandirDireccion('Carrera 15', 'Tolima/Ibagué')
      expect(url).toContain(encodeURIComponent('Carrera 15'))
      expect(url).toContain(encodeURIComponent('Ibagué'))
      expect(url).toContain('Tolima')
      expect(url).toContain('Colombia')
    })

    it('solo ciudad sin departamento: "Bogotá"', () => {
      const url = expandirDireccion('Calle 100', 'Bogotá')
      expect(url).toContain(encodeURIComponent('Bogotá'))
      expect(url).toContain('Colombia')
      // No debe haber "/" en el query
      expect(url).not.toContain(encodeURIComponent('/'))
    })

    it('sin dirección ni ciudad → null', () => {
      expect(expandirDireccion(null, null)).toBeNull()
      expect(expandirDireccion('', '')).toBeNull()
      expect(expandirDireccion(undefined, undefined)).toBeNull()
    })

    it('solo dirección sin ciudad → URL con dirección + Colombia', () => {
      const url = expandirDireccion('Carrera 15 #9-57', null)
      expect(url).not.toBeNull()
      expect(url).toContain('Colombia')
    })
  })

  describe('expansión de abreviaturas colombianas', () => {
    it.each([
      ['CRA 15',        'Carrera 15'],
      ['KR 15',         'Carrera 15'],
      ['CR 15',         'Carrera 15'],
      ['CLL 100',       'Calle 100'],
      ['CL 100',        'Calle 100'],
      ['AV Boyacá',     'Avenida Boyacá'],
      ['DG 22',         'Diagonal 22'],
      ['TV 5',          'Transversal 5'],
      ['MZ A',          'Manzana A'],
      ['APTO 301',      'Apartamento 301'],
      ['AP 301',        'Apartamento 301'],
      ['BRR Las Palmas','Barrio Las Palmas'],
      ['URB El Bosque', 'Urbanización El Bosque'],
      ['VRD La Esperanza', 'Vereda La Esperanza'],
      ['KM 5 vía Cajamarca', 'Kilómetro 5 vía Cajamarca'],
      ['ED Bavaria',    'Edificio Bavaria'],
    ])('"%s" → "%s"', (input, expected) => {
      const url = expandirDireccion(input, null)
      expect(url).toContain(encodeURIComponent(expected))
    })

    it('case-insensitive: "cra", "Cra", "CRA" todas → Carrera', () => {
      expect(expandirDireccion('cra 15', null)).toContain(encodeURIComponent('Carrera 15'))
      expect(expandirDireccion('Cra 15', null)).toContain(encodeURIComponent('Carrera 15'))
      expect(expandirDireccion('CRA 15', null)).toContain(encodeURIComponent('Carrera 15'))
    })

    it('múltiples abreviaturas en una dirección', () => {
      const url = expandirDireccion('CRA 15 CLL 100 APTO 301', null)
      const decoded = decodeURIComponent(url!)
      expect(decoded).toContain('Carrera 15')
      expect(decoded).toContain('Calle 100')
      expect(decoded).toContain('Apartamento 301')
    })

    it('"B/" → "Barrio"', () => {
      const url = expandirDireccion('B/ Las Palmas', null)
      expect(decodeURIComponent(url!)).toContain('Barrio Las Palmas')
    })
  })

  describe('limpieza de referencias internas', () => {
    it('elimina "Local X" (confunde a Google Maps)', () => {
      const url = expandirDireccion('CRA 15 #9-57 Local 3', null)
      const decoded = decodeURIComponent(url!)
      expect(decoded).not.toMatch(/Local\s*3/)
      // Pero conserva el resto
      expect(decoded).toContain('Carrera 15')
    })

    it('elimina "Local #5"', () => {
      const url = expandirDireccion('Carrera 15 Local #5', null)
      expect(decodeURIComponent(url!)).not.toMatch(/Local/)
    })

    it('elimina "Local 1CENTRO"', () => {
      const url = expandirDireccion('CRA 15 Local 1CENTRO', null)
      expect(decodeURIComponent(url!)).not.toMatch(/Local/)
    })

    it('reemplaza "#" por espacio (Google Maps no parsea bien #)', () => {
      const url = expandirDireccion('Carrera 15 #9-57', null)
      const decoded = decodeURIComponent(url!)
      expect(decoded).not.toContain('#')
      expect(decoded).toContain('9-57')
    })

    it('quita sufijos de barrio genéricos: CENTRO, NORTE, SUR…', () => {
      // "No." se expande a "# " → luego "#" se reemplaza por espacio → " "
      // El sufijo "CENTRO" cuelga al final → se debe limpiar
      const url = expandirDireccion('Calle 10 No 5 CENTRO', null)
      const decoded = decodeURIComponent(url!).trim()
      expect(decoded).not.toMatch(/CENTRO\s*,?\s*Colombia/)
    })
  })

  describe('integración', () => {
    it('caso real: dirección típica de tienda en Ibagué', () => {
      const url = expandirDireccion(
        'CRA 5 #38-25 LC 2 BRR Belén',
        'Tolima/Ibagué'
      )
      expect(url).toBeTruthy()
      const decoded = decodeURIComponent(url!)
      expect(decoded).toContain('Carrera 5')
      expect(decoded).toContain('Barrio Belén')
      expect(decoded).toContain('Ibagué')
      expect(decoded).toContain('Tolima')
      expect(decoded).toContain('Colombia')
      // El "LC 2" debe limpiarse
      expect(decoded).not.toMatch(/\bLC\s*2/)
    })

    it('URL siempre empieza con base de Google Maps', () => {
      const url = expandirDireccion('CRA 15', 'Tolima/Ibagué')
      expect(url).toMatch(/^https:\/\/maps\.google\.com\/maps\?q=/)
    })

    it('normalize espacios múltiples', () => {
      const url = expandirDireccion('  CRA   15   #   9-57  ', null)
      const decoded = decodeURIComponent(url!)
      expect(decoded).not.toMatch(/  /) // no dobles espacios
    })
  })
})
