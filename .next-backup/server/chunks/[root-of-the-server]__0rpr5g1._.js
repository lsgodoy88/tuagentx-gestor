module.exports=[193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},924868,(e,t,r)=>{t.exports=e.x("fs/promises",()=>require("fs/promises"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},870722,(e,t,r)=>{t.exports=e.x("tty",()=>require("tty"))},233405,(e,t,r)=>{t.exports=e.x("child_process",()=>require("child_process"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},500874,(e,t,r)=>{t.exports=e.x("buffer",()=>require("buffer"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},449719,(e,t,r)=>{t.exports=e.x("assert",()=>require("assert"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},338656,e=>{"use strict";let t=["empresa","supervisor"];e.s(["ROLES_ADMIN",0,t,"ROLES_ADMIN_BODEGA",0,["empresa","supervisor","bodega"],"ROLES_ADMIN_VENDEDOR",0,["empresa","supervisor","vendedor"],"ROLES_VENDEDOR_RUTAS",0,["empresa","supervisor","vendedor","impulsadora"],"empleadoCampoScope",0,function(e,r=[]){let a=e?.role==="vendedor"||e?.role==="impulsadora";return{permitido:[...t,...r].includes(e?.role)||a,empleadoIdForzado:a?e.id:null,esEmpleadoCampo:a}},"getEmpresaId",0,function(e){return"empresa"===e.role?e.id:e.empresaId},"vendedorScope",0,function(e,r=[]){let a=e?.role==="vendedor";return{permitido:[...t,...r].includes(e?.role)||a,empleadoIdForzado:a?e.id:null,isVendedor:a}}])},70679,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),o=e.i(759756),s=e.i(561916),n=e.i(174677),i=e.i(869741),d=e.i(316795),l=e.i(487718),p=e.i(995169),u=e.i(47587),c=e.i(666012),m=e.i(570101),R=e.i(626937),E=e.i(10372),N=e.i(193695);e.i(52474);var h=e.i(600220),O=e.i(89171),T=e.i(757660),x=e.i(368105),v=e.i(15270);let A=process.env.DB_SCHEMA||"gestor";async function _(e){let t=new Date,r=e??`${t.getFullYear()}-${String(t.getMonth()).padStart(2,"0")}`;console.log(`[snapshot-mes] Cerrando mes ${r}`);let a=await v.prisma.$queryRawUnsafe(`
    INSERT INTO ${A}."SnapshotMes" (id, empresa_id, mes, tipo, vendedor_api_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      od."empresaId",
      $1,
      'ventas',
      od."vendedorApiId",
      COALESCE(e.nombre, 'Sin asignar'),
      jsonb_build_object(
        'total',   SUM(od."totalOrden")::float,
        'ordenes', COUNT(*)::int,
        'meta',    COALESCE(MAX(mv."metaPesos")::float, 0)
      ),
      NOW(), NOW()
    FROM ${A}."OrdenDespacho" od
    LEFT JOIN ${A}."Empleado" e ON e."vendedorId" = od."vendedorApiId" AND e."empresaId" = od."empresaId"
    LEFT JOIN ${A}."MetaVenta" mv ON mv."empleadoId" = e.id
      AND mv.mes = EXTRACT(MONTH FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
      AND mv.anio = EXTRACT(YEAR  FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
    WHERE od."isActiva" = true
      AND od."isFacturada" = true
      AND TO_CHAR(od."fechaFactura" AT TIME ZONE 'America/Bogota', 'YYYY-MM') = $1
    GROUP BY od."empresaId", od."vendedorApiId", COALESCE(e.nombre, 'Sin asignar')
    ON CONFLICT DO NOTHING
    RETURNING id
  `,r),o=await v.prisma.$queryRawUnsafe(`
    INSERT INTO ${A}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      e."empresaId",
      $1,
      'recaudo',
      v."empleadoId",
      e.nombre,
      jsonb_build_object(
        'total',  SUM(v.monto)::float,
        'cobros', COUNT(*)::int,
        'meta',   COALESCE(MAX(mr."metaPesos")::float, 0)
      ),
      NOW(), NOW()
    FROM ${A}."Visita" v
    JOIN ${A}."Empleado" e ON e.id = v."empleadoId"
    LEFT JOIN ${A}."MetaRecaudo" mr ON mr."empleadoId" = e.id
      AND mr.mes = EXTRACT(MONTH FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
      AND mr.anio = EXTRACT(YEAR  FROM DATE_TRUNC('month', TO_DATE($1, 'YYYY-MM')))::int
    WHERE v.tipo = 'cobro'
      AND TO_CHAR(DATE_TRUNC('month', v."fechaBogota" AT TIME ZONE 'America/Bogota'), 'YYYY-MM') = $1
    GROUP BY e."empresaId", v."empleadoId", e.nombre
    ON CONFLICT DO NOTHING
    RETURNING id
  `,r),s=Array.isArray(a)?a.length:0,n=Array.isArray(o)?o.length:0,i=await v.prisma.$queryRawUnsafe(`
    INSERT INTO ${A}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      e."empresaId",
      $1,
      'descuento',
      p."empleadoId",
      e.nombre,
      jsonb_build_object('total', SUM(p.descuento)::float, 'pagos', COUNT(*)::int),
      NOW(), NOW()
    FROM ${A}."PagoCartera" p
    JOIN ${A}."Empleado" e ON e.id = p."empleadoId"
    WHERE p.descuento > 0
      AND TO_CHAR(DATE_TRUNC('month', p."createdAt" AT TIME ZONE 'America/Bogota'), 'YYYY-MM') = $1
    GROUP BY e."empresaId", p."empleadoId", e.nombre
    ON CONFLICT DO NOTHING
    RETURNING id
  `,r),d=Array.isArray(i)?i.length:0,l=await v.prisma.$queryRawUnsafe(`
    INSERT INTO ${A}."SnapshotMes" (id, empresa_id, mes, tipo, empleado_id, vendedor_api_id, entidad_nombre, datos, creado_en, updated_en)
    SELECT
      gen_random_uuid()::text,
      cc."empresaId",
      $1,
      'cartera',
      e.id,
      cc."empleadoExternalId",
      cc."empleadoNombre",
      jsonb_build_object(
        'total',     SUM(cc."saldoTotal")::float,
        'pendiente', SUM(cc."saldoPendiente")::float,
        'clientes',  COUNT(*)::int
      ),
      NOW(), NOW()
    FROM ${A}."CarteraCache" cc
    LEFT JOIN ${A}."Empleado" e ON e."apiId" = cc."empleadoExternalId" AND e."empresaId" = cc."empresaId"
    WHERE cc."saldoTotal" > 0
    GROUP BY cc."empresaId", cc."empleadoExternalId", cc."empleadoNombre", e.id
    ON CONFLICT DO NOTHING
    RETURNING id
  `,r),p=Array.isArray(l)?l.length:0;return console.log(`[snapshot-mes] ✓ mes=${r} ventas=${s} recaudo=${n} descuento=${d} cartera=${p}`),{mes:r,ventas:s,recaudo:n,descuento:d,cartera:p}}var C=e.i(338656);async function I(e){if(e.headers.get("x-cron-secret")!==process.env.CRON_SECRET){let e=await (0,T.getServerSession)(x.authOptions),t=e?.user;if(!t||!C.ROLES_ADMIN.includes(t.role))return O.NextResponse.json({error:"No autorizado"},{status:401})}let{searchParams:t}=new URL(e.url),r=t.get("mes")??void 0;try{let e=await _(r);return O.NextResponse.json({ok:!0,...e})}catch(e){return console.error("[snapshot-mes]",e),O.NextResponse.json({error:e.message},{status:500})}}e.s(["POST",0,I],605477);var g=e.i(605477);let f=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/stats/snapshot-mes/route",pathname:"/api/stats/snapshot-mes",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/stats/snapshot-mes/route.ts",nextConfigOutput:"",userland:g,...{}}),{workAsyncStorage:M,workUnitAsyncStorage:S,serverHooks:b}=f;async function w(e,t,a){a.requestMeta&&(0,o.setRequestMeta)(e,a.requestMeta),f.isDev&&(0,o.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let O="/api/stats/snapshot-mes/route";O=O.replace(/\/index$/,"")||"/";let T=await f.prepare(e,t,{srcPage:O,multiZoneDraftMode:!1});if(!T)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:x,deploymentId:v,params:A,nextConfig:_,parsedUrl:C,isDraftMode:I,prerenderManifest:g,routerServerContext:M,isOnDemandRevalidate:S,revalidateOnlyGenerated:b,resolvedPathname:w,clientReferenceManifest:y,serverActionsManifest:D}=T,$=(0,i.normalizeAppPath)(O),U=!!(g.dynamicRoutes[$]||g.routes[w]),q=async()=>((null==M?void 0:M.render404)?await M.render404(e,t,C,!1):t.end("This page could not be found"),null);if(U&&!I){let e=!!g.routes[w],t=g.dynamicRoutes[$];if(t&&!1===t.fallback&&!e){if(_.adapterPath)return await q();throw new N.NoFallbackError}}let Y=null;!U||f.isDev||I||(Y="/index"===(Y=w)?"/":Y);let P=!0===f.isDev||!U,H=U&&!P;D&&y&&(0,n.setManifestsSingleton)({page:O,clientReferenceManifest:y,serverActionsManifest:D});let F=e.method||"GET",j=(0,s.getTracer)(),L=j.getActiveScopeSpan(),k=!!(null==M?void 0:M.isWrappedByNextServer),B=!!(0,o.getRequestMeta)(e,"minimalMode"),G=(0,o.getRequestMeta)(e,"incrementalCache")||await f.getIncrementalCache(e,_,g,B);null==G||G.resetRequestCache(),globalThis.__incrementalCache=G;let W={params:A,previewProps:g.preview,renderOpts:{experimental:{authInterrupts:!!_.experimental.authInterrupts},cacheComponents:!!_.cacheComponents,supportsDynamicResponse:P,incrementalCache:G,cacheLifeProfiles:_.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,o)=>f.onRequestError(e,t,a,o,M)},sharedContext:{buildId:x,deploymentId:v}},X=new d.NodeNextRequest(e),K=new d.NodeNextResponse(t),V=l.NextRequestAdapter.fromNodeNextRequest(X,(0,l.signalFromNodeResponse)(t));try{let o,n=async e=>f.handle(V,W).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=j.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==p.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${F} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t),o&&o!==e&&(o.setAttribute("http.route",a),o.updateName(t))}else e.updateName(`${F} ${O}`)}),i=async o=>{var s,i;let d=async({previousCacheEntry:r})=>{try{if(!B&&S&&b&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let s=await n(o);e.fetchMetrics=W.renderOpts.fetchMetrics;let i=W.renderOpts.pendingWaitUntil;i&&a.waitUntil&&(a.waitUntil(i),i=void 0);let d=W.renderOpts.collectedTags;if(!U)return await (0,c.sendResponse)(X,K,s,W.renderOpts.pendingWaitUntil),null;{let e=await s.blob(),t=(0,m.toNodeOutgoingHttpHeaders)(s.headers);d&&(t[E.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==W.renderOpts.collectedRevalidate&&!(W.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&W.renderOpts.collectedRevalidate,a=void 0===W.renderOpts.collectedExpire||W.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:W.renderOpts.collectedExpire;return{value:{kind:h.CachedRouteKind.APP_ROUTE,status:s.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await f.onRequestError(e,t,{routerKind:"App Router",routePath:O,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:S})},!1,M),t}},l=await f.handleResponse({req:e,nextConfig:_,cacheKey:Y,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:g,isRoutePPREnabled:!1,isOnDemandRevalidate:S,revalidateOnlyGenerated:b,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:B});if(!U)return null;if((null==l||null==(s=l.value)?void 0:s.kind)!==h.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(i=l.value)?void 0:i.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});B||t.setHeader("x-nextjs-cache",S?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),I&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let p=(0,m.fromNodeOutgoingHttpHeaders)(l.value.headers);return B&&U||p.delete(E.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||t.getHeader("Cache-Control")||p.get("Cache-Control")||p.set("Cache-Control",(0,R.getCacheControlHeader)(l.cacheControl)),await (0,c.sendResponse)(X,K,new Response(l.value.body,{headers:p,status:l.value.status||200})),null};k&&L?await i(L):(o=j.getActiveScopeSpan(),await j.withPropagatedContext(e.headers,()=>j.trace(p.BaseServerSpan.handleRequest,{spanName:`${F} ${O}`,kind:s.SpanKind.SERVER,attributes:{"http.method":F,"http.target":e.url}},i),void 0,!k))}catch(t){if(t instanceof N.NoFallbackError||await f.onRequestError(e,t,{routerKind:"App Router",routePath:$,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:S})},!1,M),U)throw t;return await (0,c.sendResponse)(X,K,new Response(null,{status:500})),null}}e.s(["handler",0,w,"patchFetch",0,function(){return(0,a.patchFetch)({workAsyncStorage:M,workUnitAsyncStorage:S})},"routeModule",0,f,"serverHooks",0,b,"workAsyncStorage",0,M,"workUnitAsyncStorage",0,S],70679)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0rpr5g1._.js.map