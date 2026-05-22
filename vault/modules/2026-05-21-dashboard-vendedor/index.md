# Módulo — Dashboard Vendedor
**Fecha:** 2026-05-21
**Commit:** 2485c7e
**Estado:** estable — Redis caché activo

---

## Qué hace
Dashboard principal del rol vendedor. Muestra estado del turno, KPIs del día y accesos directos.

---

## Lógica de visualización

**Sin turno activo:**
- Muestra saludo "Bienvenido, [nombre]"
- No muestra cards ni acciones

**Con turno activo:**
- Saludo oculto, contenido sube
- Muestra la estructura completa

---

## Estructura con turno activo

```
1. Card turno          → tiempo transcurrido + estado pausa + motivo
2. Botones acción      → 👁️ Visita | 💰 Venta | 💵 Recaudo | 📦 Entrega
3. Accesos directos    → 👥 Clientes | 💳 Pagos | 🔍 Trazabilidad
                         (todos con <Link prefetch> para carga instantánea)
4. Cards KPI (blur)
   ├── [👁 VISITAS hoy / ayer]  [📦 ÓRDENES desp / fact hoy]  ← grid 2 cols
   ├── [💼 VENTAS mes / meta]   ← ancho completo + ícono sync
   └── [💰 RECAUDO rec+desc / meta]  ← ancho completo
5. Impulsadoras hoy    → CumplimientoTabla con progreso de cada una
6. Estadísticas        → expandible, historial 6 días y 6 meses
7. Ruta del día        → lista de clientes ordenados
```

---

## API que consume

| Endpoint | Caché | Qué trae |
|----------|-------|----------|
| `/api/vendedor/stats` | Redis 10min `g:v:{userId}:{fecha}` | visitas hoy/ayer, órdenes, recaudo, metas, impulsadoras, historial |
| `/api/cartera/resumen` | Redis 5min `g:{empresa}:cartera:v:{id}:{mes}` | totalCartera, pendiente, recaudadoMes |
| `/api/rutas` | sin caché | ruta del día con clientes ordenados |

---

## Caché y sincronización

- Stats se invalidan automáticamente cuando el vendedor hace sync-ventas
- Ícono SyncIcon en card VENTAS invalida manualmente con `revalidateTag`
- SWR headers: `Cache-Control: private, s-maxage=30, stale-while-revalidate=60`

---

## Componentes usados

```
CardKPIGroup, CardCountAdmin  → cards KPI blur
CardDark, CardDarkStrong      → card turno y acciones
TabsNav                       → (en página padre)
SyncIcon                      → invalidar caché ventas
CumplimientoTabla             → impulsadoras
```

---

## Archivos

```
page.tsx                    → dashboard principal (UI + fetch)
vendedor-stats.route.ts     → API stats — Redis 10min + queries paralelas
cartera-resumen.route.ts    → API resumen cartera — Redis 5min
```

---

## Reglas de negocio importantes

- `vendedorScope(user)` filtra datos — vendedor solo ve los suyos
- Órdenes via `vendedorApiId` (id en UpTres), no por empleadoId local
- Metas desde `MetaRecaudo` y `MetaVenta` — modelos separados
- Recaudo = `pagoCartera.monto + pagoCartera.descuento` (incluye descuentos)
- NUNCA `new Date()` directo — usar `lib/fechas.ts`

