# APIs Externas — TuAgentX
> Fuente única de verdad para integraciones externas. Actualizar en cada sesión que toque estas APIs.
> Última actualización: 2026-09-14

---

## 1. UpTres ERP

**Base URL:** `https://serviceuptres.cloud/external/v1/api`
**Auth URL:** `https://serviceuptres.cloud/external/v1/auth/api`
**Archivo:** `lib/integracion/adapters/uptres.ts`
**Credenciales:** `apiKey` + `apiSecret` por empresa (tabla `Integracion`)

### Auth
```
POST /auth/api
Body: { apiKey, apiSecret }
Response: { ok, token }
```
- Token dura ~1h — cacheado en memoria 55min (`tokenCache` Map global)
- Headers: `x-api-key: {apiKey}` + `Authorization: Bearer {token}`
- Renovación automática mid-fetch si UpTres devuelve `{ msg: 'Token inválido' }`

### Paginación
- Cursor-based: `cursorDate` + `cursorId` en query params
- Respuesta: `nextCursor.cursorDate` + `nextCursor.cursorId`
- Sin nextCursor = última página
- `limit` máx recomendado: 100 (productos: 80)
- Guardia anti-loop: MAX_PAGINAS = 200
- Retry: 3 intentos con backoff 2s/4s

### Fechas — CRÍTICO
- UpTres entrega fechas con sufijo `Z` pero el valor YA es hora Bogotá (UTC-5), no UTC real
- **Nunca** usar `new Date(stringDeUptres)` directo
- Usar `parseFechaUptresBogota(str)` — suma 5h para obtener UTC real
- `from` en `/clientes`, `/cartera`, `/ordenes`, `/productos`: formato `YYYY-MM-DD` (Bogotá)
- `from` en `/empleados`: acepta ISO completo

### Endpoints

#### GET `/clientes`
```
?fields=id,firstName,lastName,document,email,phone,address,cityId,neighborhood,tradeName,updatedAt
&from=YYYY-MM-DD&limit=100
```
- `from` = fecha Bogotá (restar 5h antes de truncar)
- Soporta cursor

#### GET `/empleados`
```
?fields=id,firstName,lastName,document,email,phone,cityId,updatedAt
&from=YYYY-MM-DD&limit=100
```
- `from` acepta ISO completo

#### GET `/cartera`
```
?fields=id,orderNumber,invoiceNumber,electronicInvoiceNumber,customerId,employeeId,
total,balance,paymentType,creditDay,paidAt,createdAt,updatedAt,receivableAt
&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100
```
- Filtra por `createdAt` (fecha pedido), NO por `updatedAt`
- Delta: `from` = Bogotá - 1 día extra (overlap para capturar facturados hoy)

#### GET `/cartera/update`
```
?fields=...&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100
```
- Filtra por `receivableAt` (fecha pago/vencimiento)
- Usado en `fetchDeudasDesde` para delta de pagos

#### GET `/cartera/empleado/{empleadoApiId}`
```
?condition=true&fields=...&limit=100
```
- Solo deudas activas del vendedor

#### GET `/cartera/cliente/{clienteApiId}`
```
?condition=true|false&fields=...
```
- Sin paginación cursor

#### GET `/ordenes`
```
?fields=id,orderNumber,invoiceNumber,isInvoiced,invoicedAt,total,balance,paymentType,
paymentMethod,customerId,employeeId,createdAt,creditDay,cityId,address,phone,items
&expand=customer,items&from=YYYY-MM-DD&to=YYYY-MM-DD&condition=true|false&limit=100
```
- Traer `condition=true` + `condition=false` y deduplicar por `id`
- Ventana sync periódico: 10 días

#### GET `/ordenes/{id}`
```
?fields=...&expand=customer
```
- Orden única — usado en sync-delta retry (`fetchOrdenCompletaPorId`)

#### GET `/ordenes?orderNumber={n}&limit=1`
- Fallback cuando ID migró en UpTres

#### GET `/productos`
```
?condition=true&fields=&from=YYYY-MM-DD&limit=80
```
- `from` = `.toISOString().slice(0,10)` — ventana 65 min
- `fields=` vacío trae todos los campos

#### GET `/clienteslista`
```
?fields=id,name,nameUs,clientes,updatedAt&condition=true&from=YYYY-MM-DD&limit=100
```

#### GET `/proveedores`
```
?fields=id,firstName,lastName,document,documentType,verificationDigit,email,phone,
cityId,address,neighborhood,note,updatedAt&condition=true&from=YYYY-MM-DD&limit=100
```

#### GET `/ncventas` (Notas Crédito)
```
?fields=id,orderNumber,electronicNumber,cufe,cufeInvoice,customerName,...
&condition=true&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=80
```
- `cufeInvoice` = hash DIAN de la factura original (NO el `numeroFactura`)
- **PENDIENTE:** confirmar campo NC→invoice con UpTres para unir a `nSaldo`

### Campos especiales
- `electronicInvoiceNumber`: en `SyncDeuda.data` JSONB — no columna propia
- `cityId`: código DANE → `public/municipios_dane.json`
- `receivableAt`: fecha vencimiento explícita (prioridad > `createdAt + creditDay` > `paidAt`)
- `condition`: `true` = activa, `false` = cerrada/pagada

### Pendientes UpTres (bloqueados por ellos)
- Webhook support (eliminar polling)
- `/cartera` filtrado por `updatedAt` en vez de `createdAt`
- Confirmar campo NC→invoice para `nSaldo` crédito

---

## 2. Transprensa (transportadora)

**Base URL:** `https://transprensa.colombiasoftware.net/index.php`
**Archivo:** `lib/jobs/sync-transprensa.ts`
**Credenciales:** `usuario_login` + `usuario_password` (encriptado `UPTRES_SECRET`) en `Integracion.config`

### Auth
```
POST ?api=servicio.Seguridad.login
Content-Type: application/x-www-form-urlencoded
Body: usuario_login={}&usuario_password={}
Response: { success, data: { token } }
```
- Token caduca ~2 días — se obtiene fresco en cada sync
- Header: `Authorization: {token}` (sin "Bearer")

### Endpoints

#### POST Consultar remesa por número
```
?api=servicio.Consultas.remesas
Content-Type: application/json
Body: { numero_remesa: "...", pagina_numero: "1" }
Response: { success, data: [remesa] }
```
Campos clave:
- `numero_remesa`
- `estado_remesa`
- `estado_atencioncliente` → `ENTREGADO` | `NOVEDAD` | otros
- `lista_estado_atencioncliente[]` → historial estados
- `remesa_imagencumplido` → URL foto entrega
- `remesa_destinatario.destinataro_documento` (NIT destinatario — typo en la API)
- `remesa_detalle[].cantidad` (cajas)

#### POST Consultar por fecha + NIT
```
?api=servicio.Consultas.remesas
Body: { remesa_fechacreacion: "YYYY-MM-DD", cliente_nit: "{NIT}", pagina_numero: "1" }
```
- Usado en `autoAsignarGuias()` para match automático

### Flujo sync
1. Login → token
2. `autoAsignarGuias()`: órdenes sin guía + `num_cajas > 0` → match NIT+cajas o fuzzy nombre (score ≥ 0.6)
3. Consultar remesas en_transito/despachado/entregado con guía
4. Upsert `TransprensaRemesa`
5. Si `ENTREGADO` → `OrdenDespacho.estado = 'entregado'`

### Config por empresa (`Integracion.config`)
```json
{ "usuario_login": "...", "usuario_password": "(encriptado)", "nit_remitente": "..." }
```

---

## 3. Onurix (SMS)

**Endpoint envío:** `https://www.onurix.com/api/v1/sms/send`
**Endpoint estado:** `https://www.onurix.com/api/v1/general/message-state`
**Archivo:** `lib/notificaciones/sms.ts`
**Credenciales:** `ONURIX_CLIENT` + `ONURIX_KEY` (env vars)

### Enviar SMS
```
POST https://www.onurix.com/api/v1/sms/send
Content-Type: application/x-www-form-urlencoded
Body: client={}&key={}&phone={57XXXXXXXXXX}&sms={mensaje}
Response ok:    { status: 0, data: { id: "msgId" } }
Response error: { error: N, msg: "..." }
```
- Teléfono: normalizar a `57XXXXXXXXXX` (sin `+`, 12 dígitos)
- Mensaje: máx 140 caracteres
- Timeout: 15s

### Consultar estado SMS
```
GET ?client={}&key={}&id={msgId}
Response: { data: { state: "delivered"|"undelivered"|"failed"|... } }
```
Estados internos: `'entregado'` | `'fallido'` | `'pendiente'`

### Variables plantilla SMS
`{nombre}` (máx 25 chars) | `{factura}` | `{valor}` | `{vencimiento}`

### Pendiente
- Tab Postventa SMS: stats por cliente — requiere datos reales en `SmsLog`


---

## ACTUALIZACIONES — 2026-09-14 (confirmado con UpTres)

### Nuevos endpoints UpTres

#### GET `/ordenes/deleted`
```
GET /ordenes/deleted?from=YYYY-MM-DD&to=YYYY-MM-DD&limit=100
```
- Trae órdenes eliminadas en el rango
- Útil para marcar bajas en BD local y evitar deuda fantasma
- Soporta cursor (pendiente confirmar)

#### GET `/ordenes/date`
```
GET /ordenes/date?date={campo}&from=YYYY-MM-DD&to=YYYY-MM-DD&condition=true|false&limit=100
```
Param `date` acepta:
- `createdAt` — fecha creación pedido
- `updatedAt` — fecha última modificación
- `invoicedAt` — fecha facturación
- `deliveredAt` — fecha entrega
- `paidAt` — fecha pago
- `deletedAt` — fecha eliminación

Combina con `condition=true|false` para filtrar activas/cerradas.

**Caso de uso clave:** reemplaza la limitación actual de `/cartera` que solo filtra por `createdAt`. Con `date=updatedAt` se puede hacer un delta real de cambios — **pendiente implementar**.

### Campos confirmados en respuesta `/ordenes` con `expand=customer`
```json
{
  "customer": {
    "id": "...",
    "firstName": "DIEGO FERNANDO",
    "lastName": "RAMOS CARDENAS",
    "document": "77335537",
    "phone": "3115858526",
    "country": "169",
    "department": "41",
    "city": "41001"
  }
}
```
- `city` = código DANE directo (usar `municipiosDANE[city]`)
- `department` = código departamento (usar `departamentosDANE[department]`)
- `electronicInvoiceNumber`: puede venir como `0` (entero) cuando no aplica — tratar `0` como `null`

### Campos confirmados en `/cartera/update`
Respuesta incluye `receivableAt` como fecha ISO con sufijo Z (hora Bogotá — aplicar `parseFechaUptresBogota`)
