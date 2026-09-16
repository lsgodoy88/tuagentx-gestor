import type { UpTresCursor } from '@/lib/integracion/adapters/uptres'

export const ORDEN_INVOICED_1 = {
  id: 'test-ord-001', orderNumber: 3700, invoiceNumber: 4450, isInvoiced: true,
  invoicedAt: '2026-09-15T10:31:28.000Z', updatedAt: '2026-09-15T10:31:28.000Z',
  total: '243300.00', balance: '0.00', paymentType: 'contado', paymentMethod: null,
  customerId: 'test-cli-001', employeeId: 'test-emp-001',
  createdAt: '2026-09-15T08:00:00.000Z', cityId: '18001', address: null, phone: null,
  customer: { id: 'test-cli-001', firstName: 'CLIENTE', lastName: 'TEST UNO', document: '12345678', phone: '3001234567', country: '169', department: '18', city: '18001' },
}
export const ORDEN_INVOICED_2 = {
  id: 'test-ord-002', orderNumber: 3699, invoiceNumber: 4449, isInvoiced: true,
  invoicedAt: '2026-09-14T08:45:18.000Z', updatedAt: '2026-09-14T08:45:18.000Z',
  total: '180000.00', balance: '180000.00', paymentType: 'credito', paymentMethod: null,
  customerId: 'test-cli-002', employeeId: 'test-emp-001',
  createdAt: '2026-09-13T09:00:00.000Z', cityId: '41001', address: null, phone: null,
  customer: { id: 'test-cli-002', firstName: 'CLIENTE', lastName: 'TEST DOS', document: '87654321', phone: '3109876543', country: '169', department: '41', city: '41001' },
}
export const ORDEN_INVOICED_3 = {
  id: 'test-ord-003', orderNumber: 3698, invoiceNumber: 4436, isInvoiced: true,
  invoicedAt: '2026-09-12T08:12:51.000Z', updatedAt: '2026-09-12T08:12:51.000Z',
  total: '95000.00', balance: '0.00', paymentType: 'contado', paymentMethod: null,
  customerId: 'test-cli-003', employeeId: 'test-emp-002',
  createdAt: '2026-09-11T08:30:00.000Z', cityId: '73001', address: null, phone: null,
  customer: { id: 'test-cli-003', firstName: 'CLIENTE', lastName: 'TEST TRES', document: '11223344', phone: '3151234567', country: '169', department: '73', city: '73001' },
}
export const RESPONSE_INVOICED_1_PAGINA = { ok: true, data: [ORDEN_INVOICED_1, ORDEN_INVOICED_2, ORDEN_INVOICED_3], nextCursor: null }
export const RESPONSE_INVOICED_PAGINA_1_DE_2 = { ok: true, data: [ORDEN_INVOICED_1, ORDEN_INVOICED_2], nextCursor: { cursorDate: ORDEN_INVOICED_2.invoicedAt, cursorId: ORDEN_INVOICED_2.id } as UpTresCursor }
export const RESPONSE_INVOICED_PAGINA_2_DE_2 = { ok: true, data: [ORDEN_INVOICED_3], nextCursor: null }

export const ORDEN_UPDATED_1 = {
  id: 'test-ord-001', orderNumber: 3700, invoiceNumber: 4451, isInvoiced: true,
  invoicedAt: '2026-09-15T19:04:16.000Z', updatedAt: '2026-09-15T19:04:16.000Z',
  total: '243300.00', balance: '50000.00', paymentType: 'contado', paymentMethod: null,
  customerId: 'test-cli-001', employeeId: 'test-emp-001',
  createdAt: '2026-09-15T08:00:00.000Z', cityId: '18001', address: null, phone: null,
}
export const ORDEN_UPDATED_2 = {
  id: 'test-ord-002', orderNumber: 3699, invoiceNumber: 4450, isInvoiced: true,
  invoicedAt: '2026-09-15T10:31:28.000Z', updatedAt: '2026-09-15T10:31:28.000Z',
  total: '180000.00', balance: '180000.00', paymentType: 'credito', paymentMethod: null,
  customerId: 'test-cli-002', employeeId: 'test-emp-001',
  createdAt: '2026-09-13T09:00:00.000Z', cityId: '41001', address: null, phone: null,
}
export const RESPONSE_UPDATED_1_PAGINA = { ok: true, data: [ORDEN_UPDATED_1, ORDEN_UPDATED_2], nextCursor: null }
export const RESPONSE_UPDATED_PAGINA_1_DE_2 = { ok: true, data: [ORDEN_UPDATED_1], nextCursor: { cursorDate: ORDEN_UPDATED_1.updatedAt, cursorId: ORDEN_UPDATED_1.id } as UpTresCursor }
export const RESPONSE_UPDATED_PAGINA_2_DE_2 = { ok: true, data: [ORDEN_UPDATED_2], nextCursor: null }

export const ORDEN_DELETED_1 = { id: 'test-ord-del-001', orderNumber: 3695, deletedAt: '2026-09-15T14:00:00.000Z' }
export const ORDEN_DELETED_2 = { id: 'test-ord-del-002', orderNumber: 3694, deletedAt: '2026-09-14T10:00:00.000Z' }
export const RESPONSE_DELETED_1_PAGINA = { ok: true, data: [ORDEN_DELETED_1, ORDEN_DELETED_2], nextCursor: null }
export const RESPONSE_DELETED_PAGINA_1_DE_2 = { ok: true, data: [ORDEN_DELETED_1], nextCursor: { cursorDate: ORDEN_DELETED_1.deletedAt, cursorId: ORDEN_DELETED_1.id } as UpTresCursor }
export const RESPONSE_DELETED_PAGINA_2_DE_2 = { ok: true, data: [ORDEN_DELETED_2], nextCursor: null }

export const CAMPOS_REQUERIDOS_INVOICED = ['id','orderNumber','invoiceNumber','isInvoiced','invoicedAt','updatedAt','total','balance','customerId','employeeId','createdAt','cityId'] as const
export const CAMPOS_REQUERIDOS_UPDATED  = ['id','orderNumber','invoiceNumber','isInvoiced','invoicedAt','updatedAt','total','balance','customerId','employeeId','createdAt'] as const
export const CAMPOS_REQUERIDOS_DELETED  = ['id','orderNumber','deletedAt'] as const
