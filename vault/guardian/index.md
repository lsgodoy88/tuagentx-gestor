# Guardián de Lógica — TuAgentX Gestor
**Última actualización: 2026-05-23**

## Concepto

El guardián documenta las reglas de negocio exactas que deben cumplirse en cada módulo.
Cuando se dice "guarda esa lógica", se agrega aquí como un contrato inmutable.
Cuando se implementa el test correspondiente, se marca como ✅ cubierto.

Formato de cada regla:
```
### [MÓDULO] Nombre de la regla
- Qué debe mostrar el usuario
- Por qué (fuente de verdad)
- Cómo se calcula
- Campo(s) clave
- Estado: 📝 documentado | ✅ con test | ❌ roto
```

---

## DASHBOARD VENDEDOR

### [VENTAS] montoMes = solo órdenes facturadas en UpTres
- **Muestra:** `$31.691.350` (monto de ventas del mes)
- **Fuente:** UpTres `isInvoiced = true`
- **Cálculo:** `SUM(totalOrden) WHERE vendedorApiId = miApiId AND fechaOrden >= inicioMes AND isFacturada = true`
- **Campo clave:** `OrdenDespacho.isFacturada` (sincronizado desde `isInvoiced` de UpTres)
- **NO usar:** `COUNT(*)` sin filtro, ni `fechaOrden` sin `isFacturada`
- **Estado:** ✅ con test — `tests/guardian/dashboard-vendedor.test.ts`

---

### [ÓRDENES] factHoy = órdenes donde UpTres las facturó HOY
- **Muestra:** `6 fact hoy`
- **Fuente:** UpTres `invoicedAt` — fecha exacta de facturación (≠ createdAt ≠ fechaOrden)
- **Cálculo:** `COUNT(*) WHERE vendedorApiId = miApiId AND fechaFactura >= inicioDia AND fechaFactura < finDia`
- **Campo clave:** `OrdenDespacho.fechaFactura` (sincronizado desde `invoicedAt` de UpTres)
- **NO usar:** `fechaOrden` (es cuando el vendedor creó la orden, puede ser ayer)
- **NO usar:** `isFacturada` (es un booleano, no filtra por día)
- **NO usar:** `createdAt` (es cuando el sync insertó el registro, no cuando se facturó)
- **Lección:** UpTres tiene tres fechas distintas:
  - `createdAt` → cuando se creó la orden
  - `fechaOrden` → fecha de la orden en el sistema
  - `invoicedAt` → cuando se facturó (la correcta para factHoy)
- **Estado:** ✅ con test — `tests/guardian/dashboard-vendedor.test.ts`

---

### [ÓRDENES] despHoy = órdenes despachadas o entregadas HOY
- **Muestra:** `X desp hoy`
- **Cálculo:** `COUNT(*) WHERE estado IN ('despachado','entregado') AND fechaOrden >= inicioDia AND fechaOrden < finDia`
- **Campo clave:** `OrdenDespacho.estado` + `fechaOrden`
- **Estado:** 📝 documentado

---

### [TURNO] inicio nunca en el futuro
- **Regla:** `turno.inicio <= NOW()` siempre
- **Causa histórica del bug:** Prisma `@default(now())` con drift de timezone entre cliente y servidor
- **Fix:** pasar `inicio: nowBogota()` explícito en el create del turno
- **Estado:** ✅ con test — `tests/guardian/dashboard-vendedor.test.ts`

---

### [SYNC] botón sync actualiza card VENTAS con datos de UpTres
- **Flujo:** botón → `/api/vendedor/ventas-live` → UpTres directo → actualiza montoMes en UI
- **Campo clave:** `o.empleado.uid === miApiId` (NO `o.empleadoId` ni `o.vendedorApiId`)
- **En paralelo:** `/api/vendedor/sync-ventas` → insert-only a BD (no bloquea UI)
- **Cache:** invalidar con `fechaHoyBogota()` — misma key que stats usa
- **Estado:** 📝 documentado

---

## RECIBOS DE CAJA

### [RECIBO] valores congelados al momento del pago
- **Regla:** `saldoAnterior`, `valorFactura`, `clienteNombre`, `vendedorNombre` se guardan
  en el momento exacto del pago, ANTES de aplicar descuentos
- **NO recalcular** en tiempo real — el recibo debe ser inmutable
- **Campo clave:** `PagoCartera.saldoAnterior`, `PagoCartera.clienteNombre` (congelados)
- **Estado:** 📝 documentado

---

## SYNC BODEGA (UpTres → BD)

### [SYNC] isFacturada viene de isInvoiced de UpTres
- **Regla:** `OrdenDespacho.isFacturada = orden.isInvoiced === true`
- **Campo en adapter:** `isInvoiced` debe estar en `fields` del fetchVentas
- **Lección:** si no está en `fields`, UpTres no lo devuelve y siempre queda `false`
- **Estado:** 📝 documentado

### [SYNC] fechaFactura viene de invoicedAt de UpTres
- **Regla:** `OrdenDespacho.fechaFactura = new Date(orden.invoicedAt)`
- **Distinguir:**
  - `invoicedAt` → cuándo se facturó en UpTres ← usar esto
  - `createdAt`  → cuándo se creó la orden
  - `fechaOrden` → fecha del pedido
- **Estado:** 📝 documentado

---

## REGLAS GENERALES

### Timezone siempre Bogotá (UTC-5)
- **NUNCA** `new Date()` directo — usar `nowBogota()` de `lib/fechas.ts`
- **NUNCA** `new Date().toISOString().split('T')[0]` para keys de cache — usar `fechaHoyBogota()`
- **Razón:** servidor en UTC, usuarios en Bogotá — sin ajuste los días no coinciden

### Cache keys deben ser consistentes
- Stats usa: `g:v:{userId}:{fechaHoyBogota()}`
- Sync invalida: `g:v:{userId}:{fechaHoyBogota()}`
- Si difieren → sync invalida key equivocada → cache no se refresca

