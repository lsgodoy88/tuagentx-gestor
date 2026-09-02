import { describe, it, expect } from 'vitest'

// Lógica derivada de /api/plan-empresa route
function getBillingEstado(estado: string | undefined): string {
  if (estado === 'vencido')   return 'mora'
  if (estado === 'pendiente') return 'pendiente'
  if (estado === 'pagado')    return 'al_dia'
  return 'sin_plan'
}

describe('billingEstado — fuente única', () => {
  it('vencido → mora',     () => expect(getBillingEstado('vencido')).toBe('mora'))
  it('pendiente → pendiente', () => expect(getBillingEstado('pendiente')).toBe('pendiente'))
  it('pagado → al_dia',    () => expect(getBillingEstado('pagado')).toBe('al_dia'))
  it('undefined → sin_plan', () => expect(getBillingEstado(undefined)).toBe('sin_plan'))
  it('string vacío → sin_plan', () => expect(getBillingEstado('')).toBe('sin_plan'))
})
