# Módulo — Cartera: Pagos + Comisiones
**Fecha:** 2026-05-22
**Commit:** f293cff
**Estado:** estable — tabla unificada + comisiones + valores congelados

---

## Tab Pagos

### Tabla unificada (móvil + desktop)
- Scroll horizontal — `min-w-[700px]` con `overflow-x-auto`
- Ordenada por más nueva (`orderBy: { createdAt: 'desc' }`)
- Filas alternadas: `i%2===0 ? rgba(8,8,28,0.70) : rgba(15,15,35,0.50)`

### Columnas
| Col | Fuente | Color |
|-----|--------|-------|
| Fecha | `createdAt` en Colombia | zinc-400 |
| #Recibo | `numeroRecibo` + botón 🖨️ → abre recibo | blue-400 |
| Factura | `numeroFactura` | zinc-300 mono |
| Cliente | `clienteNombre` (congelado) | white |
| Efectivo | sum lineasPago donde metodoPago='efectivo' | emerald-400 |
| Transf. | sum lineasPago donde metodoPago≠'efectivo' | blue-400 |
| Descuento | `descuento` | amber-400 |
| Nuevo Saldo | `saldoAnterior - monto - descuento` | zinc-300 |

### Totales al pie
- Efectivo total | Transf total | Descuento total

### Filtros
- **SelectorMes** — filtra por mes/año en la API (`?mes=5&anio=2026`)
- **Dropdown vendedor** — solo visible para admin (`ROLES_ADMIN`)
- API: `GET /api/recaudos?mes=X&anio=Y&vendedorId=Z&limit=500`

---

## Tab Comisiones (solo admin)

### Flujo
1. Selecciona mes con SelectorMes
2. Click "Cargar" → `GET /api/comisiones?mes=X&anio=Y`
3. Tabla editable: vendedor | recaudado | pagos | % (input) | fórmula (input) | comisión calculada
4. Al cambiar %, comisión se recalcula en tiempo real: `recaudado * porcentaje / 100`
5. Campo nombre: `ComisionMayo2026`
6. Botón "Guardar" → POST guardar_config + POST calcular
7. Muestra último cálculo guardado con fecha

### API comisiones
```
GET  /api/comisiones?mes=5&anio=2026
POST /api/comisiones { accion: 'guardar_config', vendedores: [...] }
POST /api/comisiones { accion: 'calcular', mes, anio, nombre, vendedores, formula }
```

### Modelos Prisma
- `ComisionConfig` — porcentaje + fórmula por vendedor/empresa @@unique([empresaId, empleadoId])
- `ComisionCalculo` — resultado guardado por mes/año @@unique([empresaId, mes, anio])

---

## Congelamiento de valores en recibo

### Al crear el pago (`pago-sync/route.ts`)
```typescript
// ANTES de la transacción, leer saldos actuales
saldoAnteriorTotal = sum(deudas.saldo)     // guardado en PagoCartera.saldoAnterior
valorFacturaTotal  = sum(deudas.valor)     // guardado en PagoCartera.valorFactura
clienteNombre      = cliente.nombre        // congelado
vendedorNombre     = empleado.nombre       // congelado
lineasPago         = [{metodoPago, monto}] // congelado
```

### En el recibo (`recibo-publico/route.ts`)
```typescript
// Prioridad: valor congelado > cálculo live
saldoAnterior = pago.saldoAnterior ?? (saldoNuevo + montoPago)
```

### Contador de recibos (`lib/consecutivo.ts`)
- Formato: `{iniciales}{AA}{MM}{NNN}` → ej: `CL2605001`
- Iniciales: primera + última letra del nombre (sin artículos)
- Contador por empleado en `Empleado.configRecibos.consecutivoActual`
- Se resetea cada mes (consecutivoMes cambia)
- Reset manual: `UPDATE Empleado SET configRecibos = jsonb_set(..., '{consecutivoActual}', '0')`

---

## Archivos
```
cartera.page.tsx         → UI completa — tabs Clientes/Pagos/Cartera/Comisiones
comisiones.route.ts      → GET/POST comisiones
recaudos.route.ts        → GET pagos con filtro mes/anio/vendedor
pago-sync.route.ts       → POST crear pago — congela saldoAnterior + valorFactura
recibo-publico.route.ts  → GET datos recibo por token — usa valores congelados
consecutivo.ts           → generador numeroRecibo por empleado/mes
```
