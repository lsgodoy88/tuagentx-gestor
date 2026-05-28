--
-- PostgreSQL database dump
--

\restrict eqcp0l61gf2RDXpC8v8qLDBq4UGzrd6qtEnHDOMXpUZrv6l2mTWbNbx3gUfIpcz

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: gestor; Type: SCHEMA; Schema: -; Owner: evolution
--

CREATE SCHEMA gestor;


ALTER SCHEMA gestor OWNER TO evolution;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AsistenteChat; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."AsistenteChat" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    rol text NOT NULL,
    texto text NOT NULL,
    "creadoEn" timestamp without time zone DEFAULT now()
);


ALTER TABLE gestor."AsistenteChat" OWNER TO evolution;

--
-- Name: AuditLog; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."AuditLog" (
    id text NOT NULL,
    accion text NOT NULL,
    usuario text,
    detalle text,
    "empleadoId" text,
    "empresaId" text,
    ip text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor."AuditLog" OWNER TO evolution;

--
-- Name: Cartera; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Cartera" (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "clienteId" text NOT NULL,
    "empresaId" text NOT NULL,
    "saldoTotal" numeric(12,2) DEFAULT 0,
    "saldoPendiente" numeric(12,2) DEFAULT 0,
    fuente text DEFAULT 'manual'::text,
    "updatedAt" timestamp without time zone DEFAULT now(),
    "createdAt" timestamp without time zone DEFAULT now(),
    celular text,
    "empleadoId" text
);


ALTER TABLE gestor."Cartera" OWNER TO evolution;

--
-- Name: CarteraCache; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."CarteraCache" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    "integracionId" text NOT NULL,
    "clienteId" text,
    "clienteApiId" text NOT NULL,
    nombre text NOT NULL,
    nit text,
    telefono text,
    ciudad text,
    "saldoTotal" numeric(14,2) NOT NULL,
    "saldoPendiente" numeric(14,2) NOT NULL,
    "porEstado" jsonb,
    deudas jsonb,
    "totalDeudas" integer DEFAULT 0 NOT NULL,
    "ultimaActualizacion" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ultimaConsulta" timestamp(3) without time zone,
    "saldoValidado" boolean DEFAULT false NOT NULL,
    "empleadoExternalId" text,
    "empleadoNombre" text
);


ALTER TABLE gestor."CarteraCache" OWNER TO evolution;

--
-- Name: Cliente; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Cliente" (
    id text NOT NULL,
    nombre text NOT NULL,
    "nombreComercial" text,
    direccion text,
    telefono text,
    email text,
    lat double precision,
    lng double precision,
    "ubicacionReal" boolean DEFAULT false NOT NULL,
    "empresaId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "metaVenta" double precision,
    nit character varying(255),
    ciudad character varying(255),
    "listaId" text,
    "apiId" text,
    maps text,
    "latTmp" double precision,
    "lngTmp" double precision,
    "subEmpresaId" text,
    departamento character varying(255)
);


ALTER TABLE gestor."Cliente" OWNER TO evolution;

--
-- Name: ComisionCalculo; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."ComisionCalculo" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    nombre text NOT NULL,
    mes integer NOT NULL,
    anio integer NOT NULL,
    formula text,
    resultados jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor."ComisionCalculo" OWNER TO evolution;

--
-- Name: ComisionConfig; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."ComisionConfig" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    "empleadoId" text NOT NULL,
    porcentaje numeric(5,2) DEFAULT 0 NOT NULL,
    formula text DEFAULT 'recaudado * porcentaje / 100'::text,
    activo boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE gestor."ComisionConfig" OWNER TO evolution;

--
-- Name: DespachoLog; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."DespachoLog" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    "origenVinculadaId" text,
    "numeroFactura" text NOT NULL,
    "clienteNombre" text,
    modo text NOT NULL,
    "guiaTransporte" text,
    transportadora text,
    "despachadoEl" timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE gestor."DespachoLog" OWNER TO evolution;

--
-- Name: DetalleCartera; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."DetalleCartera" (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "carteraId" text NOT NULL,
    "numeroFactura" text,
    valor numeric(12,2) NOT NULL,
    "fechaVencimiento" date,
    estado text DEFAULT 'pendiente'::text,
    "createdAt" timestamp without time zone DEFAULT now(),
    celular text,
    concepto text,
    "valorFactura" numeric(12,2),
    abonos numeric(12,2) DEFAULT 0,
    "empleadoId" text
);


ALTER TABLE gestor."DetalleCartera" OWNER TO evolution;

--
-- Name: Empleado; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Empleado" (
    id text NOT NULL,
    nombre text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    telefono text,
    rol text DEFAULT 'vendedor'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "vendedorId" text,
    "empresaId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "puedeCapturarGps" boolean DEFAULT false NOT NULL,
    ciudades text[] DEFAULT ARRAY[]::text[],
    permisos jsonb DEFAULT '{}'::jsonb,
    etiqueta text,
    "uptresEmail" text,
    "uptresPassword" text,
    "configRecibos" jsonb DEFAULT '{"prefijo": null, "anchoPapel": null, "consecutivoMes": null, "consecutivoActual": 0, "usarConfigEmpresa": true}'::jsonb,
    "subEmpresaId" text,
    "apiId" text,
    "metaVenta" double precision
);


ALTER TABLE gestor."Empleado" OWNER TO evolution;

--
-- Name: EmpleadoLista; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."EmpleadoLista" (
    "empleadoId" text NOT NULL,
    "listaId" text NOT NULL
);


ALTER TABLE gestor."EmpleadoLista" OWNER TO evolution;

--
-- Name: Empresa; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Empresa" (
    id text NOT NULL,
    nombre text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    plan text DEFAULT 'basico'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    "maxSupervisores" integer DEFAULT 1 NOT NULL,
    "maxVendedores" integer DEFAULT 1 NOT NULL,
    "maxEntregas" integer DEFAULT 0 NOT NULL,
    "maxImpulsadoras" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "planFin" timestamp without time zone,
    telefono character varying(20),
    "modoEquipo" text,
    "horaInicioRuta" text DEFAULT '06:00'::text NOT NULL,
    "horaFinRuta" text DEFAULT '20:00'::text NOT NULL,
    "configRecibos" jsonb DEFAULT '{"nit": null, "logo": null, "prefijo": "REC", "telefono": null, "direccion": null, "anchoPapel": "80mm"}'::jsonb,
    "autoCerrarRuta" boolean DEFAULT false NOT NULL,
    "autoCrearRuta" boolean DEFAULT false NOT NULL,
    "diasCerrarRuta" text DEFAULT '0,1,2,3,4'::text NOT NULL,
    "diasCrearRuta" text DEFAULT '0,1,2,3,4'::text NOT NULL,
    "ciudadEntregaLocal" text,
    "diasHistorialBodega" integer DEFAULT 7 NOT NULL,
    "maxBodega" integer DEFAULT 0 NOT NULL,
    "bodegaPuedeEnviar" boolean DEFAULT false NOT NULL,
    "ultimaSyncBodega" timestamp(3) without time zone,
    "syncVentasHoy" integer DEFAULT 0,
    "syncVentasFecha" timestamp(3) without time zone,
    "syncVentasUltimo" timestamp(3) without time zone
);


ALTER TABLE gestor."Empresa" OWNER TO evolution;

--
-- Name: EmpresaVinculada; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."EmpresaVinculada" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    nombre text NOT NULL,
    "apiKey" text NOT NULL,
    color text DEFAULT '#8b5cf6'::text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "empresaClienteId" text
);


ALTER TABLE gestor."EmpresaVinculada" OWNER TO evolution;

--
-- Name: InciGuardian; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."InciGuardian" (
    id text NOT NULL,
    codigo text NOT NULL,
    contrato text NOT NULL,
    modulo text NOT NULL,
    descripcion text NOT NULL,
    obtenido text NOT NULL,
    estado text DEFAULT 'ACTIVO'::text NOT NULL,
    "accionTomada" text,
    "scoreAntes" integer,
    "scoreDespues" integer,
    "fechaInicio" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "fechaResolucion" timestamp(3) without time zone,
    "empresaId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    proyecto text DEFAULT 'Gestor'::text NOT NULL
);


ALTER TABLE gestor."InciGuardian" OWNER TO evolution;

--
-- Name: Integracion; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Integracion" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    "subEmpresaId" text,
    nombre text NOT NULL,
    tipo text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    config jsonb,
    "ultimaSync" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "syncInicial" boolean DEFAULT false NOT NULL,
    "ultimaSyncCompleta" timestamp(3) without time zone
);


ALTER TABLE gestor."Integracion" OWNER TO evolution;

--
-- Name: ListaClientes; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."ListaClientes" (
    id text NOT NULL,
    nombre text NOT NULL,
    "empresaId" text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now()
);


ALTER TABLE gestor."ListaClientes" OWNER TO evolution;

--
-- Name: MetaRecaudo; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."MetaRecaudo" (
    id text NOT NULL,
    "empleadoId" text NOT NULL,
    "empresaId" text NOT NULL,
    mes integer NOT NULL,
    anio integer NOT NULL,
    "metaPesos" numeric(14,2) NOT NULL,
    "metaPct" numeric(5,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE gestor."MetaRecaudo" OWNER TO evolution;

--
-- Name: MetaVenta; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."MetaVenta" (
    id text NOT NULL,
    "empleadoId" text NOT NULL,
    "empresaId" text NOT NULL,
    mes integer NOT NULL,
    anio integer NOT NULL,
    "metaPesos" numeric(14,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE gestor."MetaVenta" OWNER TO evolution;

--
-- Name: OrdenDespacho; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."OrdenDespacho" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    origen text NOT NULL,
    "origenId" text,
    "numeroOrden" text NOT NULL,
    "clienteNombre" text NOT NULL,
    "clienteNit" text,
    ciudad text,
    direccion text,
    telefono text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    "fotoAlistamiento" text,
    "alistadoEl" timestamp(3) without time zone,
    "alistadoPorId" text,
    "repartidorId" text,
    "firmaEntrega" text,
    "fotoEntrega" text,
    "entregadoEl" timestamp(3) without time zone,
    transportadora text,
    "guiaTransporte" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "fechaOrden" timestamp(3) without time zone,
    "fotosAlistamiento" jsonb,
    "origenVinculadaId" text,
    "clienteApiId" text,
    "numeroFactura" text,
    "vendedorApiId" text,
    "totalOrden" numeric(14,2),
    "isFacturada" boolean DEFAULT false NOT NULL,
    "fechaFactura" timestamp(3) without time zone,
    "isActiva" boolean DEFAULT true NOT NULL
);


ALTER TABLE gestor."OrdenDespacho" OWNER TO evolution;

--
-- Name: OrdenDespacho_fechaFactura_backup_20260525; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."OrdenDespacho_fechaFactura_backup_20260525" (
    id text,
    "origenId" text,
    "fechaOrden" timestamp(3) without time zone,
    "fechaFactura" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone
);


ALTER TABLE gestor."OrdenDespacho_fechaFactura_backup_20260525" OWNER TO evolution;

--
-- Name: PagoCartera; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."PagoCartera" (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    "carteraId" text,
    "empleadoId" text NOT NULL,
    monto numeric(12,2) NOT NULL,
    descuento numeric(12,2) DEFAULT 0,
    tipo text DEFAULT 'abono'::text,
    metodopago text DEFAULT 'efectivo'::text,
    notas text,
    "reciboUrl" text,
    "createdAt" timestamp without time zone DEFAULT now(),
    "numeroRecibo" text,
    "reciboToken" text,
    "tokenExpira" timestamp(3) without time zone,
    "voucherDatosIA" jsonb,
    "voucherKey" text,
    "envioEstado" text DEFAULT 'pendiente'::text NOT NULL,
    "envioFecha" timestamp(3) without time zone,
    "envioRef" text,
    "envioVariacion" jsonb,
    "syncDeudaId" text,
    "lineasPago" jsonb,
    "gpsAccuracy" double precision,
    "latCobro" double precision,
    "lngCobro" double precision,
    "fechaPago" timestamp(3) without time zone,
    "numeroFactura" integer,
    "saldoAnterior" numeric(14,2),
    "clienteApiId" text,
    "clienteNombre" text,
    "valorFactura" numeric(14,2),
    "vendedorNombre" text
);


ALTER TABLE gestor."PagoCartera" OWNER TO evolution;

--
-- Name: PagoCarteraDeuda; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."PagoCarteraDeuda" (
    id text NOT NULL,
    "pagoId" text NOT NULL,
    "syncDeudaId" text NOT NULL,
    "numeroFactura" integer,
    "externalId" text,
    "montoAplicado" numeric(14,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor."PagoCarteraDeuda" OWNER TO evolution;

--
-- Name: PrecioRol; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."PrecioRol" (
    id text NOT NULL,
    rol text NOT NULL,
    precio integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE gestor."PrecioRol" OWNER TO evolution;

--
-- Name: PushSuscripcion; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."PushSuscripcion" (
    id text NOT NULL,
    "empleadoId" text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor."PushSuscripcion" OWNER TO evolution;

--
-- Name: Ruta; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Ruta" (
    id text NOT NULL,
    nombre text NOT NULL,
    fecha timestamp(3) without time zone,
    "empresaId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cerrada boolean DEFAULT false NOT NULL,
    "cerradaEl" timestamp(3) without time zone,
    "subEmpresaId" text,
    "empresaVinculadaId" text
);


ALTER TABLE gestor."Ruta" OWNER TO evolution;

--
-- Name: RutaCliente; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."RutaCliente" (
    id text NOT NULL,
    "rutaId" text NOT NULL,
    "clienteId" text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    rezago boolean DEFAULT false NOT NULL,
    "asignadoEn" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "supervisorId" text,
    "supervisorEtiqueta" text,
    ejecutado boolean DEFAULT false NOT NULL,
    notas text
);


ALTER TABLE gestor."RutaCliente" OWNER TO evolution;

--
-- Name: RutaEmpleado; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."RutaEmpleado" (
    id text NOT NULL,
    "rutaId" text NOT NULL,
    "empleadoId" text NOT NULL
);


ALTER TABLE gestor."RutaEmpleado" OWNER TO evolution;

--
-- Name: RutaFija; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."RutaFija" (
    id text NOT NULL,
    nombre text NOT NULL,
    "diaSemana" integer NOT NULL,
    "empresaId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "subEmpresaId" text
);


ALTER TABLE gestor."RutaFija" OWNER TO evolution;

--
-- Name: RutaFijaCliente; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."RutaFijaCliente" (
    id text NOT NULL,
    "rutaFijaId" text NOT NULL,
    "clienteId" text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    "metaVenta" double precision,
    "latImpulso" double precision,
    "latVendedor" double precision,
    "lngImpulso" double precision,
    "lngVendedor" double precision
);


ALTER TABLE gestor."RutaFijaCliente" OWNER TO evolution;

--
-- Name: RutaFijaEmpleado; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."RutaFijaEmpleado" (
    id text NOT NULL,
    "rutaFijaId" text NOT NULL,
    "empleadoId" text NOT NULL
);


ALTER TABLE gestor."RutaFijaEmpleado" OWNER TO evolution;

--
-- Name: SubEmpresa; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."SubEmpresa" (
    id text NOT NULL,
    "empresaId" text NOT NULL,
    nombre text NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "configRecibos" jsonb DEFAULT '{"nit": null, "logo": null, "prefijo": "REC", "telefono": null, "direccion": null, "anchoPapel": "80mm"}'::jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE gestor."SubEmpresa" OWNER TO evolution;

--
-- Name: SupervisorVendedor; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."SupervisorVendedor" (
    "supervisorId" text NOT NULL,
    "vendedorId" text NOT NULL
);


ALTER TABLE gestor."SupervisorVendedor" OWNER TO evolution;

--
-- Name: SyncCompra; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."SyncCompra" (
    id text NOT NULL,
    "integracionId" text NOT NULL,
    "externalId" text NOT NULL,
    "clienteApiId" text NOT NULL,
    "empleadoExternalId" text,
    "numeroOrden" integer,
    "numeroFactura" integer,
    valor numeric(14,2) NOT NULL,
    saldo numeric(14,2) DEFAULT 0 NOT NULL,
    abono numeric(14,2) DEFAULT 0 NOT NULL,
    tipo text,
    "diasCredito" integer,
    facturado boolean DEFAULT false NOT NULL,
    fecha timestamp(3) without time zone,
    "fechaVencimiento" timestamp(3) without time zone,
    nameciudad text,
    condition boolean DEFAULT true NOT NULL,
    data jsonb,
    "modificadoEn" timestamp(3) without time zone,
    "sincronizadoEl" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor."SyncCompra" OWNER TO evolution;

--
-- Name: SyncDeuda; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."SyncDeuda" (
    id text NOT NULL,
    "integracionId" text NOT NULL,
    "externalId" text NOT NULL,
    "clienteApiId" text NOT NULL,
    "empleadoExternalId" text,
    "numeroOrden" integer,
    "numeroFactura" integer,
    valor numeric(14,2) NOT NULL,
    saldo numeric(14,2) NOT NULL,
    abono numeric(14,2) DEFAULT 0 NOT NULL,
    "diasCredito" integer,
    "fechaVencimiento" timestamp(3) without time zone,
    condition boolean DEFAULT true NOT NULL,
    data jsonb,
    "modificadoEn" timestamp(3) without time zone,
    "sincronizadoEl" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "saldoAnterior" numeric(14,2),
    "externalUpdatedAt" timestamp(3) without time zone
);


ALTER TABLE gestor."SyncDeuda" OWNER TO evolution;

--
-- Name: SyncEmpleado; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."SyncEmpleado" (
    id text NOT NULL,
    "integracionId" text NOT NULL,
    "externalId" text NOT NULL,
    nombre text NOT NULL,
    data jsonb,
    "modificadoEn" timestamp(3) without time zone
);


ALTER TABLE gestor."SyncEmpleado" OWNER TO evolution;

--
-- Name: SyncLog; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."SyncLog" (
    id text NOT NULL,
    "integracionId" text NOT NULL,
    inicio timestamp(3) without time zone NOT NULL,
    fin timestamp(3) without time zone,
    "clientesActualizados" integer DEFAULT 0 NOT NULL,
    "comprasSincronizadas" integer DEFAULT 0 NOT NULL,
    "deudasSincronizadas" integer DEFAULT 0 NOT NULL,
    errores jsonb,
    estado text DEFAULT 'ok'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "disparadoPor" text DEFAULT 'cron'::text NOT NULL,
    "duracionMs" integer,
    "empleadosSincronizados" integer DEFAULT 0 NOT NULL,
    "pagosConfrontados" integer DEFAULT 0 NOT NULL,
    zombis integer DEFAULT 0 NOT NULL
);


ALTER TABLE gestor."SyncLog" OWNER TO evolution;

--
-- Name: Turno; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Turno" (
    id text NOT NULL,
    "empleadoId" text NOT NULL,
    inicio timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fin timestamp(3) without time zone,
    "latInicio" double precision,
    "lngInicio" double precision,
    "latFin" double precision,
    "lngFin" double precision,
    activo boolean DEFAULT true NOT NULL,
    "pausaDuracionMin" integer,
    "pausaInicio" timestamp(3) without time zone,
    "pausaMotivo" text,
    pausado boolean DEFAULT false NOT NULL
);


ALTER TABLE gestor."Turno" OWNER TO evolution;

--
-- Name: VentaMesCliente; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."VentaMesCliente" (
    id text NOT NULL,
    "clienteId" text NOT NULL,
    "empresaId" text NOT NULL,
    mes text NOT NULL,
    "totalVenta" double precision DEFAULT 0 NOT NULL,
    "cantidadVisitas" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE gestor."VentaMesCliente" OWNER TO evolution;

--
-- Name: Visita; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor."Visita" (
    id text NOT NULL,
    "empleadoId" text NOT NULL,
    "clienteId" text NOT NULL,
    "turnoId" text,
    lat double precision,
    lng double precision,
    nota text,
    foto text,
    tipo text DEFAULT 'visita'::text NOT NULL,
    monto double precision,
    "fechaBogota" timestamp(3) without time zone,
    "esLibre" boolean DEFAULT false NOT NULL,
    factura text,
    firma text,
    "rutaFijaClienteId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ordenDespachoId" text
);


ALTER TABLE gestor."Visita" OWNER TO evolution;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE gestor._prisma_migrations OWNER TO evolution;

--
-- Name: nc_api_tokens; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_api_tokens (
    id integer NOT NULL,
    base_id character varying(20),
    db_alias character varying(255),
    description character varying(255),
    permissions text,
    token text,
    expiry character varying(255),
    enabled boolean DEFAULT true,
    fk_user_id character varying(20),
    fk_workspace_id character varying(20),
    fk_sso_client_id character varying(20),
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_api_tokens OWNER TO evolution;

--
-- Name: nc_api_tokens_id_seq; Type: SEQUENCE; Schema: gestor; Owner: evolution
--

CREATE SEQUENCE gestor.nc_api_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE gestor.nc_api_tokens_id_seq OWNER TO evolution;

--
-- Name: nc_api_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: gestor; Owner: evolution
--

ALTER SEQUENCE gestor.nc_api_tokens_id_seq OWNED BY gestor.nc_api_tokens.id;


--
-- Name: nc_audit_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_audit_v2 (
    id uuid NOT NULL,
    "user" character varying(255),
    ip character varying(255),
    source_id character varying(20),
    base_id character varying(20),
    fk_model_id character varying(20),
    row_id character varying(255),
    op_type character varying(255),
    op_sub_type character varying(255),
    status character varying(255),
    description text,
    details text,
    fk_user_id character varying(20),
    fk_ref_id character varying(20),
    fk_parent_id uuid,
    fk_workspace_id character varying(20),
    fk_org_id character varying(20),
    user_agent text,
    version smallint DEFAULT 0,
    old_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_audit_v2 OWNER TO evolution;

--
-- Name: nc_automation_executions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_automation_executions (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_workflow_id character varying(20) NOT NULL,
    workflow_data text,
    execution_data text,
    finished boolean DEFAULT false,
    started_at timestamp(6) with time zone,
    finished_at timestamp(6) with time zone,
    status character varying(50),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    resume_at timestamp(6) with time zone,
    error_notified_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_automation_executions OWNER TO evolution;

--
-- Name: nc_automation_subscribers; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_automation_subscribers (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_automation_id character varying(20),
    fk_user_id character varying(20),
    notify_on_error boolean DEFAULT true,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_automation_subscribers OWNER TO evolution;

--
-- Name: nc_automations; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_automations (
    id character varying(20) NOT NULL,
    title character varying(255),
    description text,
    meta text,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    "order" real,
    type character varying(20),
    created_by character varying(20),
    updated_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    enabled boolean DEFAULT false,
    nodes text,
    edges text,
    draft text,
    config text,
    script text
);


ALTER TABLE gestor.nc_automations OWNER TO evolution;

--
-- Name: nc_base_users_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_base_users_v2 (
    base_id character varying(20) NOT NULL,
    fk_user_id character varying(20) NOT NULL,
    roles text,
    starred boolean,
    pinned boolean,
    "group" character varying(255),
    color character varying(255),
    "order" real,
    hidden real,
    opened_date timestamp(6) with time zone,
    invited_by character varying(20),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_base_users_v2 OWNER TO evolution;

--
-- Name: nc_bases_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_bases_v2 (
    id character varying(128) NOT NULL,
    title character varying(255),
    prefix character varying(255),
    status character varying(255),
    description text,
    meta text,
    color character varying(255),
    uuid character varying(255),
    password character varying(255),
    roles character varying(255),
    deleted boolean DEFAULT false,
    is_meta boolean,
    "order" real,
    type character varying(200),
    fk_workspace_id character varying(20),
    is_snapshot boolean DEFAULT false,
    fk_custom_url_id character varying(20),
    version smallint DEFAULT 2,
    default_role character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    managed_app_master boolean DEFAULT false,
    managed_app_id character varying(20),
    managed_app_version_id character varying(20),
    auto_update boolean DEFAULT true,
    is_sandbox_master boolean DEFAULT false,
    is_sandbox boolean DEFAULT false
);


ALTER TABLE gestor.nc_bases_v2 OWNER TO evolution;

--
-- Name: nc_calendar_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_calendar_view_columns_v2 (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    source_id character varying(20),
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    show boolean,
    bold boolean,
    underline boolean,
    italic boolean,
    "order" real,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_calendar_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_calendar_view_range_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_calendar_view_range_v2 (
    id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_to_column_id character varying(20),
    label character varying(40),
    fk_from_column_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_calendar_view_range_v2 OWNER TO evolution;

--
-- Name: nc_calendar_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_calendar_view_v2 (
    fk_view_id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    source_id character varying(20),
    title character varying(255),
    fk_cover_image_col_id character varying(20),
    meta text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_calendar_view_v2 OWNER TO evolution;

--
-- Name: nc_col_barcode_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_barcode_v2 (
    id character varying(20) NOT NULL,
    fk_column_id character varying(20),
    fk_barcode_value_column_id character varying(20),
    barcode_format character varying(15),
    deleted boolean,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_barcode_v2 OWNER TO evolution;

--
-- Name: nc_col_button_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_button_v2 (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    type character varying(255),
    label text,
    theme character varying(255),
    color character varying(255),
    icon character varying(255),
    formula text,
    formula_raw text,
    error character varying(255),
    parsed_tree text,
    fk_webhook_id character varying(20),
    fk_column_id character varying(20),
    fk_integration_id character varying(20),
    model character varying(255),
    output_column_ids text,
    fk_workspace_id character varying(20),
    fk_script_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_button_v2 OWNER TO evolution;

--
-- Name: nc_col_formula_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_formula_v2 (
    id character varying(20) NOT NULL,
    fk_column_id character varying(20),
    formula text NOT NULL,
    formula_raw text,
    error text,
    deleted boolean,
    "order" real,
    parsed_tree text,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_formula_v2 OWNER TO evolution;

--
-- Name: nc_col_long_text_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_long_text_v2 (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    fk_column_id character varying(20),
    fk_integration_id character varying(20),
    model character varying(255),
    prompt text,
    prompt_raw text,
    error text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_long_text_v2 OWNER TO evolution;

--
-- Name: nc_col_lookup_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_lookup_v2 (
    id character varying(20) NOT NULL,
    fk_column_id character varying(20),
    fk_relation_column_id character varying(20),
    fk_lookup_column_id character varying(20),
    deleted boolean,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_lookup_v2 OWNER TO evolution;

--
-- Name: nc_col_qrcode_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_qrcode_v2 (
    id character varying(20) NOT NULL,
    fk_column_id character varying(20),
    fk_qr_value_column_id character varying(20),
    deleted boolean,
    "order" real,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_qrcode_v2 OWNER TO evolution;

--
-- Name: nc_col_relations_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_relations_v2 (
    id character varying(20) NOT NULL,
    ref_db_alias character varying(255),
    type character varying(255),
    virtual boolean,
    db_type character varying(255),
    fk_column_id character varying(20),
    fk_related_model_id character varying(20),
    fk_child_column_id character varying(20),
    fk_parent_column_id character varying(20),
    fk_mm_model_id character varying(20),
    fk_mm_child_column_id character varying(20),
    fk_mm_parent_column_id character varying(20),
    ur character varying(255),
    dr character varying(255),
    fk_index_name character varying(255),
    deleted boolean,
    fk_target_view_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    fk_related_base_id character varying(20),
    fk_mm_base_id character varying(20),
    fk_related_source_id character varying(20),
    fk_mm_source_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1
);


ALTER TABLE gestor.nc_col_relations_v2 OWNER TO evolution;

--
-- Name: nc_col_rollup_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_rollup_v2 (
    id character varying(20) NOT NULL,
    fk_column_id character varying(20),
    fk_relation_column_id character varying(20),
    fk_rollup_column_id character varying(20),
    rollup_function character varying(255),
    deleted boolean,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_rollup_v2 OWNER TO evolution;

--
-- Name: nc_col_select_options_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_col_select_options_v2 (
    id character varying(20) NOT NULL,
    fk_column_id character varying(20),
    title character varying(255),
    color character varying(255),
    "order" real,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_col_select_options_v2 OWNER TO evolution;

--
-- Name: nc_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_columns_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    title character varying(255),
    column_name character varying(255),
    uidt character varying(255),
    dt character varying(255),
    np character varying(255),
    ns character varying(255),
    clen character varying(255),
    cop character varying(255),
    pk boolean,
    pv boolean,
    rqd boolean,
    un boolean,
    ct text,
    ai boolean,
    "unique" boolean,
    cdf text,
    cc text,
    csn character varying(255),
    dtx character varying(255),
    dtxp text,
    dtxs character varying(255),
    au boolean,
    validate text,
    virtual boolean,
    deleted boolean,
    system boolean DEFAULT false,
    "order" real,
    meta text,
    description text,
    readonly boolean DEFAULT false,
    fk_workspace_id character varying(20),
    custom_index_name character varying(64),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    internal_meta text
);


ALTER TABLE gestor.nc_columns_v2 OWNER TO evolution;

--
-- Name: nc_comment_reactions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_comment_reactions (
    id character varying(20) NOT NULL,
    row_id character varying(255),
    comment_id character varying(20),
    source_id character varying(20),
    fk_model_id character varying(20),
    base_id character varying(20) NOT NULL,
    reaction character varying(255),
    created_by character varying(255),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_comment_reactions OWNER TO evolution;

--
-- Name: nc_comments; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_comments (
    id character varying(20) NOT NULL,
    row_id character varying(255),
    comment text,
    created_by character varying(20),
    created_by_email character varying(255),
    resolved_by character varying(20),
    resolved_by_email character varying(255),
    parent_comment_id character varying(20),
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    is_deleted boolean,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_comments OWNER TO evolution;

--
-- Name: nc_custom_urls_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_custom_urls_v2 (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    view_id character varying(20),
    original_path character varying(255),
    custom_path character varying(255),
    fk_dashboard_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_custom_urls_v2 OWNER TO evolution;

--
-- Name: nc_dashboards_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_dashboards_v2 (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    meta text,
    "order" integer,
    created_by character varying(20),
    owned_by character varying(20),
    uuid character varying(255),
    password character varying(255),
    fk_custom_url_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_dashboards_v2 OWNER TO evolution;

--
-- Name: nc_data_reflection; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_data_reflection (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    username character varying(255),
    password character varying(255),
    database character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_data_reflection OWNER TO evolution;

--
-- Name: nc_db_servers; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_db_servers (
    id character varying(20) NOT NULL,
    title character varying(255),
    is_shared boolean DEFAULT true,
    max_tenant_count integer,
    current_tenant_count integer DEFAULT 0,
    config text,
    conditions text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_db_servers OWNER TO evolution;

--
-- Name: nc_dependency_tracker; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_dependency_tracker (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    source_type character varying(50) NOT NULL,
    source_id character varying(20) NOT NULL,
    dependent_type character varying(50) NOT NULL,
    dependent_id character varying(20) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    queryable_field_0 text,
    queryable_field_1 text,
    meta text,
    queryable_field_2 timestamp(6) with time zone
);


ALTER TABLE gestor.nc_dependency_tracker OWNER TO evolution;

--
-- Name: nc_disabled_models_for_role_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_disabled_models_for_role_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    role character varying(45),
    disabled boolean DEFAULT true,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_disabled_models_for_role_v2 OWNER TO evolution;

--
-- Name: nc_extensions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_extensions (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    fk_user_id character varying(20),
    extension_id character varying(255),
    title character varying(255),
    kv_store text,
    meta text,
    "order" real,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_extensions OWNER TO evolution;

--
-- Name: nc_file_references; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_file_references (
    id character varying(20) NOT NULL,
    storage character varying(255),
    file_url text,
    file_size integer,
    fk_user_id character varying(20),
    fk_workspace_id character varying(20),
    base_id character varying(20),
    source_id character varying(20),
    fk_model_id character varying(20),
    fk_column_id character varying(20),
    is_external boolean DEFAULT false,
    deleted boolean DEFAULT false,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_file_references OWNER TO evolution;

--
-- Name: nc_filter_exp_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_filter_exp_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_hook_id character varying(20),
    fk_column_id character varying(20),
    fk_parent_id character varying(20),
    logical_op character varying(255),
    comparison_op character varying(255),
    value text,
    is_group boolean,
    "order" real,
    comparison_sub_op character varying(255),
    fk_link_col_id character varying(20),
    fk_value_col_id character varying(20),
    fk_parent_column_id character varying(20),
    fk_workspace_id character varying(20),
    fk_row_color_condition_id character varying(20),
    fk_widget_id character varying(20),
    meta text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    enabled boolean DEFAULT true,
    fk_rls_policy_id character varying(20),
    fk_level_id character varying(20),
    fk_button_col_id character varying(20)
);


ALTER TABLE gestor.nc_filter_exp_v2 OWNER TO evolution;

--
-- Name: nc_follower; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_follower (
    fk_user_id character varying(20) NOT NULL,
    fk_follower_id character varying(20) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_follower OWNER TO evolution;

--
-- Name: nc_form_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_form_view_columns_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    uuid character varying(255),
    label text,
    help text,
    description text,
    required boolean,
    show boolean,
    "order" real,
    meta text,
    enable_scanner boolean,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_form_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_form_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_form_view_v2 (
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20) NOT NULL,
    heading character varying(255),
    subheading text,
    success_msg text,
    redirect_url text,
    redirect_after_secs character varying(255),
    email character varying(255),
    submit_another_form boolean,
    show_blank_form boolean,
    uuid character varying(255),
    banner_image_url text,
    logo_url text,
    meta text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_form_view_v2 OWNER TO evolution;

--
-- Name: nc_gallery_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_gallery_view_columns_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    uuid character varying(255),
    label character varying(255),
    help character varying(255),
    show boolean,
    "order" real,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_gallery_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_gallery_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_gallery_view_v2 (
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20) NOT NULL,
    next_enabled boolean,
    prev_enabled boolean,
    cover_image_idx integer,
    fk_cover_image_col_id character varying(20),
    cover_image character varying(255),
    restrict_types character varying(255),
    restrict_size character varying(255),
    restrict_number character varying(255),
    public boolean,
    dimensions character varying(255),
    responsive_columns character varying(255),
    meta text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_gallery_view_v2 OWNER TO evolution;

--
-- Name: nc_grid_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_grid_view_columns_v2 (
    id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    uuid character varying(255),
    label character varying(255),
    help character varying(255),
    width character varying(255) DEFAULT '200px'::character varying,
    show boolean,
    "order" real,
    group_by boolean,
    group_by_order real,
    group_by_sort character varying(255),
    aggregation character varying(30),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_grid_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_grid_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_grid_view_v2 (
    fk_view_id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    uuid character varying(255),
    meta text,
    row_height integer,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_grid_view_v2 OWNER TO evolution;

--
-- Name: nc_hook_logs_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_hook_logs_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_hook_id character varying(20),
    type character varying(255),
    event character varying(255),
    operation character varying(255),
    test_call boolean DEFAULT true,
    payload text,
    conditions text,
    notification text,
    error_code character varying(255),
    error_message character varying(255),
    error text,
    execution_time integer,
    response text,
    triggered_by character varying(255),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_hook_logs_v2 OWNER TO evolution;

--
-- Name: nc_hook_trigger_fields; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_hook_trigger_fields (
    fk_hook_id character varying(20) NOT NULL,
    fk_column_id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_hook_trigger_fields OWNER TO evolution;

--
-- Name: nc_hooks_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_hooks_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    title character varying(255),
    description character varying(255),
    env character varying(255) DEFAULT 'all'::character varying,
    type character varying(255),
    event character varying(255),
    operation character varying(255),
    async boolean DEFAULT false,
    payload boolean DEFAULT true,
    url text,
    headers text,
    condition boolean DEFAULT false,
    notification text,
    retries integer DEFAULT 0,
    retry_interval integer DEFAULT 60000,
    timeout integer DEFAULT 60000,
    active boolean DEFAULT true,
    version character varying(255),
    trigger_field boolean DEFAULT false,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_hooks_v2 OWNER TO evolution;

--
-- Name: nc_installations; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_installations (
    id character varying(20) NOT NULL,
    fk_subscription_id character varying(20),
    licensed_to character varying(255) NOT NULL,
    license_key character varying(255) NOT NULL,
    installation_secret character varying(255),
    installed_at timestamp(6) with time zone,
    last_seen_at timestamp(6) with time zone,
    expires_at timestamp(6) with time zone,
    license_type character varying(255) NOT NULL,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    seat_count integer DEFAULT 0 NOT NULL,
    config text,
    meta text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_installations OWNER TO evolution;

--
-- Name: nc_integrations_store_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_integrations_store_v2 (
    id character varying(20) NOT NULL,
    fk_integration_id character varying(20),
    type character varying(20),
    sub_type character varying(20),
    fk_workspace_id character varying(20),
    fk_user_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    slot_0 text,
    slot_1 text,
    slot_2 text,
    slot_3 text,
    slot_4 text,
    slot_5 integer,
    slot_6 integer,
    slot_7 integer,
    slot_8 integer,
    slot_9 integer
);


ALTER TABLE gestor.nc_integrations_store_v2 OWNER TO evolution;

--
-- Name: nc_integrations_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_integrations_v2 (
    id character varying(20) NOT NULL,
    title character varying(128),
    config text,
    meta text,
    type character varying(20),
    sub_type character varying(20),
    fk_workspace_id character varying(20),
    is_private boolean DEFAULT false,
    deleted boolean DEFAULT false,
    created_by character varying(20),
    "order" real,
    is_default boolean DEFAULT false,
    is_encrypted boolean DEFAULT false,
    is_global boolean DEFAULT false,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_integrations_v2 OWNER TO evolution;

--
-- Name: nc_jobs; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_jobs (
    id character varying(20) NOT NULL,
    job character varying(255),
    status character varying(20),
    result text,
    fk_user_id character varying(20),
    fk_workspace_id character varying(20),
    base_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_jobs OWNER TO evolution;

--
-- Name: nc_kanban_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_kanban_view_columns_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    uuid character varying(255),
    label character varying(255),
    help character varying(255),
    show boolean,
    "order" real,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_kanban_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_kanban_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_kanban_view_v2 (
    fk_view_id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    show boolean,
    "order" real,
    uuid character varying(255),
    title character varying(255),
    public boolean,
    password character varying(255),
    show_all_fields boolean,
    fk_grp_col_id character varying(20),
    fk_cover_image_col_id character varying(20),
    meta text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_kanban_view_v2 OWNER TO evolution;

--
-- Name: nc_list_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_list_view_columns_v2 (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    source_id character varying(128),
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    fk_level_id character varying(20),
    show boolean,
    "order" real,
    width character varying(255),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_list_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_list_view_levels_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_list_view_levels_v2 (
    id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    level integer,
    fk_model_id character varying(20),
    fk_link_column_id character varying(20),
    enable_nested_records boolean,
    fk_self_link_column_id character varying(20),
    wrap_headers boolean,
    meta text,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_list_view_levels_v2 OWNER TO evolution;

--
-- Name: nc_list_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_list_view_v2 (
    fk_view_id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    source_id character varying(128),
    title character varying(255),
    show_empty_parents boolean,
    row_height integer,
    fk_prefix_column_id character varying(20),
    meta text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_list_view_v2 OWNER TO evolution;

--
-- Name: nc_managed_app_deployment_logs; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_managed_app_deployment_logs (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    fk_managed_app_id character varying(20) NOT NULL,
    from_version_id character varying(20),
    to_version_id character varying(20) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    deployment_type character varying(20) NOT NULL,
    error_message text,
    deployment_log text,
    meta text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    started_at timestamp(6) with time zone,
    completed_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_managed_app_deployment_logs OWNER TO evolution;

--
-- Name: nc_managed_app_versions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_managed_app_versions (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20) NOT NULL,
    fk_managed_app_id character varying(20) NOT NULL,
    version character varying(20) NOT NULL,
    version_number integer NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    schema text,
    release_notes text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_managed_app_versions OWNER TO evolution;

--
-- Name: nc_managed_apps; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_managed_apps (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    created_by character varying(20) NOT NULL,
    visibility character varying(20) DEFAULT 'private'::character varying NOT NULL,
    category character varying(255),
    install_count integer DEFAULT 0,
    meta text,
    deleted boolean DEFAULT false,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    published_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_managed_apps OWNER TO evolution;

--
-- Name: nc_map_view_columns_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_map_view_columns_v2 (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    project_id character varying(128),
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    uuid character varying(255),
    label character varying(255),
    help character varying(255),
    show boolean,
    "order" real,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_map_view_columns_v2 OWNER TO evolution;

--
-- Name: nc_map_view_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_map_view_v2 (
    fk_view_id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    uuid character varying(255),
    title character varying(255),
    fk_geo_data_col_id character varying(20),
    meta text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_map_view_v2 OWNER TO evolution;

--
-- Name: nc_mcp_tokens; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_mcp_tokens (
    id character varying(20) NOT NULL,
    title character varying(512),
    base_id character varying(20) NOT NULL,
    token character varying(32),
    fk_workspace_id character varying(20),
    "order" real,
    fk_user_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_mcp_tokens OWNER TO evolution;

--
-- Name: nc_model_stats_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_model_stats_v2 (
    fk_workspace_id character varying(20) NOT NULL,
    fk_model_id character varying(20) NOT NULL,
    row_count integer DEFAULT 0,
    is_external boolean DEFAULT false,
    base_id character varying(20) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_model_stats_v2 OWNER TO evolution;

--
-- Name: nc_models_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_models_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    table_name character varying(255),
    title character varying(255),
    type character varying(255) DEFAULT 'table'::character varying,
    meta text,
    schema text,
    enabled boolean DEFAULT true,
    mm boolean DEFAULT false,
    tags character varying(255),
    pinned boolean,
    deleted boolean,
    "order" real,
    description text,
    synced boolean DEFAULT false,
    fk_workspace_id character varying(20),
    created_by character varying(20),
    owned_by character varying(20),
    uuid character varying(255),
    password character varying(255),
    fk_custom_url_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_models_v2 OWNER TO evolution;

--
-- Name: nc_oauth_authorization_codes; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_oauth_authorization_codes (
    code character varying(32) NOT NULL,
    fk_client_id character varying(32),
    fk_user_id character varying(20),
    code_challenge character varying(255),
    code_challenge_method character varying(10) DEFAULT 'S256'::character varying,
    redirect_uri character varying(255),
    scope character varying(255),
    state character varying(1024),
    resource character varying(255),
    granted_resources text,
    expires_at timestamp(6) with time zone NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_oauth_authorization_codes OWNER TO evolution;

--
-- Name: nc_oauth_clients; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_oauth_clients (
    client_id character varying(32) NOT NULL,
    client_secret character varying(128),
    client_type character varying(255),
    client_name character varying(255),
    client_description text,
    client_uri character varying(255),
    logo_uri character varying(255),
    redirect_uris text,
    allowed_grant_types text,
    response_types text,
    allowed_scopes text,
    registration_access_token character varying(255),
    registration_client_uri character varying(255),
    client_id_issued_at bigint,
    client_secret_expires_at bigint,
    fk_user_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_oauth_clients OWNER TO evolution;

--
-- Name: nc_oauth_tokens; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_oauth_tokens (
    id character varying(20) NOT NULL,
    fk_client_id character varying(32),
    fk_user_id character varying(20),
    access_token text,
    access_token_expires_at timestamp(6) with time zone,
    refresh_token text,
    refresh_token_expires_at timestamp(6) with time zone,
    resource character varying(255),
    audience character varying(255),
    granted_resources text,
    scope character varying(255),
    is_revoked boolean DEFAULT false NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_used_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_oauth_tokens OWNER TO evolution;

--
-- Name: nc_org; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_org (
    id character varying(20) NOT NULL,
    title character varying(255),
    slug character varying(255),
    fk_user_id character varying(20),
    meta text,
    image character varying(255),
    is_share_enabled boolean DEFAULT false,
    deleted boolean DEFAULT false,
    "order" real,
    fk_db_instance_id character varying(20),
    stripe_customer_id character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_org OWNER TO evolution;

--
-- Name: nc_org_domain; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_org_domain (
    id character varying(20) NOT NULL,
    fk_org_id character varying(20),
    fk_user_id character varying(20),
    domain character varying(255),
    verified boolean,
    txt_value character varying(255),
    last_verified timestamp(6) with time zone,
    deleted boolean DEFAULT false,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_org_domain OWNER TO evolution;

--
-- Name: nc_org_users; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_org_users (
    fk_org_id character varying(20) NOT NULL,
    fk_user_id character varying(20),
    roles character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_org_users OWNER TO evolution;

--
-- Name: nc_permission_subjects; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_permission_subjects (
    fk_permission_id character varying(20) NOT NULL,
    subject_type character varying(255) NOT NULL,
    subject_id character varying(255) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_permission_subjects OWNER TO evolution;

--
-- Name: nc_permissions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_permissions (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    entity character varying(255),
    entity_id character varying(255),
    permission character varying(255),
    created_by character varying(20),
    enforce_for_form boolean DEFAULT true,
    enforce_for_automation boolean DEFAULT true,
    granted_type character varying(255),
    granted_role character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_permissions OWNER TO evolution;

--
-- Name: nc_plans; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_plans (
    id character varying(20) NOT NULL,
    title character varying(255),
    description text,
    stripe_product_id character varying(255) NOT NULL,
    is_active boolean DEFAULT true,
    prices text,
    meta text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_plans OWNER TO evolution;

--
-- Name: nc_plugins_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_plugins_v2 (
    id character varying(20) NOT NULL,
    title character varying(45),
    description text,
    active boolean DEFAULT false,
    rating real,
    version character varying(255),
    docs character varying(255),
    status character varying(255) DEFAULT 'install'::character varying,
    status_details character varying(255),
    logo character varying(255),
    icon character varying(255),
    tags character varying(255),
    category character varying(255),
    input_schema text,
    input text,
    creator character varying(255),
    creator_website character varying(255),
    price character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_plugins_v2 OWNER TO evolution;

--
-- Name: nc_principal_assignments; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_principal_assignments (
    resource_type character varying(20) NOT NULL,
    resource_id character varying(20) NOT NULL,
    principal_type character varying(20) NOT NULL,
    principal_ref_id character varying(20) NOT NULL,
    roles character varying(255) NOT NULL,
    deleted boolean DEFAULT false,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_principal_assignments OWNER TO evolution;

--
-- Name: nc_record_templates; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_record_templates (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    fk_model_id character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    template_data text NOT NULL,
    usage_count integer DEFAULT 0,
    enabled boolean DEFAULT true,
    created_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_record_templates OWNER TO evolution;

--
-- Name: nc_rls_policies; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_rls_policies (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    source_id character varying(20),
    fk_model_id character varying(20) NOT NULL,
    title character varying(255),
    enabled boolean DEFAULT true,
    is_default boolean DEFAULT false,
    default_behavior character varying(20),
    "order" real,
    meta text,
    created_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_rls_policies OWNER TO evolution;

--
-- Name: nc_rls_policy_subjects; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_rls_policy_subjects (
    fk_rls_policy_id character varying(20) NOT NULL,
    subject_type character varying(255) NOT NULL,
    subject_id character varying(255) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_rls_policy_subjects OWNER TO evolution;

--
-- Name: nc_row_color_conditions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_row_color_conditions (
    id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    color character varying(20),
    nc_order real,
    is_set_as_background boolean,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    type character varying(20) DEFAULT 'row'::character varying,
    fk_target_column_id character varying(20)
);


ALTER TABLE gestor.nc_row_color_conditions OWNER TO evolution;

--
-- Name: nc_sandboxes_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sandboxes_v2 (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20) NOT NULL,
    master_base_id character varying(20) NOT NULL,
    sandbox_base_id character varying(20) NOT NULL,
    created_by character varying(20) NOT NULL,
    meta text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sandboxes_v2 OWNER TO evolution;

--
-- Name: nc_scim_config; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_scim_config (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20) NOT NULL,
    enabled boolean DEFAULT false,
    provisioning_token text NOT NULL,
    role_mapping text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_scim_config OWNER TO evolution;

--
-- Name: nc_scripts; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_scripts (
    id character varying(20) NOT NULL,
    title text,
    description text,
    meta text,
    "order" real,
    base_id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    script text,
    config text,
    created_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_scripts OWNER TO evolution;

--
-- Name: nc_snapshots; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_snapshots (
    id character varying(20) NOT NULL,
    title character varying(512),
    base_id character varying(20),
    snapshot_base_id character varying(20),
    fk_workspace_id character varying(20),
    created_by character varying(20),
    status character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_snapshots OWNER TO evolution;

--
-- Name: nc_sort_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sort_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_view_id character varying(20),
    fk_column_id character varying(20),
    direction character varying(255) DEFAULT 'false'::character varying,
    "order" real,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fk_level_id character varying(20)
);


ALTER TABLE gestor.nc_sort_v2 OWNER TO evolution;

--
-- Name: nc_sources_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sources_v2 (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    alias character varying(255),
    config text,
    meta text,
    is_meta boolean,
    type character varying(255),
    inflection_column character varying(255),
    inflection_table character varying(255),
    enabled boolean DEFAULT true,
    "order" real,
    description character varying(255),
    erd_uuid character varying(255),
    deleted boolean DEFAULT false,
    is_schema_readonly boolean DEFAULT false,
    is_data_readonly boolean DEFAULT false,
    is_local boolean DEFAULT false,
    fk_sql_executor_id character varying(20),
    fk_workspace_id character varying(20),
    fk_integration_id character varying(20),
    is_encrypted boolean DEFAULT false,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sources_v2 OWNER TO evolution;

--
-- Name: nc_sql_executor_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sql_executor_v2 (
    id character varying(20) NOT NULL,
    domain character varying(50),
    status character varying(20),
    priority integer,
    capacity integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sql_executor_v2 OWNER TO evolution;

--
-- Name: nc_sso_client; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sso_client (
    id character varying(20) NOT NULL,
    type character varying(20),
    title character varying(255),
    enabled boolean DEFAULT true,
    config text,
    fk_user_id character varying(20),
    fk_org_id character varying(20),
    deleted boolean DEFAULT false,
    "order" real,
    domain_name character varying(255),
    domain_name_verified boolean,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sso_client OWNER TO evolution;

--
-- Name: nc_sso_client_domain; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sso_client_domain (
    fk_sso_client_id character varying(20) NOT NULL,
    fk_org_domain_id character varying(20),
    enabled boolean DEFAULT true,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sso_client_domain OWNER TO evolution;

--
-- Name: nc_store; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_store (
    id integer NOT NULL,
    base_id character varying(255),
    db_alias character varying(255) DEFAULT 'db'::character varying,
    key character varying(255),
    value text,
    type character varying(255),
    env character varying(255),
    tag character varying(255),
    created_at timestamp(6) with time zone,
    updated_at timestamp(6) with time zone
);


ALTER TABLE gestor.nc_store OWNER TO evolution;

--
-- Name: nc_store_id_seq; Type: SEQUENCE; Schema: gestor; Owner: evolution
--

CREATE SEQUENCE gestor.nc_store_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE gestor.nc_store_id_seq OWNER TO evolution;

--
-- Name: nc_store_id_seq; Type: SEQUENCE OWNED BY; Schema: gestor; Owner: evolution
--

ALTER SEQUENCE gestor.nc_store_id_seq OWNED BY gestor.nc_store.id;


--
-- Name: nc_subscriptions; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_subscriptions (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    fk_org_id character varying(20),
    fk_plan_id character varying(20) NOT NULL,
    fk_user_id character varying(20),
    stripe_subscription_id character varying(255),
    stripe_price_id character varying(255),
    seat_count integer DEFAULT 1 NOT NULL,
    status character varying(255),
    billing_cycle_anchor timestamp(6) with time zone,
    start_at timestamp(6) with time zone,
    trial_end_at timestamp(6) with time zone,
    canceled_at timestamp(6) with time zone,
    period character varying(255),
    upcoming_invoice_at timestamp(6) with time zone,
    upcoming_invoice_due_at timestamp(6) with time zone,
    upcoming_invoice_amount integer,
    upcoming_invoice_currency character varying(255),
    stripe_schedule_id character varying(255),
    schedule_phase_start timestamp(6) with time zone,
    schedule_stripe_price_id character varying(255),
    schedule_fk_plan_id character varying(20),
    schedule_period character varying(255),
    schedule_type character varying(255),
    meta text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_subscriptions OWNER TO evolution;

--
-- Name: nc_sync_configs; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sync_configs (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_integration_id character varying(20),
    fk_model_id character varying(20),
    sync_type character varying(255),
    sync_trigger character varying(255),
    sync_trigger_cron character varying(255),
    sync_trigger_secret character varying(255),
    sync_job_id character varying(255),
    last_sync_at timestamp(6) with time zone,
    next_sync_at timestamp(6) with time zone,
    title character varying(255),
    sync_category character varying(255),
    fk_parent_sync_config_id character varying(20),
    on_delete_action character varying(255) DEFAULT 'mark_deleted'::character varying,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by character varying(20),
    updated_by character varying(20),
    meta text
);


ALTER TABLE gestor.nc_sync_configs OWNER TO evolution;

--
-- Name: nc_sync_logs_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sync_logs_v2 (
    id character varying(20) NOT NULL,
    base_id character varying(20) NOT NULL,
    fk_sync_source_id character varying(20),
    time_taken integer,
    status character varying(255),
    status_details text,
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sync_logs_v2 OWNER TO evolution;

--
-- Name: nc_sync_mappings; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sync_mappings (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_sync_config_id character varying(20),
    target_table character varying(255),
    fk_model_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sync_mappings OWNER TO evolution;

--
-- Name: nc_sync_source_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_sync_source_v2 (
    id character varying(20) NOT NULL,
    title character varying(255),
    type character varying(255),
    details text,
    deleted boolean,
    enabled boolean DEFAULT true,
    "order" real,
    base_id character varying(20) NOT NULL,
    fk_user_id character varying(20),
    source_id character varying(20),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_sync_source_v2 OWNER TO evolution;

--
-- Name: nc_teams; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_teams (
    id character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    meta text,
    fk_org_id character varying(20),
    fk_workspace_id character varying(20),
    created_by character varying(20),
    deleted boolean DEFAULT false,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    scim_external_id character varying(255),
    scim_managed boolean DEFAULT false,
    scim_display_name character varying(255),
    scim_meta text
);


ALTER TABLE gestor.nc_teams OWNER TO evolution;

--
-- Name: nc_usage_stats; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_usage_stats (
    fk_workspace_id character varying(20) NOT NULL,
    usage_type character varying(255) NOT NULL,
    period_start timestamp(6) with time zone NOT NULL,
    count integer DEFAULT 0,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_usage_stats OWNER TO evolution;

--
-- Name: nc_user_comment_notifications_preference; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_user_comment_notifications_preference (
    id character varying(20) NOT NULL,
    row_id character varying(255),
    user_id character varying(20),
    fk_model_id character varying(20),
    source_id character varying(20),
    base_id character varying(20),
    preferences character varying(255),
    fk_workspace_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_user_comment_notifications_preference OWNER TO evolution;

--
-- Name: nc_user_refresh_tokens; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_user_refresh_tokens (
    fk_user_id character varying(20),
    token character varying(255),
    meta text,
    expires_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_user_refresh_tokens OWNER TO evolution;

--
-- Name: nc_users_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_users_v2 (
    id character varying(20) NOT NULL,
    email character varying(255),
    password character varying(255),
    salt character varying(255),
    invite_token character varying(255),
    invite_token_expires character varying(255),
    reset_password_expires timestamp(6) with time zone,
    reset_password_token character varying(255),
    email_verification_token character varying(255),
    email_verified boolean,
    roles character varying(255) DEFAULT 'editor'::character varying,
    token_version character varying(255),
    blocked boolean DEFAULT false,
    blocked_reason character varying(255),
    deleted_at timestamp(6) with time zone,
    is_deleted boolean DEFAULT false,
    meta text,
    display_name character varying(255),
    user_name character varying(255),
    bio character varying(255),
    location character varying(255),
    website character varying(255),
    avatar character varying(255),
    is_new_user boolean,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    canonical_email character varying(255)
);


ALTER TABLE gestor.nc_users_v2 OWNER TO evolution;

--
-- Name: nc_view_sections; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_view_sections (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20),
    source_id character varying(20),
    fk_model_id character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    "order" real,
    meta text,
    created_by character varying(20),
    updated_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_view_sections OWNER TO evolution;

--
-- Name: nc_views_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_views_v2 (
    id character varying(20) NOT NULL,
    source_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    title character varying(255),
    type integer,
    is_default boolean,
    show_system_fields boolean,
    lock_type character varying(255) DEFAULT 'collaborative'::character varying,
    uuid character varying(255),
    password character varying(255),
    show boolean,
    "order" real,
    meta text,
    description text,
    created_by character varying(20),
    owned_by character varying(20),
    fk_workspace_id character varying(20),
    attachment_mode_column_id character varying(20),
    expanded_record_mode character varying(255),
    fk_custom_url_id character varying(20),
    row_coloring_mode character varying(10),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fk_view_section_id character varying(20)
);


ALTER TABLE gestor.nc_views_v2 OWNER TO evolution;

--
-- Name: nc_widgets_v2; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_widgets_v2 (
    id character varying(20) NOT NULL,
    fk_workspace_id character varying(20),
    base_id character varying(20) NOT NULL,
    fk_dashboard_id character varying(20) NOT NULL,
    fk_model_id character varying(20),
    fk_view_id character varying(20),
    title character varying(255) NOT NULL,
    description text,
    type character varying(50) NOT NULL,
    config text,
    meta text,
    "order" integer,
    "position" text,
    error boolean,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.nc_widgets_v2 OWNER TO evolution;

--
-- Name: nc_workflows; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.nc_workflows (
    id character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    fk_workspace_id character varying(20),
    base_id character varying(20),
    enabled boolean DEFAULT false,
    nodes text,
    edges text,
    meta text,
    "order" real,
    created_by character varying(20),
    updated_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    draft text
);


ALTER TABLE gestor.nc_workflows OWNER TO evolution;

--
-- Name: notification; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.notification (
    id character varying(20) NOT NULL,
    type character varying(40),
    body text,
    is_read boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    fk_user_id character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.notification OWNER TO evolution;

--
-- Name: workspace; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.workspace (
    id character varying(20) NOT NULL,
    title character varying(255),
    description text,
    meta text,
    fk_user_id character varying(20),
    deleted boolean DEFAULT false,
    deleted_at timestamp(6) with time zone,
    "order" real,
    status smallint DEFAULT 0,
    message character varying(256),
    plan character varying(20) DEFAULT 'free'::character varying,
    infra_meta text,
    fk_org_id character varying(20),
    stripe_customer_id character varying(255),
    grace_period_start_at timestamp(6) with time zone,
    api_grace_period_start_at timestamp(6) with time zone,
    automation_grace_period_start_at timestamp(6) with time zone,
    loyal boolean DEFAULT false,
    loyalty_discount_used boolean DEFAULT false,
    db_job_id character varying(20),
    fk_db_instance_id character varying(20),
    segment_code integer,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE gestor.workspace OWNER TO evolution;

--
-- Name: workspace_user; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.workspace_user (
    fk_workspace_id character varying(20) NOT NULL,
    fk_user_id character varying(20) NOT NULL,
    roles character varying(255),
    invite_token character varying(255),
    invite_accepted boolean DEFAULT false,
    deleted boolean DEFAULT false,
    deleted_at timestamp(6) with time zone,
    "order" real,
    invited_by character varying(20),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    scim_external_id character varying(255),
    scim_managed boolean DEFAULT false,
    scim_user_name character varying(255),
    scim_meta text
);


ALTER TABLE gestor.workspace_user OWNER TO evolution;

--
-- Name: xc_knex_migrationsv0; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.xc_knex_migrationsv0 (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp(6) with time zone
);


ALTER TABLE gestor.xc_knex_migrationsv0 OWNER TO evolution;

--
-- Name: xc_knex_migrationsv0_id_seq; Type: SEQUENCE; Schema: gestor; Owner: evolution
--

CREATE SEQUENCE gestor.xc_knex_migrationsv0_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE gestor.xc_knex_migrationsv0_id_seq OWNER TO evolution;

--
-- Name: xc_knex_migrationsv0_id_seq; Type: SEQUENCE OWNED BY; Schema: gestor; Owner: evolution
--

ALTER SEQUENCE gestor.xc_knex_migrationsv0_id_seq OWNED BY gestor.xc_knex_migrationsv0.id;


--
-- Name: xc_knex_migrationsv0_lock; Type: TABLE; Schema: gestor; Owner: evolution
--

CREATE TABLE gestor.xc_knex_migrationsv0_lock (
    index integer NOT NULL,
    is_locked integer
);


ALTER TABLE gestor.xc_knex_migrationsv0_lock OWNER TO evolution;

--
-- Name: xc_knex_migrationsv0_lock_index_seq; Type: SEQUENCE; Schema: gestor; Owner: evolution
--

CREATE SEQUENCE gestor.xc_knex_migrationsv0_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE gestor.xc_knex_migrationsv0_lock_index_seq OWNER TO evolution;

--
-- Name: xc_knex_migrationsv0_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: gestor; Owner: evolution
--

ALTER SEQUENCE gestor.xc_knex_migrationsv0_lock_index_seq OWNED BY gestor.xc_knex_migrationsv0_lock.index;


--
-- Name: nc_api_tokens id; Type: DEFAULT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_api_tokens ALTER COLUMN id SET DEFAULT nextval('gestor.nc_api_tokens_id_seq'::regclass);


--
-- Name: nc_store id; Type: DEFAULT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_store ALTER COLUMN id SET DEFAULT nextval('gestor.nc_store_id_seq'::regclass);


--
-- Name: xc_knex_migrationsv0 id; Type: DEFAULT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.xc_knex_migrationsv0 ALTER COLUMN id SET DEFAULT nextval('gestor.xc_knex_migrationsv0_id_seq'::regclass);


--
-- Name: xc_knex_migrationsv0_lock index; Type: DEFAULT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.xc_knex_migrationsv0_lock ALTER COLUMN index SET DEFAULT nextval('gestor.xc_knex_migrationsv0_lock_index_seq'::regclass);


--
-- Name: AsistenteChat AsistenteChat_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."AsistenteChat"
    ADD CONSTRAINT "AsistenteChat_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: CarteraCache CarteraCache_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."CarteraCache"
    ADD CONSTRAINT "CarteraCache_pkey" PRIMARY KEY (id);


--
-- Name: Cartera Cartera_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cartera"
    ADD CONSTRAINT "Cartera_pkey" PRIMARY KEY (id);


--
-- Name: Cliente Cliente_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cliente"
    ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY (id);


--
-- Name: ComisionCalculo ComisionCalculo_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."ComisionCalculo"
    ADD CONSTRAINT "ComisionCalculo_pkey" PRIMARY KEY (id);


--
-- Name: ComisionConfig ComisionConfig_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."ComisionConfig"
    ADD CONSTRAINT "ComisionConfig_pkey" PRIMARY KEY (id);


--
-- Name: DespachoLog DespachoLog_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."DespachoLog"
    ADD CONSTRAINT "DespachoLog_pkey" PRIMARY KEY (id);


--
-- Name: DetalleCartera DetalleCartera_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."DetalleCartera"
    ADD CONSTRAINT "DetalleCartera_pkey" PRIMARY KEY (id);


--
-- Name: EmpleadoLista EmpleadoLista_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."EmpleadoLista"
    ADD CONSTRAINT "EmpleadoLista_pkey" PRIMARY KEY ("empleadoId", "listaId");


--
-- Name: Empleado Empleado_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Empleado"
    ADD CONSTRAINT "Empleado_pkey" PRIMARY KEY (id);


--
-- Name: EmpresaVinculada EmpresaVinculada_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."EmpresaVinculada"
    ADD CONSTRAINT "EmpresaVinculada_pkey" PRIMARY KEY (id);


--
-- Name: Empresa Empresa_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Empresa"
    ADD CONSTRAINT "Empresa_pkey" PRIMARY KEY (id);


--
-- Name: InciGuardian InciGuardian_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."InciGuardian"
    ADD CONSTRAINT "InciGuardian_pkey" PRIMARY KEY (id);


--
-- Name: Integracion Integracion_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Integracion"
    ADD CONSTRAINT "Integracion_pkey" PRIMARY KEY (id);


--
-- Name: ListaClientes ListaClientes_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."ListaClientes"
    ADD CONSTRAINT "ListaClientes_pkey" PRIMARY KEY (id);


--
-- Name: MetaRecaudo MetaRecaudo_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaRecaudo"
    ADD CONSTRAINT "MetaRecaudo_pkey" PRIMARY KEY (id);


--
-- Name: MetaVenta MetaVenta_empleadoId_mes_anio_key; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaVenta"
    ADD CONSTRAINT "MetaVenta_empleadoId_mes_anio_key" UNIQUE ("empleadoId", mes, anio);


--
-- Name: MetaVenta MetaVenta_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaVenta"
    ADD CONSTRAINT "MetaVenta_pkey" PRIMARY KEY (id);


--
-- Name: OrdenDespacho OrdenDespacho_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."OrdenDespacho"
    ADD CONSTRAINT "OrdenDespacho_pkey" PRIMARY KEY (id);


--
-- Name: PagoCarteraDeuda PagoCarteraDeuda_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PagoCarteraDeuda"
    ADD CONSTRAINT "PagoCarteraDeuda_pkey" PRIMARY KEY (id);


--
-- Name: PagoCartera PagoCartera_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PagoCartera"
    ADD CONSTRAINT "PagoCartera_pkey" PRIMARY KEY (id);


--
-- Name: PrecioRol PrecioRol_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PrecioRol"
    ADD CONSTRAINT "PrecioRol_pkey" PRIMARY KEY (id);


--
-- Name: PushSuscripcion PushSuscripcion_endpoint_key; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PushSuscripcion"
    ADD CONSTRAINT "PushSuscripcion_endpoint_key" UNIQUE (endpoint);


--
-- Name: PushSuscripcion PushSuscripcion_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PushSuscripcion"
    ADD CONSTRAINT "PushSuscripcion_pkey" PRIMARY KEY (id);


--
-- Name: RutaCliente RutaCliente_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaCliente"
    ADD CONSTRAINT "RutaCliente_pkey" PRIMARY KEY (id);


--
-- Name: RutaEmpleado RutaEmpleado_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaEmpleado"
    ADD CONSTRAINT "RutaEmpleado_pkey" PRIMARY KEY (id);


--
-- Name: RutaFijaCliente RutaFijaCliente_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFijaCliente"
    ADD CONSTRAINT "RutaFijaCliente_pkey" PRIMARY KEY (id);


--
-- Name: RutaFijaEmpleado RutaFijaEmpleado_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFijaEmpleado"
    ADD CONSTRAINT "RutaFijaEmpleado_pkey" PRIMARY KEY (id);


--
-- Name: RutaFija RutaFija_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFija"
    ADD CONSTRAINT "RutaFija_pkey" PRIMARY KEY (id);


--
-- Name: Ruta Ruta_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Ruta"
    ADD CONSTRAINT "Ruta_pkey" PRIMARY KEY (id);


--
-- Name: SubEmpresa SubEmpresa_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SubEmpresa"
    ADD CONSTRAINT "SubEmpresa_pkey" PRIMARY KEY (id);


--
-- Name: SupervisorVendedor SupervisorVendedor_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SupervisorVendedor"
    ADD CONSTRAINT "SupervisorVendedor_pkey" PRIMARY KEY ("supervisorId", "vendedorId");


--
-- Name: SyncCompra SyncCompra_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncCompra"
    ADD CONSTRAINT "SyncCompra_pkey" PRIMARY KEY (id);


--
-- Name: SyncDeuda SyncDeuda_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncDeuda"
    ADD CONSTRAINT "SyncDeuda_pkey" PRIMARY KEY (id);


--
-- Name: SyncEmpleado SyncEmpleado_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncEmpleado"
    ADD CONSTRAINT "SyncEmpleado_pkey" PRIMARY KEY (id);


--
-- Name: SyncLog SyncLog_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncLog"
    ADD CONSTRAINT "SyncLog_pkey" PRIMARY KEY (id);


--
-- Name: Turno Turno_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Turno"
    ADD CONSTRAINT "Turno_pkey" PRIMARY KEY (id);


--
-- Name: VentaMesCliente VentaMesCliente_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."VentaMesCliente"
    ADD CONSTRAINT "VentaMesCliente_pkey" PRIMARY KEY (id);


--
-- Name: Visita Visita_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Visita"
    ADD CONSTRAINT "Visita_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: nc_api_tokens nc_api_tokens_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_api_tokens
    ADD CONSTRAINT nc_api_tokens_pkey PRIMARY KEY (id);


--
-- Name: nc_audit_v2 nc_audit_v2_pkx; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_audit_v2
    ADD CONSTRAINT nc_audit_v2_pkx PRIMARY KEY (id);


--
-- Name: nc_automation_executions nc_automation_executions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_automation_executions
    ADD CONSTRAINT nc_automation_executions_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_automation_subscribers nc_automation_subscribers_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_automation_subscribers
    ADD CONSTRAINT nc_automation_subscribers_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_automations nc_automations_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_automations
    ADD CONSTRAINT nc_automations_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_base_users_v2 nc_base_users_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_base_users_v2
    ADD CONSTRAINT nc_base_users_v2_pkey PRIMARY KEY (base_id, fk_user_id);


--
-- Name: nc_sources_v2 nc_bases_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sources_v2
    ADD CONSTRAINT nc_bases_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_calendar_view_columns_v2 nc_calendar_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_calendar_view_columns_v2
    ADD CONSTRAINT nc_calendar_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_calendar_view_range_v2 nc_calendar_view_range_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_calendar_view_range_v2
    ADD CONSTRAINT nc_calendar_view_range_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_calendar_view_v2 nc_calendar_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_calendar_view_v2
    ADD CONSTRAINT nc_calendar_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_col_barcode_v2 nc_col_barcode_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_barcode_v2
    ADD CONSTRAINT nc_col_barcode_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_button_v2 nc_col_button_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_button_v2
    ADD CONSTRAINT nc_col_button_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_formula_v2 nc_col_formula_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_formula_v2
    ADD CONSTRAINT nc_col_formula_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_long_text_v2 nc_col_long_text_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_long_text_v2
    ADD CONSTRAINT nc_col_long_text_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_lookup_v2 nc_col_lookup_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_lookup_v2
    ADD CONSTRAINT nc_col_lookup_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_qrcode_v2 nc_col_qrcode_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_qrcode_v2
    ADD CONSTRAINT nc_col_qrcode_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_relations_v2 nc_col_relations_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_relations_v2
    ADD CONSTRAINT nc_col_relations_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_rollup_v2 nc_col_rollup_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_rollup_v2
    ADD CONSTRAINT nc_col_rollup_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_col_select_options_v2 nc_col_select_options_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_col_select_options_v2
    ADD CONSTRAINT nc_col_select_options_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_columns_v2 nc_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_columns_v2
    ADD CONSTRAINT nc_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_comment_reactions nc_comment_reactions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_comment_reactions
    ADD CONSTRAINT nc_comment_reactions_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_comments nc_comments_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_comments
    ADD CONSTRAINT nc_comments_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_custom_urls_v2 nc_custom_urls_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_custom_urls_v2
    ADD CONSTRAINT nc_custom_urls_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_dashboards_v2 nc_dashboards_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_dashboards_v2
    ADD CONSTRAINT nc_dashboards_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_data_reflection nc_data_reflection_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_data_reflection
    ADD CONSTRAINT nc_data_reflection_pkey PRIMARY KEY (id);


--
-- Name: nc_db_servers nc_db_servers_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_db_servers
    ADD CONSTRAINT nc_db_servers_pkey PRIMARY KEY (id);


--
-- Name: nc_dependency_tracker nc_dependency_tracker_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_dependency_tracker
    ADD CONSTRAINT nc_dependency_tracker_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_disabled_models_for_role_v2 nc_disabled_models_for_role_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_disabled_models_for_role_v2
    ADD CONSTRAINT nc_disabled_models_for_role_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_extensions nc_extensions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_extensions
    ADD CONSTRAINT nc_extensions_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_file_references nc_file_references_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_file_references
    ADD CONSTRAINT nc_file_references_pkey PRIMARY KEY (id);


--
-- Name: nc_filter_exp_v2 nc_filter_exp_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_filter_exp_v2
    ADD CONSTRAINT nc_filter_exp_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_follower nc_follower_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_follower
    ADD CONSTRAINT nc_follower_pkey PRIMARY KEY (fk_user_id, fk_follower_id);


--
-- Name: nc_form_view_columns_v2 nc_form_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_form_view_columns_v2
    ADD CONSTRAINT nc_form_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_form_view_v2 nc_form_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_form_view_v2
    ADD CONSTRAINT nc_form_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_gallery_view_columns_v2 nc_gallery_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_gallery_view_columns_v2
    ADD CONSTRAINT nc_gallery_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_gallery_view_v2 nc_gallery_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_gallery_view_v2
    ADD CONSTRAINT nc_gallery_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_grid_view_columns_v2 nc_grid_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_grid_view_columns_v2
    ADD CONSTRAINT nc_grid_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_grid_view_v2 nc_grid_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_grid_view_v2
    ADD CONSTRAINT nc_grid_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_hook_logs_v2 nc_hook_logs_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_hook_logs_v2
    ADD CONSTRAINT nc_hook_logs_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_hook_trigger_fields nc_hook_trigger_fields_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_hook_trigger_fields
    ADD CONSTRAINT nc_hook_trigger_fields_pkey PRIMARY KEY (fk_workspace_id, base_id, fk_hook_id, fk_column_id);


--
-- Name: nc_hooks_v2 nc_hooks_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_hooks_v2
    ADD CONSTRAINT nc_hooks_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_installations nc_installations_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_installations
    ADD CONSTRAINT nc_installations_pkey PRIMARY KEY (id);


--
-- Name: nc_integrations_store_v2 nc_integrations_store_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_integrations_store_v2
    ADD CONSTRAINT nc_integrations_store_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_integrations_v2 nc_integrations_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_integrations_v2
    ADD CONSTRAINT nc_integrations_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_jobs nc_jobs_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_jobs
    ADD CONSTRAINT nc_jobs_pkey PRIMARY KEY (id);


--
-- Name: nc_kanban_view_columns_v2 nc_kanban_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_kanban_view_columns_v2
    ADD CONSTRAINT nc_kanban_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_kanban_view_v2 nc_kanban_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_kanban_view_v2
    ADD CONSTRAINT nc_kanban_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_map_view_columns_v2 nc_map_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_map_view_columns_v2
    ADD CONSTRAINT nc_map_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_map_view_v2 nc_map_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_map_view_v2
    ADD CONSTRAINT nc_map_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_mcp_tokens nc_mcp_tokens_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_mcp_tokens
    ADD CONSTRAINT nc_mcp_tokens_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_model_stats_v2 nc_model_stats_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_model_stats_v2
    ADD CONSTRAINT nc_model_stats_v2_pkey PRIMARY KEY (fk_workspace_id, base_id, fk_model_id);


--
-- Name: nc_models_v2 nc_models_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_models_v2
    ADD CONSTRAINT nc_models_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_oauth_authorization_codes nc_oauth_authorization_codes_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_oauth_authorization_codes
    ADD CONSTRAINT nc_oauth_authorization_codes_pkey PRIMARY KEY (code);


--
-- Name: nc_oauth_clients nc_oauth_clients_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_oauth_clients
    ADD CONSTRAINT nc_oauth_clients_pkey PRIMARY KEY (client_id);


--
-- Name: nc_oauth_tokens nc_oauth_tokens_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_oauth_tokens
    ADD CONSTRAINT nc_oauth_tokens_pkey PRIMARY KEY (id);


--
-- Name: nc_org_domain nc_org_domain_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_org_domain
    ADD CONSTRAINT nc_org_domain_pkey PRIMARY KEY (id);


--
-- Name: nc_org nc_org_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_org
    ADD CONSTRAINT nc_org_pkey PRIMARY KEY (id);


--
-- Name: nc_org_users nc_org_users_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_org_users
    ADD CONSTRAINT nc_org_users_pkey PRIMARY KEY (fk_org_id);


--
-- Name: nc_list_view_columns_v2 nc_outline_view_columns_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_list_view_columns_v2
    ADD CONSTRAINT nc_outline_view_columns_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_list_view_levels_v2 nc_outline_view_levels_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_list_view_levels_v2
    ADD CONSTRAINT nc_outline_view_levels_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_list_view_v2 nc_outline_view_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_list_view_v2
    ADD CONSTRAINT nc_outline_view_v2_pkey PRIMARY KEY (base_id, fk_view_id);


--
-- Name: nc_permission_subjects nc_permission_subjects_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_permission_subjects
    ADD CONSTRAINT nc_permission_subjects_pkey PRIMARY KEY (base_id, fk_permission_id, subject_type, subject_id);


--
-- Name: nc_permissions nc_permissions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_permissions
    ADD CONSTRAINT nc_permissions_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_plans nc_plans_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_plans
    ADD CONSTRAINT nc_plans_pkey PRIMARY KEY (id);


--
-- Name: nc_plugins_v2 nc_plugins_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_plugins_v2
    ADD CONSTRAINT nc_plugins_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_principal_assignments nc_principal_assignments_pk; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_principal_assignments
    ADD CONSTRAINT nc_principal_assignments_pk PRIMARY KEY (resource_type, resource_id, principal_type, principal_ref_id);


--
-- Name: nc_bases_v2 nc_projects_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_bases_v2
    ADD CONSTRAINT nc_projects_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_record_templates nc_record_templates_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_record_templates
    ADD CONSTRAINT nc_record_templates_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_rls_policies nc_rls_policies_pk; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_rls_policies
    ADD CONSTRAINT nc_rls_policies_pk PRIMARY KEY (base_id, id);


--
-- Name: nc_rls_policy_subjects nc_rls_policy_subjects_pk; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_rls_policy_subjects
    ADD CONSTRAINT nc_rls_policy_subjects_pk PRIMARY KEY (fk_rls_policy_id, subject_type, subject_id);


--
-- Name: nc_row_color_conditions nc_row_color_conditions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_row_color_conditions
    ADD CONSTRAINT nc_row_color_conditions_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_managed_app_deployment_logs nc_sandbox_deployment_logs_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_managed_app_deployment_logs
    ADD CONSTRAINT nc_sandbox_deployment_logs_pkey PRIMARY KEY (id);


--
-- Name: nc_managed_app_versions nc_sandbox_versions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_managed_app_versions
    ADD CONSTRAINT nc_sandbox_versions_pkey PRIMARY KEY (id);


--
-- Name: nc_managed_apps nc_sandboxes_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_managed_apps
    ADD CONSTRAINT nc_sandboxes_pkey PRIMARY KEY (id);


--
-- Name: nc_sandboxes_v2 nc_sandboxes_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sandboxes_v2
    ADD CONSTRAINT nc_sandboxes_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_scim_config nc_scim_config_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_scim_config
    ADD CONSTRAINT nc_scim_config_pkey PRIMARY KEY (id);


--
-- Name: nc_scripts nc_scripts_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_scripts
    ADD CONSTRAINT nc_scripts_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_snapshots nc_snapshots_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_snapshots
    ADD CONSTRAINT nc_snapshots_pkey PRIMARY KEY (id);


--
-- Name: nc_sort_v2 nc_sort_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sort_v2
    ADD CONSTRAINT nc_sort_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_sql_executor_v2 nc_sql_executor_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sql_executor_v2
    ADD CONSTRAINT nc_sql_executor_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_sso_client_domain nc_sso_client_domain_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sso_client_domain
    ADD CONSTRAINT nc_sso_client_domain_pkey PRIMARY KEY (fk_sso_client_id);


--
-- Name: nc_sso_client nc_sso_client_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sso_client
    ADD CONSTRAINT nc_sso_client_pkey PRIMARY KEY (id);


--
-- Name: nc_store nc_store_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_store
    ADD CONSTRAINT nc_store_pkey PRIMARY KEY (id);


--
-- Name: nc_subscriptions nc_subscriptions_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_subscriptions
    ADD CONSTRAINT nc_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: nc_sync_configs nc_sync_configs_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sync_configs
    ADD CONSTRAINT nc_sync_configs_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_sync_logs_v2 nc_sync_logs_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sync_logs_v2
    ADD CONSTRAINT nc_sync_logs_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_sync_mappings nc_sync_mappings_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sync_mappings
    ADD CONSTRAINT nc_sync_mappings_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_sync_source_v2 nc_sync_source_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_sync_source_v2
    ADD CONSTRAINT nc_sync_source_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_teams nc_teams_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_teams
    ADD CONSTRAINT nc_teams_pkey PRIMARY KEY (id);


--
-- Name: nc_usage_stats nc_usage_stats_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_usage_stats
    ADD CONSTRAINT nc_usage_stats_pkey PRIMARY KEY (fk_workspace_id, usage_type, period_start);


--
-- Name: nc_user_comment_notifications_preference nc_user_comment_notifications_preference_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_user_comment_notifications_preference
    ADD CONSTRAINT nc_user_comment_notifications_preference_pkey PRIMARY KEY (id);


--
-- Name: nc_users_v2 nc_users_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_users_v2
    ADD CONSTRAINT nc_users_v2_pkey PRIMARY KEY (id);


--
-- Name: nc_view_sections nc_view_sections_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_view_sections
    ADD CONSTRAINT nc_view_sections_pkey PRIMARY KEY (id);


--
-- Name: nc_views_v2 nc_views_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_views_v2
    ADD CONSTRAINT nc_views_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_widgets_v2 nc_widgets_v2_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_widgets_v2
    ADD CONSTRAINT nc_widgets_v2_pkey PRIMARY KEY (base_id, id);


--
-- Name: nc_workflows nc_workflows_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.nc_workflows
    ADD CONSTRAINT nc_workflows_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: workspace workspace_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.workspace
    ADD CONSTRAINT workspace_pkey PRIMARY KEY (id);


--
-- Name: workspace_user workspace_user_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.workspace_user
    ADD CONSTRAINT workspace_user_pkey PRIMARY KEY (fk_workspace_id, fk_user_id);


--
-- Name: xc_knex_migrationsv0_lock xc_knex_migrationsv0_lock_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.xc_knex_migrationsv0_lock
    ADD CONSTRAINT xc_knex_migrationsv0_lock_pkey PRIMARY KEY (index);


--
-- Name: xc_knex_migrationsv0 xc_knex_migrationsv0_pkey; Type: CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor.xc_knex_migrationsv0
    ADD CONSTRAINT xc_knex_migrationsv0_pkey PRIMARY KEY (id);


--
-- Name: CarteraCache_clienteId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "CarteraCache_clienteId_idx" ON gestor."CarteraCache" USING btree ("clienteId");


--
-- Name: CarteraCache_empresaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "CarteraCache_empresaId_idx" ON gestor."CarteraCache" USING btree ("empresaId");


--
-- Name: CarteraCache_integracionId_clienteApiId_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "CarteraCache_integracionId_clienteApiId_key" ON gestor."CarteraCache" USING btree ("integracionId", "clienteApiId");


--
-- Name: CarteraCache_integracionId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "CarteraCache_integracionId_idx" ON gestor."CarteraCache" USING btree ("integracionId");


--
-- Name: ComisionCalculo_empresaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "ComisionCalculo_empresaId_idx" ON gestor."ComisionCalculo" USING btree ("empresaId");


--
-- Name: ComisionCalculo_empresaId_mes_anio_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "ComisionCalculo_empresaId_mes_anio_key" ON gestor."ComisionCalculo" USING btree ("empresaId", mes, anio);


--
-- Name: ComisionConfig_empresaId_empleadoId_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "ComisionConfig_empresaId_empleadoId_key" ON gestor."ComisionConfig" USING btree ("empresaId", "empleadoId");


--
-- Name: ComisionConfig_empresaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "ComisionConfig_empresaId_idx" ON gestor."ComisionConfig" USING btree ("empresaId");


--
-- Name: DespachoLog_empresaId_despachadoEl_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "DespachoLog_empresaId_despachadoEl_idx" ON gestor."DespachoLog" USING btree ("empresaId", "despachadoEl" DESC);


--
-- Name: DespachoLog_empresaId_numeroFactura_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "DespachoLog_empresaId_numeroFactura_idx" ON gestor."DespachoLog" USING btree ("empresaId", "numeroFactura");


--
-- Name: Empleado_email_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "Empleado_email_key" ON gestor."Empleado" USING btree (email);


--
-- Name: EmpresaVinculada_apiKey_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "EmpresaVinculada_apiKey_key" ON gestor."EmpresaVinculada" USING btree ("apiKey");


--
-- Name: Empresa_email_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "Empresa_email_key" ON gestor."Empresa" USING btree (email);


--
-- Name: InciGuardian_codigo_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "InciGuardian_codigo_key" ON gestor."InciGuardian" USING btree (codigo);


--
-- Name: InciGuardian_estado_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "InciGuardian_estado_idx" ON gestor."InciGuardian" USING btree (estado);


--
-- Name: InciGuardian_fechaInicio_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "InciGuardian_fechaInicio_idx" ON gestor."InciGuardian" USING btree ("fechaInicio");


--
-- Name: InciGuardian_modulo_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "InciGuardian_modulo_idx" ON gestor."InciGuardian" USING btree (modulo);


--
-- Name: Integracion_empresaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "Integracion_empresaId_idx" ON gestor."Integracion" USING btree ("empresaId");


--
-- Name: Integracion_subEmpresaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "Integracion_subEmpresaId_idx" ON gestor."Integracion" USING btree ("subEmpresaId");


--
-- Name: MetaRecaudo_empleadoId_mes_anio_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "MetaRecaudo_empleadoId_mes_anio_key" ON gestor."MetaRecaudo" USING btree ("empleadoId", mes, anio);


--
-- Name: OrdenDespacho_empresaId_estado_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "OrdenDespacho_empresaId_estado_idx" ON gestor."OrdenDespacho" USING btree ("empresaId", estado);


--
-- Name: OrdenDespacho_empresaId_numeroFactura_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "OrdenDespacho_empresaId_numeroFactura_idx" ON gestor."OrdenDespacho" USING btree ("empresaId", "numeroFactura");


--
-- Name: OrdenDespacho_empresaId_origenId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "OrdenDespacho_empresaId_origenId_idx" ON gestor."OrdenDespacho" USING btree ("empresaId", "origenId");


--
-- Name: OrdenDespacho_empresaId_origen_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "OrdenDespacho_empresaId_origen_idx" ON gestor."OrdenDespacho" USING btree ("empresaId", origen);


--
-- Name: OrdenDespacho_empresaId_vendedorApiId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "OrdenDespacho_empresaId_vendedorApiId_idx" ON gestor."OrdenDespacho" USING btree ("empresaId", "vendedorApiId");


--
-- Name: OrdenDespacho_numeroOrden_int_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "OrdenDespacho_numeroOrden_int_idx" ON gestor."OrdenDespacho" USING btree ((("numeroOrden")::integer) DESC, "fechaOrden" DESC) WHERE ("numeroOrden" ~ '^[0-9]+$'::text);


--
-- Name: PagoCarteraDeuda_pagoId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "PagoCarteraDeuda_pagoId_idx" ON gestor."PagoCarteraDeuda" USING btree ("pagoId");


--
-- Name: PagoCarteraDeuda_syncDeudaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "PagoCarteraDeuda_syncDeudaId_idx" ON gestor."PagoCarteraDeuda" USING btree ("syncDeudaId");


--
-- Name: PagoCartera_empleadoId_createdAt_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "PagoCartera_empleadoId_createdAt_idx" ON gestor."PagoCartera" USING btree ("empleadoId", "createdAt" DESC);


--
-- Name: PagoCartera_empleadoId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "PagoCartera_empleadoId_idx" ON gestor."PagoCartera" USING btree ("empleadoId");


--
-- Name: PagoCartera_reciboToken_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "PagoCartera_reciboToken_key" ON gestor."PagoCartera" USING btree ("reciboToken");


--
-- Name: PagoCartera_syncDeudaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "PagoCartera_syncDeudaId_idx" ON gestor."PagoCartera" USING btree ("syncDeudaId");


--
-- Name: PrecioRol_rol_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "PrecioRol_rol_key" ON gestor."PrecioRol" USING btree (rol);


--
-- Name: PushSuscripcion_empleadoId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "PushSuscripcion_empleadoId_idx" ON gestor."PushSuscripcion" USING btree ("empleadoId");


--
-- Name: RutaEmpleado_empleadoId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "RutaEmpleado_empleadoId_idx" ON gestor."RutaEmpleado" USING btree ("empleadoId");


--
-- Name: RutaFijaEmpleado_empleadoId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "RutaFijaEmpleado_empleadoId_idx" ON gestor."RutaFijaEmpleado" USING btree ("empleadoId");


--
-- Name: Ruta_empresaId_fecha_cerrada_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "Ruta_empresaId_fecha_cerrada_idx" ON gestor."Ruta" USING btree ("empresaId", fecha, cerrada);


--
-- Name: SubEmpresa_empresaId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SubEmpresa_empresaId_idx" ON gestor."SubEmpresa" USING btree ("empresaId");


--
-- Name: SyncCompra_clienteApiId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SyncCompra_clienteApiId_idx" ON gestor."SyncCompra" USING btree ("clienteApiId");


--
-- Name: SyncCompra_integracionId_externalId_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "SyncCompra_integracionId_externalId_key" ON gestor."SyncCompra" USING btree ("integracionId", "externalId");


--
-- Name: SyncCompra_integracionId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SyncCompra_integracionId_idx" ON gestor."SyncCompra" USING btree ("integracionId");


--
-- Name: SyncDeuda_clienteApiId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SyncDeuda_clienteApiId_idx" ON gestor."SyncDeuda" USING btree ("clienteApiId");


--
-- Name: SyncDeuda_integracionId_externalId_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "SyncDeuda_integracionId_externalId_key" ON gestor."SyncDeuda" USING btree ("integracionId", "externalId");


--
-- Name: SyncDeuda_integracionId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SyncDeuda_integracionId_idx" ON gestor."SyncDeuda" USING btree ("integracionId");


--
-- Name: SyncEmpleado_integracionId_externalId_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "SyncEmpleado_integracionId_externalId_key" ON gestor."SyncEmpleado" USING btree ("integracionId", "externalId");


--
-- Name: SyncEmpleado_integracionId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SyncEmpleado_integracionId_idx" ON gestor."SyncEmpleado" USING btree ("integracionId");


--
-- Name: SyncLog_integracionId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "SyncLog_integracionId_idx" ON gestor."SyncLog" USING btree ("integracionId");


--
-- Name: VentaMesCliente_clienteId_mes_key; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX "VentaMesCliente_clienteId_mes_key" ON gestor."VentaMesCliente" USING btree ("clienteId", mes);


--
-- Name: VentaMesCliente_empresaId_mes_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "VentaMesCliente_empresaId_mes_idx" ON gestor."VentaMesCliente" USING btree ("empresaId", mes);


--
-- Name: Visita_turnoId_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX "Visita_turnoId_idx" ON gestor."Visita" USING btree ("turnoId");


--
-- Name: idx_auditlog_empleado; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_auditlog_empleado ON gestor."AuditLog" USING btree ("empleadoId", "createdAt" DESC) WHERE ("empleadoId" IS NOT NULL);


--
-- Name: idx_cliente_empresa; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_cliente_empresa ON gestor."Cliente" USING btree ("empresaId");


--
-- Name: idx_cliente_lat_lng; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_cliente_lat_lng ON gestor."Cliente" USING btree (lat, lng) WHERE (lat IS NOT NULL);


--
-- Name: idx_cliente_lista; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_cliente_lista ON gestor."Cliente" USING btree ("listaId");


--
-- Name: idx_cliente_nit; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_cliente_nit ON gestor."Cliente" USING btree (nit);


--
-- Name: idx_cliente_nombre; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_cliente_nombre ON gestor."Cliente" USING btree (nombre);


--
-- Name: idx_empleado_empresa_activo; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_empleado_empresa_activo ON gestor."Empleado" USING btree ("empresaId", activo);


--
-- Name: idx_inci_estado; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_inci_estado ON gestor."InciGuardian" USING btree (estado);


--
-- Name: idx_inci_fecha; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_inci_fecha ON gestor."InciGuardian" USING btree ("fechaInicio" DESC);


--
-- Name: idx_inci_modulo; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_inci_modulo ON gestor."InciGuardian" USING btree (modulo);


--
-- Name: idx_inci_proyecto; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_inci_proyecto ON gestor."InciGuardian" USING btree (proyecto);


--
-- Name: idx_orden_factura_int; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_orden_factura_int ON gestor."OrdenDespacho" USING btree ((("numeroFactura")::integer));


--
-- Name: idx_orden_isactiva; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_orden_isactiva ON gestor."OrdenDespacho" USING btree ("isActiva");


--
-- Name: idx_orden_origen_unique; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX idx_orden_origen_unique ON gestor."OrdenDespacho" USING btree ("empresaId", "origenVinculadaId", "origenId") WHERE (("origenId" IS NOT NULL) AND ("origenId" <> ''::text));


--
-- Name: idx_orden_repartidor; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_orden_repartidor ON gestor."OrdenDespacho" USING btree ("repartidorId") WHERE ("repartidorId" IS NOT NULL);


--
-- Name: idx_orden_vendedor_mes; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_orden_vendedor_mes ON gestor."OrdenDespacho" USING btree ("vendedorApiId", "fechaOrden", "isFacturada", "isActiva") WHERE (("isFacturada" = true) AND ("isActiva" = true));


--
-- Name: idx_orden_vinculada; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_orden_vinculada ON gestor."OrdenDespacho" USING btree ("origenVinculadaId") WHERE ("origenVinculadaId" IS NOT NULL);


--
-- Name: idx_pagocartera_empleado_fecha; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_pagocartera_empleado_fecha ON gestor."PagoCartera" USING btree ("empleadoId", "createdAt" DESC) WHERE ("empleadoId" IS NOT NULL);


--
-- Name: idx_ruta_empresa; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_ruta_empresa ON gestor."Ruta" USING btree ("empresaId");


--
-- Name: idx_rutacliente_ruta; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_rutacliente_ruta ON gestor."RutaCliente" USING btree ("rutaId");


--
-- Name: idx_syncdeuda_empleado_extid; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_syncdeuda_empleado_extid ON gestor."SyncDeuda" USING btree ("empleadoExternalId") WHERE ("empleadoExternalId" IS NOT NULL);


--
-- Name: idx_turno_empleado; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_turno_empleado ON gestor."Turno" USING btree ("empleadoId");


--
-- Name: idx_turno_empleado_activo; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_turno_empleado_activo ON gestor."Turno" USING btree ("empleadoId", activo) WHERE (activo = true);


--
-- Name: idx_ventamescliente_cliente; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_ventamescliente_cliente ON gestor."VentaMesCliente" USING btree ("clienteId", mes);


--
-- Name: idx_visita_empleado; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_visita_empleado ON gestor."Visita" USING btree ("empleadoId");


--
-- Name: idx_visita_empleado_cliente; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_visita_empleado_cliente ON gestor."Visita" USING btree ("empleadoId", "clienteId");


--
-- Name: idx_visita_fecha; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_visita_fecha ON gestor."Visita" USING btree ("createdAt");


--
-- Name: idx_visita_fecha_bogota; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_visita_fecha_bogota ON gestor."Visita" USING btree ("fechaBogota");


--
-- Name: idx_visita_turno; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX idx_visita_turno ON gestor."Visita" USING btree ("turnoId") WHERE ("turnoId" IS NOT NULL);


--
-- Name: nc_api_tokens_fk_sso_client_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_api_tokens_fk_sso_client_id_index ON gestor.nc_api_tokens USING btree (fk_sso_client_id);


--
-- Name: nc_api_tokens_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_api_tokens_fk_user_id_index ON gestor.nc_api_tokens USING btree (fk_user_id);


--
-- Name: nc_audit_v2_fk_workspace_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_audit_v2_fk_workspace_idx ON gestor.nc_audit_v2 USING btree (fk_workspace_id);


--
-- Name: nc_audit_v2_old_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_audit_v2_old_id_index ON gestor.nc_audit_v2 USING btree (old_id);


--
-- Name: nc_audit_v2_tenant_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_audit_v2_tenant_idx ON gestor.nc_audit_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_automation_executions_error_notify_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automation_executions_error_notify_idx ON gestor.nc_automation_executions USING btree (status, error_notified_at);


--
-- Name: nc_automation_executions_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automation_executions_oldpk_idx ON gestor.nc_automation_executions USING btree (id);


--
-- Name: nc_automation_executions_resume_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automation_executions_resume_idx ON gestor.nc_automation_executions USING btree (fk_workspace_id, base_id, resume_at);


--
-- Name: nc_automation_subscribers_automation_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automation_subscribers_automation_idx ON gestor.nc_automation_subscribers USING btree (fk_automation_id);


--
-- Name: nc_automation_subscribers_unique_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX nc_automation_subscribers_unique_idx ON gestor.nc_automation_subscribers USING btree (fk_automation_id, fk_user_id);


--
-- Name: nc_automation_subscribers_user_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automation_subscribers_user_idx ON gestor.nc_automation_subscribers USING btree (fk_user_id);


--
-- Name: nc_automations_context_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automations_context_idx ON gestor.nc_automations USING btree (base_id, fk_workspace_id);


--
-- Name: nc_automations_enabled_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automations_enabled_idx ON gestor.nc_automations USING btree (enabled);


--
-- Name: nc_automations_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automations_oldpk_idx ON gestor.nc_automations USING btree (id);


--
-- Name: nc_automations_order_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automations_order_idx ON gestor.nc_automations USING btree (base_id, "order");


--
-- Name: nc_automations_type_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_automations_type_idx ON gestor.nc_automations USING btree (type);


--
-- Name: nc_base_users_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_base_users_v2_base_id_fk_workspace_id_index ON gestor.nc_base_users_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_base_users_v2_invited_by_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_base_users_v2_invited_by_index ON gestor.nc_base_users_v2 USING btree (invited_by);


--
-- Name: nc_bases_is_sandbox_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_is_sandbox_idx ON gestor.nc_bases_v2 USING btree (is_sandbox);


--
-- Name: nc_bases_is_sandbox_master_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_is_sandbox_master_idx ON gestor.nc_bases_v2 USING btree (is_sandbox_master);


--
-- Name: nc_bases_managed_app_auto_update_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_managed_app_auto_update_idx ON gestor.nc_bases_v2 USING btree (managed_app_id, auto_update);


--
-- Name: nc_bases_managed_app_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_managed_app_id_idx ON gestor.nc_bases_v2 USING btree (managed_app_id);


--
-- Name: nc_bases_managed_app_master_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_managed_app_master_idx ON gestor.nc_bases_v2 USING btree (managed_app_master);


--
-- Name: nc_bases_managed_app_version_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_managed_app_version_id_idx ON gestor.nc_bases_v2 USING btree (managed_app_version_id);


--
-- Name: nc_bases_v2_fk_custom_url_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_v2_fk_custom_url_id_index ON gestor.nc_bases_v2 USING btree (fk_custom_url_id);


--
-- Name: nc_bases_v2_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_bases_v2_fk_workspace_id_index ON gestor.nc_bases_v2 USING btree (fk_workspace_id);


--
-- Name: nc_calendar_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_calendar_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_calendar_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_calendar_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_calendar_view_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_columns_v2_oldpk_idx ON gestor.nc_calendar_view_columns_v2 USING btree (id);


--
-- Name: nc_calendar_view_range_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_range_v2_base_id_fk_workspace_id_index ON gestor.nc_calendar_view_range_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_calendar_view_range_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_range_v2_oldpk_idx ON gestor.nc_calendar_view_range_v2 USING btree (id);


--
-- Name: nc_calendar_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_v2_base_id_fk_workspace_id_index ON gestor.nc_calendar_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_calendar_view_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_calendar_view_v2_oldpk_idx ON gestor.nc_calendar_view_v2 USING btree (fk_view_id);


--
-- Name: nc_col_barcode_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_barcode_v2_base_id_fk_workspace_id_index ON gestor.nc_col_barcode_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_barcode_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_barcode_v2_fk_column_id_index ON gestor.nc_col_barcode_v2 USING btree (fk_column_id);


--
-- Name: nc_col_barcode_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_barcode_v2_oldpk_idx ON gestor.nc_col_barcode_v2 USING btree (id);


--
-- Name: nc_col_button_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_button_context ON gestor.nc_col_button_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_button_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_button_v2_fk_column_id_index ON gestor.nc_col_button_v2 USING btree (fk_column_id);


--
-- Name: nc_col_button_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_button_v2_oldpk_idx ON gestor.nc_col_button_v2 USING btree (id);


--
-- Name: nc_col_formula_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_formula_v2_base_id_fk_workspace_id_index ON gestor.nc_col_formula_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_formula_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_formula_v2_fk_column_id_index ON gestor.nc_col_formula_v2 USING btree (fk_column_id);


--
-- Name: nc_col_formula_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_formula_v2_oldpk_idx ON gestor.nc_col_formula_v2 USING btree (id);


--
-- Name: nc_col_long_text_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_long_text_context ON gestor.nc_col_long_text_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_long_text_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_long_text_v2_fk_column_id_index ON gestor.nc_col_long_text_v2 USING btree (fk_column_id);


--
-- Name: nc_col_long_text_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_long_text_v2_oldpk_idx ON gestor.nc_col_long_text_v2 USING btree (id);


--
-- Name: nc_col_lookup_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_lookup_v2_base_id_fk_workspace_id_index ON gestor.nc_col_lookup_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_lookup_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_lookup_v2_fk_column_id_index ON gestor.nc_col_lookup_v2 USING btree (fk_column_id);


--
-- Name: nc_col_lookup_v2_fk_lookup_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_lookup_v2_fk_lookup_column_id_index ON gestor.nc_col_lookup_v2 USING btree (fk_lookup_column_id);


--
-- Name: nc_col_lookup_v2_fk_relation_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_lookup_v2_fk_relation_column_id_index ON gestor.nc_col_lookup_v2 USING btree (fk_relation_column_id);


--
-- Name: nc_col_lookup_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_lookup_v2_oldpk_idx ON gestor.nc_col_lookup_v2 USING btree (id);


--
-- Name: nc_col_qrcode_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_qrcode_v2_base_id_fk_workspace_id_index ON gestor.nc_col_qrcode_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_qrcode_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_qrcode_v2_fk_column_id_index ON gestor.nc_col_qrcode_v2 USING btree (fk_column_id);


--
-- Name: nc_col_qrcode_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_qrcode_v2_oldpk_idx ON gestor.nc_col_qrcode_v2 USING btree (id);


--
-- Name: nc_col_relations_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_base_id_fk_workspace_id_index ON gestor.nc_col_relations_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_relations_v2_fk_child_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_child_column_id_index ON gestor.nc_col_relations_v2 USING btree (fk_child_column_id);


--
-- Name: nc_col_relations_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_column_id_index ON gestor.nc_col_relations_v2 USING btree (fk_column_id);


--
-- Name: nc_col_relations_v2_fk_mm_child_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_mm_child_column_id_index ON gestor.nc_col_relations_v2 USING btree (fk_mm_child_column_id);


--
-- Name: nc_col_relations_v2_fk_mm_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_mm_model_id_index ON gestor.nc_col_relations_v2 USING btree (fk_mm_model_id);


--
-- Name: nc_col_relations_v2_fk_mm_parent_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_mm_parent_column_id_index ON gestor.nc_col_relations_v2 USING btree (fk_mm_parent_column_id);


--
-- Name: nc_col_relations_v2_fk_parent_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_parent_column_id_index ON gestor.nc_col_relations_v2 USING btree (fk_parent_column_id);


--
-- Name: nc_col_relations_v2_fk_related_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_related_model_id_index ON gestor.nc_col_relations_v2 USING btree (fk_related_model_id);


--
-- Name: nc_col_relations_v2_fk_target_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_fk_target_view_id_index ON gestor.nc_col_relations_v2 USING btree (fk_target_view_id);


--
-- Name: nc_col_relations_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_relations_v2_oldpk_idx ON gestor.nc_col_relations_v2 USING btree (id);


--
-- Name: nc_col_rollup_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_rollup_v2_base_id_fk_workspace_id_index ON gestor.nc_col_rollup_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_rollup_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_rollup_v2_fk_column_id_index ON gestor.nc_col_rollup_v2 USING btree (fk_column_id);


--
-- Name: nc_col_rollup_v2_fk_relation_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_rollup_v2_fk_relation_column_id_index ON gestor.nc_col_rollup_v2 USING btree (fk_relation_column_id);


--
-- Name: nc_col_rollup_v2_fk_rollup_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_rollup_v2_fk_rollup_column_id_index ON gestor.nc_col_rollup_v2 USING btree (fk_rollup_column_id);


--
-- Name: nc_col_rollup_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_rollup_v2_oldpk_idx ON gestor.nc_col_rollup_v2 USING btree (id);


--
-- Name: nc_col_select_options_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_select_options_v2_base_id_fk_workspace_id_index ON gestor.nc_col_select_options_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_col_select_options_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_select_options_v2_fk_column_id_index ON gestor.nc_col_select_options_v2 USING btree (fk_column_id);


--
-- Name: nc_col_select_options_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_col_select_options_v2_oldpk_idx ON gestor.nc_col_select_options_v2 USING btree (id);


--
-- Name: nc_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_columns_v2_fk_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_columns_v2_fk_model_id_index ON gestor.nc_columns_v2 USING btree (fk_model_id);


--
-- Name: nc_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_columns_v2_oldpk_idx ON gestor.nc_columns_v2 USING btree (id);


--
-- Name: nc_comment_reactions_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comment_reactions_base_id_fk_workspace_id_index ON gestor.nc_comment_reactions USING btree (base_id, fk_workspace_id);


--
-- Name: nc_comment_reactions_comment_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comment_reactions_comment_id_index ON gestor.nc_comment_reactions USING btree (comment_id);


--
-- Name: nc_comment_reactions_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comment_reactions_oldpk_idx ON gestor.nc_comment_reactions USING btree (id);


--
-- Name: nc_comment_reactions_row_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comment_reactions_row_id_index ON gestor.nc_comment_reactions USING btree (row_id);


--
-- Name: nc_comments_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comments_base_id_fk_workspace_id_index ON gestor.nc_comments USING btree (base_id, fk_workspace_id);


--
-- Name: nc_comments_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comments_oldpk_idx ON gestor.nc_comments USING btree (id);


--
-- Name: nc_comments_row_id_fk_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_comments_row_id_fk_model_id_index ON gestor.nc_comments USING btree (row_id, fk_model_id);


--
-- Name: nc_custom_urls_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_custom_urls_context ON gestor.nc_custom_urls_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_custom_urls_v2_custom_path_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_custom_urls_v2_custom_path_index ON gestor.nc_custom_urls_v2 USING btree (custom_path);


--
-- Name: nc_custom_urls_v2_fk_dashboard_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_custom_urls_v2_fk_dashboard_id_index ON gestor.nc_custom_urls_v2 USING btree (fk_dashboard_id);


--
-- Name: nc_custom_urls_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_custom_urls_v2_oldpk_idx ON gestor.nc_custom_urls_v2 USING btree (id);


--
-- Name: nc_dashboards_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dashboards_context ON gestor.nc_dashboards_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_dashboards_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dashboards_v2_oldpk_idx ON gestor.nc_dashboards_v2 USING btree (id);


--
-- Name: nc_data_reflection_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_data_reflection_fk_workspace_id_index ON gestor.nc_data_reflection USING btree (fk_workspace_id);


--
-- Name: nc_dependency_tracker_context_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_context_idx ON gestor.nc_dependency_tracker USING btree (base_id, fk_workspace_id);


--
-- Name: nc_dependency_tracker_dependent_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_dependent_idx ON gestor.nc_dependency_tracker USING btree (dependent_type, dependent_id);


--
-- Name: nc_dependency_tracker_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_oldpk_idx ON gestor.nc_dependency_tracker USING btree (id);


--
-- Name: nc_dependency_tracker_queryable_field_0_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_queryable_field_0_idx ON gestor.nc_dependency_tracker USING btree (queryable_field_0);


--
-- Name: nc_dependency_tracker_queryable_field_1_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_queryable_field_1_idx ON gestor.nc_dependency_tracker USING btree (queryable_field_1);


--
-- Name: nc_dependency_tracker_queryable_field_2_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_queryable_field_2_idx ON gestor.nc_dependency_tracker USING btree (queryable_field_2);


--
-- Name: nc_dependency_tracker_source_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_dependency_tracker_source_idx ON gestor.nc_dependency_tracker USING btree (source_type, source_id);


--
-- Name: nc_disabled_models_for_role_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_disabled_models_for_role_v2_base_id_fk_workspace_id_index ON gestor.nc_disabled_models_for_role_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_disabled_models_for_role_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_disabled_models_for_role_v2_fk_view_id_index ON gestor.nc_disabled_models_for_role_v2 USING btree (fk_view_id);


--
-- Name: nc_disabled_models_for_role_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_disabled_models_for_role_v2_oldpk_idx ON gestor.nc_disabled_models_for_role_v2 USING btree (id);


--
-- Name: nc_extensions_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_extensions_base_id_fk_workspace_id_index ON gestor.nc_extensions USING btree (base_id, fk_workspace_id);


--
-- Name: nc_extensions_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_extensions_oldpk_idx ON gestor.nc_extensions USING btree (id);


--
-- Name: nc_filter_exp_rls_policy_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_rls_policy_idx ON gestor.nc_filter_exp_v2 USING btree (fk_rls_policy_id);


--
-- Name: nc_filter_exp_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_base_id_fk_workspace_id_index ON gestor.nc_filter_exp_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_filter_exp_v2_fk_button_col_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_button_col_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_button_col_id);


--
-- Name: nc_filter_exp_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_column_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_column_id);


--
-- Name: nc_filter_exp_v2_fk_hook_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_hook_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_hook_id);


--
-- Name: nc_filter_exp_v2_fk_level_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_level_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_level_id);


--
-- Name: nc_filter_exp_v2_fk_link_col_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_link_col_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_link_col_id);


--
-- Name: nc_filter_exp_v2_fk_parent_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_parent_column_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_parent_column_id);


--
-- Name: nc_filter_exp_v2_fk_parent_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_parent_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_parent_id);


--
-- Name: nc_filter_exp_v2_fk_value_col_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_value_col_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_value_col_id);


--
-- Name: nc_filter_exp_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_view_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_view_id);


--
-- Name: nc_filter_exp_v2_fk_widget_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_fk_widget_id_index ON gestor.nc_filter_exp_v2 USING btree (fk_widget_id);


--
-- Name: nc_filter_exp_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_filter_exp_v2_oldpk_idx ON gestor.nc_filter_exp_v2 USING btree (id);


--
-- Name: nc_follower_fk_follower_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_follower_fk_follower_id_index ON gestor.nc_follower USING btree (fk_follower_id);


--
-- Name: nc_follower_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_follower_fk_user_id_index ON gestor.nc_follower USING btree (fk_user_id);


--
-- Name: nc_form_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_form_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_form_view_columns_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_columns_v2_fk_column_id_index ON gestor.nc_form_view_columns_v2 USING btree (fk_column_id);


--
-- Name: nc_form_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_form_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_form_view_columns_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_columns_v2_fk_view_id_index ON gestor.nc_form_view_columns_v2 USING btree (fk_view_id);


--
-- Name: nc_form_view_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_columns_v2_oldpk_idx ON gestor.nc_form_view_columns_v2 USING btree (id);


--
-- Name: nc_form_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_v2_base_id_fk_workspace_id_index ON gestor.nc_form_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_form_view_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_v2_fk_view_id_index ON gestor.nc_form_view_v2 USING btree (fk_view_id);


--
-- Name: nc_form_view_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_form_view_v2_oldpk_idx ON gestor.nc_form_view_v2 USING btree (fk_view_id);


--
-- Name: nc_fr_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_fr_context ON gestor.nc_file_references USING btree (base_id, fk_workspace_id);


--
-- Name: nc_gallery_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_gallery_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_gallery_view_columns_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_columns_v2_fk_column_id_index ON gestor.nc_gallery_view_columns_v2 USING btree (fk_column_id);


--
-- Name: nc_gallery_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_gallery_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_gallery_view_columns_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_columns_v2_fk_view_id_index ON gestor.nc_gallery_view_columns_v2 USING btree (fk_view_id);


--
-- Name: nc_gallery_view_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_columns_v2_oldpk_idx ON gestor.nc_gallery_view_columns_v2 USING btree (id);


--
-- Name: nc_gallery_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_v2_base_id_fk_workspace_id_index ON gestor.nc_gallery_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_gallery_view_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_v2_fk_view_id_index ON gestor.nc_gallery_view_v2 USING btree (fk_view_id);


--
-- Name: nc_gallery_view_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_gallery_view_v2_oldpk_idx ON gestor.nc_gallery_view_v2 USING btree (fk_view_id);


--
-- Name: nc_grid_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_grid_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_grid_view_columns_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_columns_v2_fk_column_id_index ON gestor.nc_grid_view_columns_v2 USING btree (fk_column_id);


--
-- Name: nc_grid_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_grid_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_grid_view_columns_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_columns_v2_fk_view_id_index ON gestor.nc_grid_view_columns_v2 USING btree (fk_view_id);


--
-- Name: nc_grid_view_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_columns_v2_oldpk_idx ON gestor.nc_grid_view_columns_v2 USING btree (id);


--
-- Name: nc_grid_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_v2_base_id_fk_workspace_id_index ON gestor.nc_grid_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_grid_view_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_v2_fk_view_id_index ON gestor.nc_grid_view_v2 USING btree (fk_view_id);


--
-- Name: nc_grid_view_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_grid_view_v2_oldpk_idx ON gestor.nc_grid_view_v2 USING btree (fk_view_id);


--
-- Name: nc_hook_logs_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_hook_logs_v2_base_id_fk_workspace_id_index ON gestor.nc_hook_logs_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_hook_logs_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_hook_logs_v2_oldpk_idx ON gestor.nc_hook_logs_v2 USING btree (id);


--
-- Name: nc_hooks_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_hooks_v2_base_id_fk_workspace_id_index ON gestor.nc_hooks_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_hooks_v2_fk_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_hooks_v2_fk_model_id_index ON gestor.nc_hooks_v2 USING btree (fk_model_id);


--
-- Name: nc_hooks_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_hooks_v2_oldpk_idx ON gestor.nc_hooks_v2 USING btree (id);


--
-- Name: nc_installations_license_key_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_installations_license_key_idx ON gestor.nc_installations USING btree (license_key);


--
-- Name: nc_integrations_store_v2_fk_integration_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_integrations_store_v2_fk_integration_id_index ON gestor.nc_integrations_store_v2 USING btree (fk_integration_id);


--
-- Name: nc_integrations_v2_created_by_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_integrations_v2_created_by_index ON gestor.nc_integrations_v2 USING btree (created_by);


--
-- Name: nc_integrations_v2_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_integrations_v2_fk_workspace_id_index ON gestor.nc_integrations_v2 USING btree (fk_workspace_id);


--
-- Name: nc_integrations_v2_type_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_integrations_v2_type_index ON gestor.nc_integrations_v2 USING btree (type);


--
-- Name: nc_jobs_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_jobs_context ON gestor.nc_jobs USING btree (base_id, fk_workspace_id);


--
-- Name: nc_kanban_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_kanban_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_kanban_view_columns_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_columns_v2_fk_column_id_index ON gestor.nc_kanban_view_columns_v2 USING btree (fk_column_id);


--
-- Name: nc_kanban_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_kanban_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_kanban_view_columns_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_columns_v2_fk_view_id_index ON gestor.nc_kanban_view_columns_v2 USING btree (fk_view_id);


--
-- Name: nc_kanban_view_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_columns_v2_oldpk_idx ON gestor.nc_kanban_view_columns_v2 USING btree (id);


--
-- Name: nc_kanban_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_v2_base_id_fk_workspace_id_index ON gestor.nc_kanban_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_kanban_view_v2_fk_grp_col_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_v2_fk_grp_col_id_index ON gestor.nc_kanban_view_v2 USING btree (fk_grp_col_id);


--
-- Name: nc_kanban_view_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_v2_fk_view_id_index ON gestor.nc_kanban_view_v2 USING btree (fk_view_id);


--
-- Name: nc_kanban_view_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_kanban_view_v2_oldpk_idx ON gestor.nc_kanban_view_v2 USING btree (fk_view_id);


--
-- Name: nc_managed_app_deployment_logs_managed_app_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_managed_app_deployment_logs_managed_app_id_idx ON gestor.nc_managed_app_deployment_logs USING btree (fk_managed_app_id);


--
-- Name: nc_managed_app_versions_managed_app_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_managed_app_versions_managed_app_id_idx ON gestor.nc_managed_app_versions USING btree (fk_managed_app_id);


--
-- Name: nc_managed_app_versions_number_unique_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX nc_managed_app_versions_number_unique_idx ON gestor.nc_managed_app_versions USING btree (fk_managed_app_id, version_number);


--
-- Name: nc_managed_app_versions_ordering_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_managed_app_versions_ordering_idx ON gestor.nc_managed_app_versions USING btree (fk_managed_app_id, version_number);


--
-- Name: nc_managed_app_versions_status_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_managed_app_versions_status_idx ON gestor.nc_managed_app_versions USING btree (fk_managed_app_id, status);


--
-- Name: nc_managed_app_versions_unique_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX nc_managed_app_versions_unique_idx ON gestor.nc_managed_app_versions USING btree (fk_managed_app_id, version);


--
-- Name: nc_map_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_map_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_map_view_columns_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_columns_v2_fk_column_id_index ON gestor.nc_map_view_columns_v2 USING btree (fk_column_id);


--
-- Name: nc_map_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_map_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_map_view_columns_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_columns_v2_fk_view_id_index ON gestor.nc_map_view_columns_v2 USING btree (fk_view_id);


--
-- Name: nc_map_view_columns_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_columns_v2_oldpk_idx ON gestor.nc_map_view_columns_v2 USING btree (id);


--
-- Name: nc_map_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_v2_base_id_fk_workspace_id_index ON gestor.nc_map_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_map_view_v2_fk_geo_data_col_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_v2_fk_geo_data_col_id_index ON gestor.nc_map_view_v2 USING btree (fk_geo_data_col_id);


--
-- Name: nc_map_view_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_v2_fk_view_id_index ON gestor.nc_map_view_v2 USING btree (fk_view_id);


--
-- Name: nc_map_view_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_map_view_v2_oldpk_idx ON gestor.nc_map_view_v2 USING btree (fk_view_id);


--
-- Name: nc_mc_tokens_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_mc_tokens_context ON gestor.nc_mcp_tokens USING btree (base_id, fk_workspace_id);


--
-- Name: nc_mcp_tokens_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_mcp_tokens_oldpk_idx ON gestor.nc_mcp_tokens USING btree (id);


--
-- Name: nc_model_stats_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_model_stats_v2_base_id_fk_workspace_id_index ON gestor.nc_model_stats_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_model_stats_v2_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_model_stats_v2_fk_workspace_id_index ON gestor.nc_model_stats_v2 USING btree (fk_workspace_id);


--
-- Name: nc_model_stats_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_model_stats_v2_oldpk_idx ON gestor.nc_model_stats_v2 USING btree (fk_workspace_id, fk_model_id);


--
-- Name: nc_models_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_models_v2_base_id_fk_workspace_id_index ON gestor.nc_models_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_models_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_models_v2_oldpk_idx ON gestor.nc_models_v2 USING btree (id);


--
-- Name: nc_models_v2_source_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_models_v2_source_id_index ON gestor.nc_models_v2 USING btree (source_id);


--
-- Name: nc_models_v2_type_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_models_v2_type_index ON gestor.nc_models_v2 USING btree (type);


--
-- Name: nc_models_v2_uuid_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_models_v2_uuid_index ON gestor.nc_models_v2 USING btree (uuid);


--
-- Name: nc_oauth_authorization_codes_code_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_authorization_codes_code_index ON gestor.nc_oauth_authorization_codes USING btree (code);


--
-- Name: nc_oauth_authorization_codes_expires_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_authorization_codes_expires_at_index ON gestor.nc_oauth_authorization_codes USING btree (expires_at);


--
-- Name: nc_oauth_authorization_codes_fk_client_id_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_authorization_codes_fk_client_id_fk_user_id_index ON gestor.nc_oauth_authorization_codes USING btree (fk_client_id, fk_user_id);


--
-- Name: nc_oauth_authorization_codes_fk_client_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_authorization_codes_fk_client_id_index ON gestor.nc_oauth_authorization_codes USING btree (fk_client_id);


--
-- Name: nc_oauth_authorization_codes_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_authorization_codes_fk_user_id_index ON gestor.nc_oauth_authorization_codes USING btree (fk_user_id);


--
-- Name: nc_oauth_authorization_codes_is_used_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_authorization_codes_is_used_index ON gestor.nc_oauth_authorization_codes USING btree (is_used);


--
-- Name: nc_oauth_clients_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_clients_fk_user_id_index ON gestor.nc_oauth_clients USING btree (fk_user_id);


--
-- Name: nc_oauth_tokens_access_token_expires_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_access_token_expires_at_index ON gestor.nc_oauth_tokens USING btree (access_token_expires_at);


--
-- Name: nc_oauth_tokens_access_token_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_access_token_index ON gestor.nc_oauth_tokens USING btree (access_token);


--
-- Name: nc_oauth_tokens_fk_client_id_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_fk_client_id_fk_user_id_index ON gestor.nc_oauth_tokens USING btree (fk_client_id, fk_user_id);


--
-- Name: nc_oauth_tokens_fk_client_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_fk_client_id_index ON gestor.nc_oauth_tokens USING btree (fk_client_id);


--
-- Name: nc_oauth_tokens_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_fk_user_id_index ON gestor.nc_oauth_tokens USING btree (fk_user_id);


--
-- Name: nc_oauth_tokens_is_revoked_access_token_expires_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_is_revoked_access_token_expires_at_index ON gestor.nc_oauth_tokens USING btree (is_revoked, access_token_expires_at);


--
-- Name: nc_oauth_tokens_is_revoked_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_is_revoked_index ON gestor.nc_oauth_tokens USING btree (is_revoked);


--
-- Name: nc_oauth_tokens_last_used_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_last_used_at_index ON gestor.nc_oauth_tokens USING btree (last_used_at);


--
-- Name: nc_oauth_tokens_refresh_token_expires_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_refresh_token_expires_at_index ON gestor.nc_oauth_tokens USING btree (refresh_token_expires_at);


--
-- Name: nc_oauth_tokens_refresh_token_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_oauth_tokens_refresh_token_index ON gestor.nc_oauth_tokens USING btree (refresh_token);


--
-- Name: nc_org_domain_domain_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_org_domain_domain_index ON gestor.nc_org_domain USING btree (domain);


--
-- Name: nc_org_domain_fk_org_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_org_domain_fk_org_id_index ON gestor.nc_org_domain USING btree (fk_org_id);


--
-- Name: nc_org_domain_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_org_domain_fk_user_id_index ON gestor.nc_org_domain USING btree (fk_user_id);


--
-- Name: nc_org_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_org_fk_user_id_index ON gestor.nc_org USING btree (fk_user_id);


--
-- Name: nc_org_slug_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_org_slug_index ON gestor.nc_org USING btree (slug);


--
-- Name: nc_outline_view_columns_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_columns_v2_base_id_fk_workspace_id_index ON gestor.nc_list_view_columns_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_outline_view_columns_v2_fk_view_id_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_columns_v2_fk_view_id_fk_column_id_index ON gestor.nc_list_view_columns_v2 USING btree (fk_view_id, fk_column_id);


--
-- Name: nc_outline_view_columns_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_columns_v2_fk_view_id_index ON gestor.nc_list_view_columns_v2 USING btree (fk_view_id);


--
-- Name: nc_outline_view_levels_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_levels_v2_base_id_fk_workspace_id_index ON gestor.nc_list_view_levels_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_outline_view_levels_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_levels_v2_fk_view_id_index ON gestor.nc_list_view_levels_v2 USING btree (fk_view_id);


--
-- Name: nc_outline_view_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_v2_base_id_fk_workspace_id_index ON gestor.nc_list_view_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_outline_view_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_outline_view_v2_fk_view_id_index ON gestor.nc_list_view_v2 USING btree (fk_view_id);


--
-- Name: nc_permission_subjects_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_permission_subjects_context ON gestor.nc_permission_subjects USING btree (fk_workspace_id, base_id);


--
-- Name: nc_permission_subjects_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_permission_subjects_oldpk_idx ON gestor.nc_permission_subjects USING btree (fk_permission_id, subject_type, subject_id);


--
-- Name: nc_permissions_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_permissions_context ON gestor.nc_permissions USING btree (base_id, fk_workspace_id);


--
-- Name: nc_permissions_entity; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_permissions_entity ON gestor.nc_permissions USING btree (entity, entity_id, permission);


--
-- Name: nc_permissions_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_permissions_oldpk_idx ON gestor.nc_permissions USING btree (id);


--
-- Name: nc_plans_stripe_product_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_plans_stripe_product_idx ON gestor.nc_plans USING btree (stripe_product_id);


--
-- Name: nc_principal_assignments_principal_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_principal_assignments_principal_idx ON gestor.nc_principal_assignments USING btree (principal_type, principal_ref_id);


--
-- Name: nc_principal_assignments_principal_resource_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_principal_assignments_principal_resource_idx ON gestor.nc_principal_assignments USING btree (principal_type, principal_ref_id, resource_type);


--
-- Name: nc_principal_assignments_resource_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_principal_assignments_resource_idx ON gestor.nc_principal_assignments USING btree (resource_type, resource_id);


--
-- Name: nc_principal_assignments_resource_principal_type_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_principal_assignments_resource_principal_type_idx ON gestor.nc_principal_assignments USING btree (resource_type, resource_id, principal_type);


--
-- Name: nc_project_users_v2_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_project_users_v2_fk_user_id_index ON gestor.nc_base_users_v2 USING btree (fk_user_id);


--
-- Name: nc_record_audit_v2_tenant_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_record_audit_v2_tenant_idx ON gestor.nc_audit_v2 USING btree (base_id, fk_model_id, row_id, fk_workspace_id);


--
-- Name: nc_record_templates_base_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_record_templates_base_id_index ON gestor.nc_record_templates USING btree (base_id);


--
-- Name: nc_record_templates_fk_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_record_templates_fk_model_id_index ON gestor.nc_record_templates USING btree (fk_model_id);


--
-- Name: nc_record_templates_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_record_templates_fk_workspace_id_index ON gestor.nc_record_templates USING btree (fk_workspace_id);


--
-- Name: nc_rls_policies_model_default_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_rls_policies_model_default_idx ON gestor.nc_rls_policies USING btree (fk_model_id, is_default);


--
-- Name: nc_rls_policies_model_enabled_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_rls_policies_model_enabled_idx ON gestor.nc_rls_policies USING btree (fk_model_id, enabled);


--
-- Name: nc_rls_policy_subjects_context_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_rls_policy_subjects_context_idx ON gestor.nc_rls_policy_subjects USING btree (fk_workspace_id, base_id);


--
-- Name: nc_row_color_conditions_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_row_color_conditions_fk_view_id_index ON gestor.nc_row_color_conditions USING btree (fk_view_id);


--
-- Name: nc_row_color_conditions_fk_workspace_id_base_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_row_color_conditions_fk_workspace_id_base_id_index ON gestor.nc_row_color_conditions USING btree (fk_workspace_id, base_id);


--
-- Name: nc_row_color_conditions_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_row_color_conditions_oldpk_idx ON gestor.nc_row_color_conditions USING btree (id);


--
-- Name: nc_sandbox_deployment_logs_base_created_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_deployment_logs_base_created_idx ON gestor.nc_managed_app_deployment_logs USING btree (base_id, created_at);


--
-- Name: nc_sandbox_deployment_logs_base_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_deployment_logs_base_id_idx ON gestor.nc_managed_app_deployment_logs USING btree (base_id);


--
-- Name: nc_sandbox_deployment_logs_from_version_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_deployment_logs_from_version_idx ON gestor.nc_managed_app_deployment_logs USING btree (from_version_id);


--
-- Name: nc_sandbox_deployment_logs_status_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_deployment_logs_status_idx ON gestor.nc_managed_app_deployment_logs USING btree (status);


--
-- Name: nc_sandbox_deployment_logs_to_version_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_deployment_logs_to_version_idx ON gestor.nc_managed_app_deployment_logs USING btree (to_version_id);


--
-- Name: nc_sandbox_deployment_logs_workspace_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_deployment_logs_workspace_id_idx ON gestor.nc_managed_app_deployment_logs USING btree (fk_workspace_id);


--
-- Name: nc_sandbox_versions_workspace_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandbox_versions_workspace_id_idx ON gestor.nc_managed_app_versions USING btree (fk_workspace_id);


--
-- Name: nc_sandboxes_base_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_base_id_idx ON gestor.nc_managed_apps USING btree (base_id);


--
-- Name: nc_sandboxes_base_id_unique; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX nc_sandboxes_base_id_unique ON gestor.nc_managed_apps USING btree (base_id);


--
-- Name: nc_sandboxes_category_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_category_idx ON gestor.nc_managed_apps USING btree (category);


--
-- Name: nc_sandboxes_created_by_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_created_by_idx ON gestor.nc_managed_apps USING btree (created_by);


--
-- Name: nc_sandboxes_deleted_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_deleted_idx ON gestor.nc_managed_apps USING btree (deleted);


--
-- Name: nc_sandboxes_v2_created_by_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_v2_created_by_idx ON gestor.nc_sandboxes_v2 USING btree (created_by);


--
-- Name: nc_sandboxes_v2_master_base_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_v2_master_base_id_idx ON gestor.nc_sandboxes_v2 USING btree (master_base_id);


--
-- Name: nc_sandboxes_v2_sandbox_base_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_v2_sandbox_base_id_idx ON gestor.nc_sandboxes_v2 USING btree (sandbox_base_id);


--
-- Name: nc_sandboxes_v2_workspace_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_v2_workspace_id_idx ON gestor.nc_sandboxes_v2 USING btree (fk_workspace_id);


--
-- Name: nc_sandboxes_visibility_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_visibility_idx ON gestor.nc_managed_apps USING btree (visibility);


--
-- Name: nc_sandboxes_workspace_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sandboxes_workspace_id_idx ON gestor.nc_managed_apps USING btree (fk_workspace_id);


--
-- Name: nc_scim_config_fk_workspace_id_unique; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX nc_scim_config_fk_workspace_id_unique ON gestor.nc_scim_config USING btree (fk_workspace_id);


--
-- Name: nc_scim_config_workspace_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_scim_config_workspace_idx ON gestor.nc_scim_config USING btree (fk_workspace_id);


--
-- Name: nc_scripts_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_scripts_context ON gestor.nc_scripts USING btree (base_id, fk_workspace_id);


--
-- Name: nc_scripts_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_scripts_oldpk_idx ON gestor.nc_scripts USING btree (id);


--
-- Name: nc_snapshot_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_snapshot_context ON gestor.nc_snapshots USING btree (base_id, fk_workspace_id);


--
-- Name: nc_sort_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sort_v2_base_id_fk_workspace_id_index ON gestor.nc_sort_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_sort_v2_fk_column_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sort_v2_fk_column_id_index ON gestor.nc_sort_v2 USING btree (fk_column_id);


--
-- Name: nc_sort_v2_fk_level_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sort_v2_fk_level_id_index ON gestor.nc_sort_v2 USING btree (fk_level_id);


--
-- Name: nc_sort_v2_fk_view_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sort_v2_fk_view_id_index ON gestor.nc_sort_v2 USING btree (fk_view_id);


--
-- Name: nc_sort_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sort_v2_oldpk_idx ON gestor.nc_sort_v2 USING btree (id);


--
-- Name: nc_source_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_source_v2_base_id_fk_workspace_id_index ON gestor.nc_sources_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_source_v2_fk_integration_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_source_v2_fk_integration_id_index ON gestor.nc_sources_v2 USING btree (fk_integration_id);


--
-- Name: nc_source_v2_fk_sql_executor_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_source_v2_fk_sql_executor_id_index ON gestor.nc_sources_v2 USING btree (fk_sql_executor_id);


--
-- Name: nc_sources_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sources_v2_oldpk_idx ON gestor.nc_sources_v2 USING btree (id);


--
-- Name: nc_sso_client_domain_name_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sso_client_domain_name_index ON gestor.nc_sso_client USING btree (domain_name);


--
-- Name: nc_sso_client_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sso_client_fk_user_id_index ON gestor.nc_sso_client USING btree (fk_user_id);


--
-- Name: nc_sso_client_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sso_client_fk_workspace_id_index ON gestor.nc_sso_client USING btree (fk_org_id);


--
-- Name: nc_store_key_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_store_key_index ON gestor.nc_store USING btree (key);


--
-- Name: nc_subscriptions_org_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_subscriptions_org_idx ON gestor.nc_subscriptions USING btree (fk_org_id);


--
-- Name: nc_subscriptions_stripe_subscription_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_subscriptions_stripe_subscription_idx ON gestor.nc_subscriptions USING btree (stripe_subscription_id);


--
-- Name: nc_subscriptions_ws_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_subscriptions_ws_idx ON gestor.nc_subscriptions USING btree (fk_workspace_id);


--
-- Name: nc_sync_configs_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_configs_context ON gestor.nc_sync_configs USING btree (base_id, fk_workspace_id);


--
-- Name: nc_sync_configs_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_configs_oldpk_idx ON gestor.nc_sync_configs USING btree (id);


--
-- Name: nc_sync_configs_parent_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_configs_parent_idx ON gestor.nc_sync_configs USING btree (fk_parent_sync_config_id);


--
-- Name: nc_sync_logs_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_logs_v2_base_id_fk_workspace_id_index ON gestor.nc_sync_logs_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_sync_logs_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_logs_v2_oldpk_idx ON gestor.nc_sync_logs_v2 USING btree (id);


--
-- Name: nc_sync_mappings_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_mappings_context ON gestor.nc_sync_mappings USING btree (base_id, fk_workspace_id);


--
-- Name: nc_sync_mappings_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_mappings_oldpk_idx ON gestor.nc_sync_mappings USING btree (id);


--
-- Name: nc_sync_mappings_sync_config_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_mappings_sync_config_idx ON gestor.nc_sync_mappings USING btree (fk_sync_config_id);


--
-- Name: nc_sync_source_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_source_v2_base_id_fk_workspace_id_index ON gestor.nc_sync_source_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_sync_source_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_source_v2_oldpk_idx ON gestor.nc_sync_source_v2 USING btree (id);


--
-- Name: nc_sync_source_v2_source_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_sync_source_v2_source_id_index ON gestor.nc_sync_source_v2 USING btree (source_id);


--
-- Name: nc_teams_created_by_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_teams_created_by_idx ON gestor.nc_teams USING btree (created_by);


--
-- Name: nc_teams_org_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_teams_org_idx ON gestor.nc_teams USING btree (fk_org_id);


--
-- Name: nc_teams_scim_external_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_teams_scim_external_id_idx ON gestor.nc_teams USING btree (scim_external_id);


--
-- Name: nc_teams_scim_external_id_unique; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE UNIQUE INDEX nc_teams_scim_external_id_unique ON gestor.nc_teams USING btree (scim_external_id);


--
-- Name: nc_teams_scim_managed_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_teams_scim_managed_idx ON gestor.nc_teams USING btree (scim_managed);


--
-- Name: nc_teams_workspace_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_teams_workspace_idx ON gestor.nc_teams USING btree (fk_workspace_id);


--
-- Name: nc_usage_stats_ws_period_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_usage_stats_ws_period_idx ON gestor.nc_usage_stats USING btree (fk_workspace_id, period_start);


--
-- Name: nc_user_comment_notifications_preference_base_id_fk_workspace_i; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_user_comment_notifications_preference_base_id_fk_workspace_i ON gestor.nc_user_comment_notifications_preference USING btree (base_id, fk_workspace_id);


--
-- Name: nc_user_refresh_tokens_expires_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_user_refresh_tokens_expires_at_index ON gestor.nc_user_refresh_tokens USING btree (expires_at);


--
-- Name: nc_user_refresh_tokens_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_user_refresh_tokens_fk_user_id_index ON gestor.nc_user_refresh_tokens USING btree (fk_user_id);


--
-- Name: nc_user_refresh_tokens_token_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_user_refresh_tokens_token_index ON gestor.nc_user_refresh_tokens USING btree (token);


--
-- Name: nc_users_v2_canonical_email_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_users_v2_canonical_email_index ON gestor.nc_users_v2 USING btree (canonical_email);


--
-- Name: nc_users_v2_email_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_users_v2_email_index ON gestor.nc_users_v2 USING btree (email);


--
-- Name: nc_view_sections_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_view_sections_context ON gestor.nc_view_sections USING btree (base_id, fk_workspace_id);


--
-- Name: nc_view_sections_model_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_view_sections_model_idx ON gestor.nc_view_sections USING btree (fk_model_id);


--
-- Name: nc_views_v2_base_id_fk_workspace_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_views_v2_base_id_fk_workspace_id_index ON gestor.nc_views_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_views_v2_created_by_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_views_v2_created_by_index ON gestor.nc_views_v2 USING btree (created_by);


--
-- Name: nc_views_v2_fk_custom_url_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_views_v2_fk_custom_url_id_index ON gestor.nc_views_v2 USING btree (fk_custom_url_id);


--
-- Name: nc_views_v2_fk_model_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_views_v2_fk_model_id_index ON gestor.nc_views_v2 USING btree (fk_model_id);


--
-- Name: nc_views_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_views_v2_oldpk_idx ON gestor.nc_views_v2 USING btree (id);


--
-- Name: nc_views_v2_owned_by_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_views_v2_owned_by_index ON gestor.nc_views_v2 USING btree (owned_by);


--
-- Name: nc_widgets_context; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_widgets_context ON gestor.nc_widgets_v2 USING btree (base_id, fk_workspace_id);


--
-- Name: nc_widgets_dashboard_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_widgets_dashboard_idx ON gestor.nc_widgets_v2 USING btree (fk_dashboard_id);


--
-- Name: nc_widgets_v2_oldpk_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_widgets_v2_oldpk_idx ON gestor.nc_widgets_v2 USING btree (id);


--
-- Name: nc_workflow_executions_context_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_workflow_executions_context_idx ON gestor.nc_automation_executions USING btree (base_id, fk_workspace_id);


--
-- Name: nc_workflow_executions_workflow_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_workflow_executions_workflow_idx ON gestor.nc_automation_executions USING btree (fk_workflow_id);


--
-- Name: nc_workflows_context_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_workflows_context_idx ON gestor.nc_workflows USING btree (base_id, fk_workspace_id);


--
-- Name: nc_workspace_user_scim_external_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_workspace_user_scim_external_id_idx ON gestor.workspace_user USING btree (scim_external_id);


--
-- Name: nc_workspace_user_scim_managed_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX nc_workspace_user_scim_managed_idx ON gestor.workspace_user USING btree (scim_managed);


--
-- Name: notification_created_at_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX notification_created_at_index ON gestor.notification USING btree (created_at);


--
-- Name: notification_fk_user_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX notification_fk_user_id_index ON gestor.notification USING btree (fk_user_id);


--
-- Name: org_domain_fk_workspace_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX org_domain_fk_workspace_id_idx ON gestor.nc_org_domain USING btree (fk_workspace_id);


--
-- Name: share_uuid_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX share_uuid_idx ON gestor.nc_dashboards_v2 USING btree (uuid);


--
-- Name: sso_client_fk_workspace_id_idx; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX sso_client_fk_workspace_id_idx ON gestor.nc_sso_client USING btree (fk_workspace_id);


--
-- Name: sync_configs_integration_model; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX sync_configs_integration_model ON gestor.nc_sync_configs USING btree (fk_model_id, fk_integration_id);


--
-- Name: user_comments_preference_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX user_comments_preference_index ON gestor.nc_user_comment_notifications_preference USING btree (user_id, row_id, fk_model_id);


--
-- Name: workspace_fk_org_id_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX workspace_fk_org_id_index ON gestor.workspace USING btree (fk_org_id);


--
-- Name: workspace_user_invited_by_index; Type: INDEX; Schema: gestor; Owner: evolution
--

CREATE INDEX workspace_user_invited_by_index ON gestor.workspace_user USING btree (invited_by);


--
-- Name: AsistenteChat AsistenteChat_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."AsistenteChat"
    ADD CONSTRAINT "AsistenteChat_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id);


--
-- Name: CarteraCache CarteraCache_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."CarteraCache"
    ADD CONSTRAINT "CarteraCache_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: CarteraCache CarteraCache_integracionId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."CarteraCache"
    ADD CONSTRAINT "CarteraCache_integracionId_fkey" FOREIGN KEY ("integracionId") REFERENCES gestor."Integracion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Cartera Cartera_clienteId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cartera"
    ADD CONSTRAINT "Cartera_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES gestor."Cliente"(id);


--
-- Name: Cartera Cartera_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cartera"
    ADD CONSTRAINT "Cartera_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id);


--
-- Name: Cartera Cartera_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cartera"
    ADD CONSTRAINT "Cartera_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id);


--
-- Name: Cliente Cliente_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cliente"
    ADD CONSTRAINT "Cliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Cliente Cliente_listaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cliente"
    ADD CONSTRAINT "Cliente_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES gestor."ListaClientes"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Cliente Cliente_subEmpresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Cliente"
    ADD CONSTRAINT "Cliente_subEmpresaId_fkey" FOREIGN KEY ("subEmpresaId") REFERENCES gestor."SubEmpresa"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ComisionCalculo ComisionCalculo_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."ComisionCalculo"
    ADD CONSTRAINT "ComisionCalculo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ComisionConfig ComisionConfig_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."ComisionConfig"
    ADD CONSTRAINT "ComisionConfig_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ComisionConfig ComisionConfig_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."ComisionConfig"
    ADD CONSTRAINT "ComisionConfig_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DespachoLog DespachoLog_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."DespachoLog"
    ADD CONSTRAINT "DespachoLog_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: DetalleCartera DetalleCartera_carteraId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."DetalleCartera"
    ADD CONSTRAINT "DetalleCartera_carteraId_fkey" FOREIGN KEY ("carteraId") REFERENCES gestor."Cartera"(id);


--
-- Name: DetalleCartera DetalleCartera_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."DetalleCartera"
    ADD CONSTRAINT "DetalleCartera_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id);


--
-- Name: EmpleadoLista EmpleadoLista_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."EmpleadoLista"
    ADD CONSTRAINT "EmpleadoLista_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EmpleadoLista EmpleadoLista_listaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."EmpleadoLista"
    ADD CONSTRAINT "EmpleadoLista_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES gestor."ListaClientes"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Empleado Empleado_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Empleado"
    ADD CONSTRAINT "Empleado_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Empleado Empleado_subEmpresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Empleado"
    ADD CONSTRAINT "Empleado_subEmpresaId_fkey" FOREIGN KEY ("subEmpresaId") REFERENCES gestor."SubEmpresa"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: EmpresaVinculada EmpresaVinculada_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."EmpresaVinculada"
    ADD CONSTRAINT "EmpresaVinculada_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Integracion Integracion_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Integracion"
    ADD CONSTRAINT "Integracion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Integracion Integracion_subEmpresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Integracion"
    ADD CONSTRAINT "Integracion_subEmpresaId_fkey" FOREIGN KEY ("subEmpresaId") REFERENCES gestor."SubEmpresa"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MetaRecaudo MetaRecaudo_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaRecaudo"
    ADD CONSTRAINT "MetaRecaudo_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MetaRecaudo MetaRecaudo_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaRecaudo"
    ADD CONSTRAINT "MetaRecaudo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MetaVenta MetaVenta_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaVenta"
    ADD CONSTRAINT "MetaVenta_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MetaVenta MetaVenta_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."MetaVenta"
    ADD CONSTRAINT "MetaVenta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrdenDespacho OrdenDespacho_alistadoPorId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."OrdenDespacho"
    ADD CONSTRAINT "OrdenDespacho_alistadoPorId_fkey" FOREIGN KEY ("alistadoPorId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrdenDespacho OrdenDespacho_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."OrdenDespacho"
    ADD CONSTRAINT "OrdenDespacho_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OrdenDespacho OrdenDespacho_origenVinculadaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."OrdenDespacho"
    ADD CONSTRAINT "OrdenDespacho_origenVinculadaId_fkey" FOREIGN KEY ("origenVinculadaId") REFERENCES gestor."EmpresaVinculada"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OrdenDespacho OrdenDespacho_repartidorId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."OrdenDespacho"
    ADD CONSTRAINT "OrdenDespacho_repartidorId_fkey" FOREIGN KEY ("repartidorId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PagoCarteraDeuda PagoCarteraDeuda_pagoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PagoCarteraDeuda"
    ADD CONSTRAINT "PagoCarteraDeuda_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES gestor."PagoCartera"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PagoCartera PagoCartera_carteraId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PagoCartera"
    ADD CONSTRAINT "PagoCartera_carteraId_fkey" FOREIGN KEY ("carteraId") REFERENCES gestor."Cartera"(id);


--
-- Name: PagoCartera PagoCartera_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."PagoCartera"
    ADD CONSTRAINT "PagoCartera_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id);


--
-- Name: RutaCliente RutaCliente_clienteId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaCliente"
    ADD CONSTRAINT "RutaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES gestor."Cliente"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaCliente RutaCliente_rutaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaCliente"
    ADD CONSTRAINT "RutaCliente_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES gestor."Ruta"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaEmpleado RutaEmpleado_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaEmpleado"
    ADD CONSTRAINT "RutaEmpleado_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaEmpleado RutaEmpleado_rutaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaEmpleado"
    ADD CONSTRAINT "RutaEmpleado_rutaId_fkey" FOREIGN KEY ("rutaId") REFERENCES gestor."Ruta"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaFijaCliente RutaFijaCliente_clienteId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFijaCliente"
    ADD CONSTRAINT "RutaFijaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES gestor."Cliente"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaFijaCliente RutaFijaCliente_rutaFijaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFijaCliente"
    ADD CONSTRAINT "RutaFijaCliente_rutaFijaId_fkey" FOREIGN KEY ("rutaFijaId") REFERENCES gestor."RutaFija"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaFijaEmpleado RutaFijaEmpleado_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFijaEmpleado"
    ADD CONSTRAINT "RutaFijaEmpleado_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaFijaEmpleado RutaFijaEmpleado_rutaFijaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFijaEmpleado"
    ADD CONSTRAINT "RutaFijaEmpleado_rutaFijaId_fkey" FOREIGN KEY ("rutaFijaId") REFERENCES gestor."RutaFija"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaFija RutaFija_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFija"
    ADD CONSTRAINT "RutaFija_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RutaFija RutaFija_subEmpresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."RutaFija"
    ADD CONSTRAINT "RutaFija_subEmpresaId_fkey" FOREIGN KEY ("subEmpresaId") REFERENCES gestor."SubEmpresa"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ruta Ruta_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Ruta"
    ADD CONSTRAINT "Ruta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Ruta Ruta_empresaVinculadaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Ruta"
    ADD CONSTRAINT "Ruta_empresaVinculadaId_fkey" FOREIGN KEY ("empresaVinculadaId") REFERENCES gestor."EmpresaVinculada"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Ruta Ruta_subEmpresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Ruta"
    ADD CONSTRAINT "Ruta_subEmpresaId_fkey" FOREIGN KEY ("subEmpresaId") REFERENCES gestor."SubEmpresa"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SubEmpresa SubEmpresa_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SubEmpresa"
    ADD CONSTRAINT "SubEmpresa_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SupervisorVendedor SupervisorVendedor_supervisorId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SupervisorVendedor"
    ADD CONSTRAINT "SupervisorVendedor_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SupervisorVendedor SupervisorVendedor_vendedorId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SupervisorVendedor"
    ADD CONSTRAINT "SupervisorVendedor_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SyncCompra SyncCompra_integracionId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncCompra"
    ADD CONSTRAINT "SyncCompra_integracionId_fkey" FOREIGN KEY ("integracionId") REFERENCES gestor."Integracion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SyncDeuda SyncDeuda_integracionId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncDeuda"
    ADD CONSTRAINT "SyncDeuda_integracionId_fkey" FOREIGN KEY ("integracionId") REFERENCES gestor."Integracion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SyncEmpleado SyncEmpleado_integracionId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncEmpleado"
    ADD CONSTRAINT "SyncEmpleado_integracionId_fkey" FOREIGN KEY ("integracionId") REFERENCES gestor."Integracion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SyncLog SyncLog_integracionId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."SyncLog"
    ADD CONSTRAINT "SyncLog_integracionId_fkey" FOREIGN KEY ("integracionId") REFERENCES gestor."Integracion"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Turno Turno_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Turno"
    ADD CONSTRAINT "Turno_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VentaMesCliente VentaMesCliente_clienteId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."VentaMesCliente"
    ADD CONSTRAINT "VentaMesCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES gestor."Cliente"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: VentaMesCliente VentaMesCliente_empresaId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."VentaMesCliente"
    ADD CONSTRAINT "VentaMesCliente_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES gestor."Empresa"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Visita Visita_clienteId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Visita"
    ADD CONSTRAINT "Visita_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES gestor."Cliente"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Visita Visita_empleadoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Visita"
    ADD CONSTRAINT "Visita_empleadoId_fkey" FOREIGN KEY ("empleadoId") REFERENCES gestor."Empleado"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Visita Visita_ordenDespachoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Visita"
    ADD CONSTRAINT "Visita_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES gestor."OrdenDespacho"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Visita Visita_turnoId_fkey; Type: FK CONSTRAINT; Schema: gestor; Owner: evolution
--

ALTER TABLE ONLY gestor."Visita"
    ADD CONSTRAINT "Visita_turnoId_fkey" FOREIGN KEY ("turnoId") REFERENCES gestor."Turno"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict eqcp0l61gf2RDXpC8v8qLDBq4UGzrd6qtEnHDOMXpUZrv6l2mTWbNbx3gUfIpcz

