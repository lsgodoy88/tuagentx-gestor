// Types y constantes UI-only del módulo Egresos

export const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
export const MEDIOS = ['BANCO','NEQUI','DAVIPLATA','EFECTIVO','TRANSFERENCIA','PSE']

export function filaVacia(categoria: string) {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })
  return { id: null as string | null, fecha: '', concepto: '', valor: '', retencion: '', abonoPago: '', descuento: '', saldo: '', fechaPago: '', medioPago: '', estado: 'pendiente', autorizado: false, categoria, evidenciaKey: '', abonosCount: 0, esNueva: true }
}
export type Fila = ReturnType<typeof filaVacia>

export type Categoria = { id: string; key: string; label: string; emoji: string }
