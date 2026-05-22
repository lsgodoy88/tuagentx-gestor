# Snapshot — Componentes 2026-05-21

**Estado:** estable — post Redis caché + PostgreSQL tuning
**Commit:** 2485c7e
**Total:** 27 archivos

---

## UI Primitivos — `ui/cards.tsx`

| Componente | Descripción | Estado |
|------------|-------------|--------|
| `CardKPIGroup` | Wrapper grid para grupos de KPIs. Maneja el blur compartido. Siempre envuelve a CardKPI o CardCountAdmin. Props: `cols` (2\|4) | ✅ |
| `CardKPI` | Glass blur genérico. Contenedor libre para cualquier KPI. Props: `stagger`, `className`, `center` | ✅ |
| `CardCountAdmin` | Glass blur admin con estructura fija: icono + label + valor primario / valor secundario + sublabels. Props: `stagger`, `icon`, `label`, `primary`, `secondary`, `primaryLabel`, `secondaryLabel`, `primaryColor`, `compact` | ⛔ CONGELADO |
| `CardDark` | Contenedor dark azul para listas y módulos. `rgba(8,8,28,0.82)` con borde azul tenue | ✅ |
| `CardDarkStrong` | Igual a CardDark pero con borde más visible. Para turno activo y acciones | ✅ |
| `CardSub` | Sub-item dentro de CardDark. Prop `alerta` activa fondo rojo para alertas | ✅ |

---

## Visuales / Display

| Componente | Descripción |
|------------|-------------|
| `BadgePct.tsx` | Badge circular de porcentaje. Usado en cumplimiento de impulsadoras. Cambia color según rango (verde/amarillo/rojo) |
| `CarteraCard.tsx` | Card de deuda por cliente. Muestra saldo pendiente, días de mora, botón pagar |
| `ClienteCard.tsx` | Card cliente genérico con nombre, NIT, ciudad, teléfono |
| `ClienteCardRol.tsx` | Card cliente con contexto de rol — vendedor ve info de cobranza, bodega ve info de despacho |
| `EntregaCard.tsx` | Card de orden de entrega con estado y número de factura |
| `TarjetaVisita.tsx` | Card de visita registrada. Muestra tipo (visita/venta/cobro/entrega), monto, hora, GPS |
| `CumplimientoTabla.tsx` | Tabla de cumplimiento de impulsadoras — puntos visitados vs total, % con BadgePct |
| `DataTable.tsx` | Tabla genérica reutilizable con columnas configurables, ordenamiento y paginación |

---

## Modales / Acciones

| Componente | Descripción |
|------------|-------------|
| `ModalVisita.tsx` | Modal principal para registrar visita/venta/cobro/entrega. Integra GPS, firma digital, búsqueda de cliente. Tipos: visita👁️ venta💰 cobro💵 entrega📦 |
| `ModalEscaner.tsx` | Escáner de código QR y barras. Usa cámara del dispositivo. Para identificar clientes o productos |
| `FirmaCanvas.tsx` | Canvas HTML5 para captura de firma digital. Se guarda en R2 y se referencia por URL |

---

## Mapas / GPS

| Componente | Descripción |
|------------|-------------|
| `MapaEnVivo.tsx` | Mapa Leaflet en vivo. Muestra vendedores con colores por empleado, líneas de ruta, labels I/F/1/2/3 para inicio/fin/paradas |
| `GpsIndicator.tsx` | Indicador visual del estado GPS: buscando / encontrado / error. Con dot animado |
| `useGpsEnDemanda.ts` | Hook para solicitar GPS solo cuando se necesita (no siempre activo). Evita batería y permisos innecesarios |

---

## Funcionales / UX

| Componente | Descripción |
|------------|-------------|
| `AsistenteGestor.tsx` | Chat IA embebido en el gestor. Contexto de rutas, visitas, empleados, clientes, cartera. Historial persistente en BD (AsistenteChat) |
| `InputMoneda.tsx` | Input con formato automático pesos COP (punto como separador de miles). Guarda valor numérico limpio |
| `SelectorMes.tsx` | Selector de mes + año con navegación ±1. Usado en módulo Metas y reportes |
| `TabsNav.tsx` | Navegación por tabs unificada. Ancho igual por tab (flex-1), misma altura mobile/desktop |
| `SyncIcon.tsx` | Ícono de sincronización con estado (idle/cargando/ok/error). Invalida caché Redis al hacer clic |
| `NetworkBanner.tsx` | Banner que aparece cuando no hay conexión a internet. Persiste hasta reconectar |
| `PermisosGuard.tsx` | Guard que solicita permisos GPS y notificaciones push al vendedor. Bloquea flujo hasta obtenerlos |
| `VersionFooter.tsx` | Footer con versión del build, commit y fecha. Visible en panel admin |

---

## Negocio / Reportes

| Componente | Descripción |
|------------|-------------|
| `Cotizador.tsx` | Módulo cotizador de productos con precios por rol (PrecioRol) |
| `PlanesDinamicos.tsx` | Selector de planes con precios dinámicos para upgrade de empresa |
| `ReportePDFBtn.tsx` | Botón que genera y descarga reporte PDF del período seleccionado |
| `FX.tsx` | Animaciones y efectos: CountUp (número animado), LiveDot (punto pulsante en vivo), fade-up |

---

## Dependencias comunes

Casi todos los componentes dependen de:
```
lib/fetchApi.ts       → wrapper fetch con manejo de errores
lib/gps-context.tsx   → contexto GPS global
lib/fechas.ts         → helper fechas Bogotá
components/ui/cards.tsx → sistema de cards
```
